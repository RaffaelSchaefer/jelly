import { env } from "./env";
import {
  addEventAttendee,
  findEventByDiscordGuildEventId,
  getEventAttendeeCounts,
  listAllEvents,
  listAutoStartCandidates,
  listLinkedCurrentEvents,
  reconcileEventAttendees,
  removeEventAttendee,
  setEventLinks,
  toJointEvent,
  type JointEvent,
} from "./events";
import { eventToEmbed } from "./embeds";
import {
  cancelGuildEvent,
  closeGameThread,
  createGuildEvent,
  deleteGuildEvent,
  fetchGuildEventSubscriberIds,
  reconcileGameThreadMembers,
  shouldAutoStart,
  startGuildEvent,
  syncGameThreadMember,
  syncEnabled,
  updateGuildEvent,
} from "./guild-events";
import { ensureSuperuser, hasSuperuser, pb } from "./pocketbase";
import { Events as DiscordEvents, type Client } from "discord.js";

const announced = new Set<string>();
const lastCanceled = new Map<string, boolean>();
const linking = new Set<string>();

async function seedState(): Promise<void> {
  try {
    const events = await listAllEvents();
    for (const event of events) {
      if (!event.isCanceled && Date.parse(event.startsAt) > Date.now()) {
        announced.add(event.id);
      }
      lastCanceled.set(event.id, event.isCanceled);
    }
  } catch (error) {
    console.warn("[joint-bot] Konnte bestehende Events nicht laden:", error);
  }
}

async function announce(client: Client, event: JointEvent): Promise<void> {
  if (!env.announceChannelId || announced.has(event.id)) return;

  const channel = await client.channels.fetch(env.announceChannelId);
  if (!channel || !("send" in channel)) {
    console.warn(`[joint-bot] Announce-Channel ${env.announceChannelId} nicht gefunden`);
    return;
  }

  const counts = await getEventAttendeeCounts([event]);
  await channel.send({ embeds: [eventToEmbed(event, counts.get(event.id) ?? 0)] });
  announced.add(event.id);
  console.log(`[joint-bot] Event angekündigt: ${event.title}`);
}

