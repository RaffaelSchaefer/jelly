import { env } from "./env"
import { listUpcomingEvents, toJointEvent, type JointEvent } from "./events"
import { eventToEmbed } from "./embeds"
import { ensureSuperuser, pb } from "./pocketbase"
import type { Client } from "discord.js"

const announced = new Set<string>()

async function seedAnnounced(): Promise<void> {
  try {
    const events = await listUpcomingEvents({ limit: 200 })
    for (const event of events) {
      announced.add(event.id)
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
  if (!env.announceChannelId) {
    console.log("[joint-bot] Kein ANNOUNCE_CHANNEL_ID gesetzt – Realtime-Ankündigungen deaktiviert")
    return
  }

  await ensureSuperuser()
  await seedAnnounced()

  void pbSubscribe(client)
  console.log("[joint-bot] Realtime-Subscription auf 'events' aktiv")
}

async function pbSubscribe(client: Client): Promise<void> {
  await pb.collection("events").subscribe("*", (data) => {
    if (data.action === "delete") {
      announced.delete(data.record.id)
      return
    }

    if (data.action !== "create" && data.action !== "update") return

    const event = toJointEvent(data.record)

    if (Date.parse(event.startsAt) <= Date.now()) return

    announce(client, event).catch((error) => {
      console.error("[joint-bot] Ankündigung fehlgeschlagen:", error)
    })
  }).catch((error) => {
    console.error("[joint-bot] Realtime-Subscription fehlgeschlagen:", error)
  })
}
