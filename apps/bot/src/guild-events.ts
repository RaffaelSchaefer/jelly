import {
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  PermissionsBitField,
  ThreadAutoArchiveDuration,
  type Client,
  type FetchGuildScheduledEventSubscribersOptions,
  type GuildTextBasedChannel,
  type GuildScheduledEventCreateOptions,
  type Message,
  type PublicThreadChannel,
} from "discord.js";
import { env } from "./env";
import type { JointEvent } from "./events";
import { eventToEmbed, htmlToText, isChannelId } from "./embeds";

type GuildEventDetails = Pick<
  JointEvent,
  | "title"
  | "description"
  | "location"
  | "startsAt"
  | "endsAt"
  | "type"
  | "game"
  | "gameUrl"
  | "playersWanted"
>;

export function syncEnabled(): boolean {
  return Boolean(env.guildId);
}

function targetGuild(client: Client) {
  if (!env.guildId) return null;
  return client.guilds.fetch(env.guildId).catch(() => null);
}

export const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function clamp(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

function guildEventOptions(
  event: GuildEventDetails,
  image: Buffer | null,
): GuildScheduledEventCreateOptions {
  const isVoice = isChannelId(event.location);
  const startsAt = new Date(event.startsAt);
  const endsAt = event.endsAt
    ? new Date(event.endsAt)
    : new Date(startsAt.getTime() + DEFAULT_DURATION_MS);
  const description = clamp(
    [
      event.type === "game" ? `🎮 ${event.game}` : "",
      event.type === "game" && event.playersWanted
        ? `👥 ${event.playersWanted} Mitspieler gesucht`
        : "",
      event.type === "game" ? event.gameUrl : "",
      htmlToText(event.description),
    ]
      .filter(Boolean)
      .join("\n"),
    1000,
  );
  const externalLocation =
    event.type === "game" && event.game ? `Online · ${event.game}` : event.location;

  return {
    name: clamp(event.title, 100),
    ...(description ? { description } : {}),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: isVoice
      ? GuildScheduledEventEntityType.Voice
      : GuildScheduledEventEntityType.External,
    scheduledStartTime: startsAt,
    scheduledEndTime: endsAt,
    image,
    ...(isVoice
      ? { channel: event.location }
      : {
          entityMetadata: {
            location: clamp(externalLocation || "Ort wird bekannt gegeben", 100),
          },
        }),
  };
}

const GAME_THREAD_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.ManageThreads,
];

export async function resolveGameThreadChannel(client: Client): Promise<GuildTextBasedChannel> {
  if (!env.guildId) {
    throw new Error("Für Game-Events muss DISCORD_GUILD_ID gesetzt sein.");
  }
  if (!env.announceChannelId) {
    throw new Error("Für Game-Events muss ANNOUNCE_CHANNEL_ID gesetzt sein.");
  }

  const channel = await client.channels.fetch(env.announceChannelId);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new Error("Der Announce-Channel muss ein threadfähiger Server-Textkanal sein.");
  }
  if (channel.guildId !== env.guildId) {
    throw new Error("Announce-Channel und DISCORD_GUILD_ID müssen zum selben Server gehören.");
  }

  const me = channel.guild.members.me ?? client.user;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions || !GAME_THREAD_PERMISSIONS.every((permission) => permissions.has(permission))) {
    throw new Error(
      "Im Announce-Channel fehlen Rechte zum Senden, Einbetten oder Verwalten öffentlicher Threads.",
    );
  }

  return channel;
}

export interface GameThreadResources {
  message: Message<true>;
  thread: PublicThreadChannel<false>;
}

export async function deleteGameThreadResources(
  resources: Partial<GameThreadResources>,
): Promise<boolean> {
  let removed = true;
  if (resources.thread) {
    try {
      await resources.thread.delete("Game-Event-Erstellung zurückgerollt");
    } catch (error) {
      removed = false;
      console.error(`[joint-bot] Verwaister Game-Thread: ${resources.thread.id}`, error);
    }
  }
  if (resources.message) {
    try {
      await resources.message.delete();
    } catch (error) {
      removed = false;
      console.error(`[joint-bot] Verwaiste Game-Ankündigung: ${resources.message.id}`, error);
    }
  }
  return removed;
}

export async function createGameThread(
  channel: GuildTextBasedChannel,
  event: JointEvent,
  banner: { buffer: Buffer; name: string } | null = null,
): Promise<GameThreadResources> {
  const resources: Partial<GameThreadResources> = {};

  try {
    const announcedEvent = banner ? { ...event, bannerUrl: `attachment://${banner.name}` } : event;
    resources.message = await channel.send({
      embeds: [eventToEmbed(announcedEvent, 0)],
      ...(banner ? { files: [{ attachment: banner.buffer, name: banner.name }] } : {}),
    });
    resources.thread = await resources.message.startThread({
      name: clamp(`🎮 ${event.game} — ${event.title}`, 100),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: `Koordination für Game-Event ${event.title}`,
    });
    await resources.thread.members.add(event.discordCreatorId);
    await resources.thread.send({
      content:
        "Organisiert hier Lobby, Server und Teams. Interesse bitte über das verlinkte Discord-Event markieren.",
    });
    return resources as GameThreadResources;
  } catch (error) {
    await deleteGameThreadResources(resources);
    throw error;
  }
}

async function fetchGameThread(client: Client, event: JointEvent) {
  if (event.type !== "game" || !event.discordThreadId) return null;
  const channel = await client.channels.fetch(event.discordThreadId);
  return channel?.isThread() ? channel : null;
}