async function fetchBanner(event: JointEvent): Promise<Buffer | null> {
  if (!event.bannerUrl) return null;

  try {
    const response = await fetch(event.bannerUrl);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function linkEventToGuild(client: Client, event: JointEvent): Promise<void> {
  if (linking.has(event.id)) return;
  linking.add(event.id);

  try {
    const guildEventId = await createGuildEvent(client, event, await fetchBanner(event));
    if (!guildEventId) {
      await announce(client, event);
      return;
    }

    try {
      await setEventLinks(event.id, { discordGuildEventId: guildEventId });
    } catch (error) {
      await deleteGuildEvent(client, guildEventId);
      throw error;
    }
    console.log(`[joint-bot] Web-Event verlinkt: ${event.title}`);
  } finally {
    linking.delete(event.id);
  }
}

async function handleGuildEventUser(
  client: Client,
  guildEventId: string,
  discordUserId: string,
  joined: boolean,
): Promise<void> {
  const event = await findEventByDiscordGuildEventId(guildEventId);
  if (!event) return;

  if (joined) {
    await addEventAttendee(event.id, discordUserId);
  } else {
    await removeEventAttendee(event.id, discordUserId);
  }
  await syncGameThreadMember(client, event, discordUserId, joined);
}

async function reconcileDiscordAttendees(client: Client): Promise<void> {
  const events = await listLinkedCurrentEvents();

  for (const event of events) {
    try {
      const discordUserIds = await fetchGuildEventSubscriberIds(client, event.discordGuildEventId);
      await reconcileEventAttendees(event.id, discordUserIds);
      if (event.type === "game") {
        await reconcileGameThreadMembers(client, event, discordUserIds);
      }
    } catch (error) {
      console.warn(`[joint-bot] Teilnehmer-Sync übersprungen: ${event.title}`, error);
    }
  }
}

async function startDueVoiceEvents(client: Client): Promise<void> {
  const now = new Date();
  const events = await listAutoStartCandidates(now);
  for (const event of events) {
    if (shouldAutoStart(event, now)) await startGuildEvent(client, event);
  }
}

async function startDiscordAttendanceSync(client: Client): Promise<void> {
  client.on(DiscordEvents.GuildScheduledEventUserAdd, (guildEvent, user) => {
    void handleGuildEventUser(client, guildEvent.id, user.id, true).catch((error) => {
      console.error("[joint-bot] Teilnehmer konnte nicht hinzugefügt werden:", error);
    });
  });
  client.on(DiscordEvents.GuildScheduledEventUserRemove, (guildEvent, user) => {
    void handleGuildEventUser(client, guildEvent.id, user.id, false).catch((error) => {
      console.error("[joint-bot] Teilnehmer konnte nicht entfernt werden:", error);
    });
  });

  await reconcileDiscordAttendees(client);
  await startDueVoiceEvents(client);

  setInterval(() => {
    void startDueVoiceEvents(client).catch((error) => {
      console.error("[joint-bot] Server-Event auto-start fehlgeschlagen:", error);
    });
  }, 60_000).unref();
}

export async function startEventRealtime(client: Client): Promise<void> {
  await ensureSuperuser();
  await seedState();

  if (syncEnabled() && hasSuperuser()) {
    const unlinked = (await listAllEvents()).filter(
      (event) =>
        !event.isCanceled && !event.discordGuildEventId && Date.parse(event.startsAt) > Date.now(),
    );
    for (const event of unlinked) {
      try {
        await linkEventToGuild(client, event);
      } catch (error) {
        console.warn(`[joint-bot] Web-Event konnte nicht verlinkt werden: ${event.title}`, error);
      }
    }
  }

  if (!syncEnabled()) {
    console.log("[joint-bot] Kein DISCORD_GUILD_ID gesetzt – Server-Event-Sync deaktiviert");
  } else {
    await startDiscordAttendanceSync(client);
  }
  if (!env.announceChannelId) {
    console.log(
      "[joint-bot] Kein ANNOUNCE_CHANNEL_ID gesetzt – Realtime-Ankündigungen deaktiviert",
    );
  }

  void pbSubscribe(client);
  console.log("[joint-bot] Realtime-Subscription auf 'events' aktiv");
}

async function handleRecordChange(client: Client, record: JointEvent): Promise<void> {
  const previousCanceled = lastCanceled.get(record.id) ?? false;
  lastCanceled.set(record.id, record.isCanceled);
  if (record.type === "game" && record.discordThreadId) announced.add(record.id);

  if (record.isCanceled && !previousCanceled) {
    if (record.discordGuildEventId && syncEnabled()) {
      await cancelGuildEvent(client, record.discordGuildEventId);
    }
    await closeGameThread(client, record);
    console.log(`[joint-bot] Server-Event gecancelt: ${record.title}`);
  }

  if (!record.isCanceled && record.discordGuildEventId && syncEnabled()) {
    await updateGuildEvent(client, record);
  }

  if (!record.isCanceled && Date.parse(record.startsAt) > Date.now() && !announced.has(record.id)) {
    if (syncEnabled() && hasSuperuser() && !record.discordGuildEventId) {
      await linkEventToGuild(client, record);
      return;
    }
    await announce(client, record);
  }
}

async function pbSubscribe(client: Client): Promise<void> {
  await pb
    .collection("events")
    .subscribe("*", (data) => {
      void (async () => {
        try {
          if (data.action === "delete") {
            announced.delete(data.record.id);
            lastCanceled.delete(data.record.id);

            const deletedEvent = toJointEvent(data.record);
            await closeGameThread(client, deletedEvent);
            const guildEventId = String(data.record.discordGuildEventId ?? "");
            if (guildEventId && syncEnabled()) {
              await deleteGuildEvent(client, guildEventId);
              console.log("[joint-bot] Server-Event zu gelöschtem Event entfernt");
            }
            return;
          }

          if (data.action !== "create" && data.action !== "update") return;

          await handleRecordChange(client, toJointEvent(data.record));
        } catch (error) {
          console.error("[joint-bot] Realtime-Handler fehlgeschlagen:", error);
        }
      })();
    })
    .catch((error) => {
      console.error("[joint-bot] Realtime-Subscription fehlgeschlagen:", error);
    });
}
