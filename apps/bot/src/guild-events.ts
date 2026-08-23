import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  type Client,
  type FetchGuildScheduledEventSubscribersOptions,
  type GuildScheduledEventCreateOptions,
} from "discord.js";
import { env } from "./env";
import type { JointEvent } from "./events";
import { htmlToText, isChannelId } from "./embeds";

type GuildEventDetails = Pick<
  JointEvent,
  "title" | "description" | "location" | "startsAt" | "endsAt"
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
  const description = clamp(htmlToText(event.description), 1000);

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
      : { entityMetadata: { location: event.location || "Ort wird bekannt gegeben" } }),
  };
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
