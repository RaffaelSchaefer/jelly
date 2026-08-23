import { env } from "./env";
import {
  addEventAttendee,
  findEventByDiscordGuildEventId,
  getEventAttendeeCounts,
  getEvent,
  listAllEvents,
  listAutoStartCandidates,
  listLinkedCurrentEvents,
  reconcileEventAttendees,
  removeEventAttendee,
  toJointEvent,
  type JointEvent,
} from "./events";
import { eventToEmbed } from "./embeds";
import {
  cancelGuildEvent,
  deleteGuildEvent,
  fetchGuildEventSubscriberIds,
  shouldAutoStart,
  startGuildEvent,
  syncEnabled,
  updateGuildEvent,
} from "./guild-events";
import { ensureSuperuser, pb } from "./pocketbase";
import { Events as DiscordEvents, type Client } from "discord.js";

const announced = new Set<string>();
const lastCanceled = new Map<string, boolean>();

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

function announceAfterDiscordLink(client: Client, eventId: string): void {
  setTimeout(() => {
    void (async () => {
      if (announced.has(eventId)) return;
      const event = await getEvent(eventId);
      if (event && !event.isCanceled && Date.parse(event.startsAt) > Date.now()) {
        await announce(client, event);
      }
    })().catch((error) => {
      console.error("[joint-bot] Verzögerte Event-Ankündigung fehlgeschlagen:", error);
    });
  }, 3_000).unref();
}

async function handleGuildEventUser(
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
}

async function reconcileDiscordAttendees(client: Client): Promise<void> {
  const events = await listLinkedCurrentEvents();

  for (const event of events) {
    try {
      const discordUserIds = await fetchGuildEventSubscriberIds(client, event.discordGuildEventId);
      await reconcileEventAttendees(event.id, discordUserIds);
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
    void handleGuildEventUser(guildEvent.id, user.id, true).catch((error) => {
      console.error("[joint-bot] Teilnehmer konnte nicht hinzugefügt werden:", error);
    });
  });
  client.on(DiscordEvents.GuildScheduledEventUserRemove, (guildEvent, user) => {
    void handleGuildEventUser(guildEvent.id, user.id, false).catch((error) => {
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

  if (record.isCanceled && !previousCanceled && record.discordGuildEventId && syncEnabled()) {
    await cancelGuildEvent(client, record.discordGuildEventId);
    console.log(`[joint-bot] Server-Event gecancelt: ${record.title}`);
  }

  if (!record.isCanceled && record.discordGuildEventId && syncEnabled()) {
    await updateGuildEvent(client, record);
  }

  if (!record.isCanceled && Date.parse(record.startsAt) > Date.now() && !announced.has(record.id)) {
    if (syncEnabled() && !record.discordGuildEventId) {
      announceAfterDiscordLink(client, record.id);
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