export async function syncGameThreadMember(
  client: Client,
  event: JointEvent,
  discordUserId: string,
  joined: boolean,
): Promise<void> {
  const thread = await fetchGameThread(client, event);
  if (!thread) return;
  if (thread.archived) await thread.setArchived(false, "Game-Teilnehmer aktualisiert");

  if (joined || discordUserId === event.discordCreatorId) {
    await thread.members.add(discordUserId);
  } else {
    await thread.members.remove(discordUserId);
  }
}

export async function reconcileGameThreadMembers(
  client: Client,
  event: JointEvent,
  discordUserIds: Iterable<string>,
): Promise<void> {
  const thread = await fetchGameThread(client, event);
  if (!thread) return;

  const expected = new Set(discordUserIds);
  expected.add(event.discordCreatorId);
  if (client.user) expected.add(client.user.id);

  const members = await thread.members.fetch();
  const add = [...expected].filter((discordUserId) => !members.has(discordUserId));
  const remove = [...members.keys()].filter((discordUserId) => !expected.has(discordUserId));
  if (add.length === 0 && remove.length === 0) return;
  if (thread.archived) await thread.setArchived(false, "Game-Teilnehmer abgeglichen");

  for (const discordUserId of add) await thread.members.add(discordUserId);
  for (const discordUserId of remove) await thread.members.remove(discordUserId);
}

export async function closeGameThread(client: Client, event: JointEvent): Promise<void> {
  try {
    const thread = await fetchGameThread(client, event);
    if (!thread || (thread.archived && thread.locked)) return;
    if (thread.archived) await thread.setArchived(false, "Game-Event geschlossen");
    if (!thread.locked) await thread.setLocked(true, "Game-Event geschlossen");
    await thread.setArchived(true, "Game-Event geschlossen");
  } catch (error) {
    console.warn(`[joint-bot] Game-Thread konnte nicht geschlossen werden: ${event.title}`, error);
  }
}

async function fetchBannerImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Banner konnte nicht geladen werden (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

export async function createGuildEvent(
  client: Client,
  event: GuildEventDetails,
  image: Buffer | null = null,
): Promise<string | null> {
  const guild = await targetGuild(client);
  if (!guild) return null;

  try {
    const created = await guild.scheduledEvents.create(guildEventOptions(event, image));
    return created.id;
  } catch (error) {
    console.error("[joint-bot] Discord Server-Event konnte nicht erstellt werden:", error);
    return null;
  }
}

export async function updateGuildEvent(client: Client, event: JointEvent): Promise<void> {
  const guild = await targetGuild(client);
  if (!guild || !event.discordGuildEventId) return;

  try {
    const image = event.bannerUrl ? await fetchBannerImage(event.bannerUrl) : null;
    await guild.scheduledEvents.edit(event.discordGuildEventId, {
      ...guildEventOptions(event, image),
      ...(!isChannelId(event.location) ? { channel: null } : {}),
    });
  } catch (error) {
    console.warn("[joint-bot] Server-Event update übersprungen:", error);
  }
}

export async function fetchGuildEventSubscriberIds(
  client: Client,
  discordGuildEventId: string,
): Promise<string[]> {
  const guild = await targetGuild(client);
  if (!guild) throw new Error("Discord-Guild nicht erreichbar");

  const ids: string[] = [];
  let after: string | undefined;

  while (true) {
    // discord.js supports Discord's before/after parameters at runtime,
    // but 14.27 omits them from this public options type.
    const options: FetchGuildScheduledEventSubscribersOptions & { after?: string } = {
      limit: 100,
      ...(after ? { after } : {}),
    };
    const subscribers = await guild.scheduledEvents.fetchSubscribers(discordGuildEventId, options);
    ids.push(...subscribers.keys());

    if (subscribers.size < 100) return ids;
    const nextAfter = [...subscribers.keys()].at(-1);
    if (!nextAfter || nextAfter === after) return ids;
    after = nextAfter;
  }
}

export function shouldAutoStart(event: JointEvent, now: Date): boolean {
  if (event.isCanceled || !event.discordGuildEventId || !isChannelId(event.location)) {
    return false;
  }

  const startsAt = Date.parse(event.startsAt);
  const endsAt = event.endsAt ? Date.parse(event.endsAt) : startsAt + DEFAULT_DURATION_MS;
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= +now && +now < endsAt;
}

export async function startGuildEvent(client: Client, event: JointEvent): Promise<void> {
  const guild = await targetGuild(client);
  if (!guild || !shouldAutoStart(event, new Date())) return;

  try {
    const guildEvent = await guild.scheduledEvents.fetch(event.discordGuildEventId);
    if (
      guildEvent.status === GuildScheduledEventStatus.Scheduled &&
      guildEvent.entityType === GuildScheduledEventEntityType.Voice
    ) {
      await guild.scheduledEvents.edit(guildEvent, {
        status: GuildScheduledEventStatus.Active,
      });
      console.log(`[joint-bot] Server-Event automatisch gestartet: ${event.title}`);
    }
  } catch (error) {
    console.warn("[joint-bot] Server-Event auto-start übersprungen:", error);
  }
}

export async function cancelGuildEvent(client: Client, discordGuildEventId: string): Promise<void> {
  const guild = await targetGuild(client);
  if (!guild) return;

  try {
    await guild.scheduledEvents.edit(discordGuildEventId, {
      status: GuildScheduledEventStatus.Canceled,
    });
  } catch (error) {
    console.warn("[joint-bot] Server-Event cancel übersprungen:", error);
  }
}

export async function deleteGuildEvent(
  client: Client,
  discordGuildEventId: string,
): Promise<boolean> {
  const guild = await targetGuild(client);
  if (!guild) return false;

  try {
    await guild.scheduledEvents.delete(discordGuildEventId);
    return true;
  } catch (error) {
    console.warn("[joint-bot] Server-Event delete übersprungen:", error);
    return false;
  }
}
