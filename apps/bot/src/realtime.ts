import { env } from "./env"
import {
  listAllEvents,
  listUpcomingEvents,
  toJointEvent,
  type JointEvent,
} from "./events"
import { eventToEmbed } from "./embeds"
import { cancelGuildEvent, deleteGuildEvent, syncEnabled } from "./guild-events"
import { ensureSuperuser, pb } from "./pocketbase"
import type { Client } from "discord.js"

const announced = new Set<string>()
const lastCanceled = new Map<string, boolean>()

async function seedState(): Promise<void> {
  try {
    const events = await listAllEvents()
    for (const event of events) {
      if (!event.isCanceled && Date.parse(event.startsAt) > Date.now()) {
        announced.add(event.id)
      }
      lastCanceled.set(event.id, event.isCanceled)
    }
  } catch (error) {
    console.warn("[joint-bot] Konnte bestehende Events nicht laden:", error)
  }
}

async function announce(client: Client, event: JointEvent): Promise<void> {
  if (!env.announceChannelId || announced.has(event.id)) return

  const channel = await client.channels.fetch(env.announceChannelId)
  if (!channel || !("send" in channel)) {
    console.warn(`[joint-bot] Announce-Channel ${env.announceChannelId} nicht gefunden`)
    return
  }

  await channel.send({ embeds: [eventToEmbed(event)] })
  announced.add(event.id)
  console.log(`[joint-bot] Event angekündigt: ${event.title}`)
}

export async function startEventRealtime(client: Client): Promise<void> {
  await ensureSuperuser()
  await seedState()

  if (!syncEnabled()) {
    console.log("[joint-bot] Kein DISCORD_GUILD_ID gesetzt – Server-Event-Sync deaktiviert")
  }
  if (!env.announceChannelId) {
    console.log("[joint-bot] Kein ANNOUNCE_CHANNEL_ID gesetzt – Realtime-Ankündigungen deaktiviert")
  }

  void pbSubscribe(client)
  console.log("[joint-bot] Realtime-Subscription auf 'events' aktiv")
}

async function handleRecordChange(client: Client, record: JointEvent): Promise<void> {
  const previousCanceled = lastCanceled.get(record.id) ?? false
  lastCanceled.set(record.id, record.isCanceled)

  if (record.isCanceled && !previousCanceled && record.discordGuildEventId && syncEnabled()) {
    await cancelGuildEvent(client, record.discordGuildEventId)
    console.log(`[joint-bot] Server-Event gecancelt: ${record.title}`)
  }

  if (
    !record.isCanceled &&
    Date.parse(record.startsAt) > Date.now() &&
    !announced.has(record.id)
  ) {
    await announce(client, record)
  }
}

async function pbSubscribe(client: Client): Promise<void> {
  await pb.collection("events").subscribe("*", (data) => {
    void (async () => {
      try {
        if (data.action === "delete") {
          announced.delete(data.record.id)
          lastCanceled.delete(data.record.id)

          const guildEventId = String(data.record.discordGuildEventId ?? "")
          if (guildEventId && syncEnabled()) {
            await deleteGuildEvent(client, guildEventId)
            console.log("[joint-bot] Server-Event zu gelöschtem Event entfernt")
          }
          return
        }

        if (data.action !== "create" && data.action !== "update") return

        await handleRecordChange(client, toJointEvent(data.record))
      } catch (error) {
        console.error("[joint-bot] Realtime-Handler fehlgeschlagen:", error)
      }
    })()
  }).catch((error) => {
    console.error("[joint-bot] Realtime-Subscription fehlgeschlagen:", error)
  })
}
