import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  type Client,
} from "discord.js"
import { env } from "./env"
import type { JointEvent } from "./events"
import { htmlToText, isChannelId } from "./embeds"

export function syncEnabled(): boolean {
  return Boolean(env.guildId)
}

function targetGuild(client: Client) {
  if (!env.guildId) return null
  return client.guilds.fetch(env.guildId).catch(() => null)
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000

function clamp(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…"
}

export async function createGuildEvent(
  client: Client,
  event: JointEvent,
): Promise<string | null> {
  const guild = await targetGuild(client)
  if (!guild) return null

  const isVoice = isChannelId(event.location)
  const startsAt = new Date(event.startsAt)
  const endsAt = event.endsAt
    ? new Date(event.endsAt)
    : new Date(startsAt.getTime() + DEFAULT_DURATION_MS)

  try {
    const created = await guild.scheduledEvents.create({
      name: clamp(event.title, 100),
      description: clamp(htmlToText(event.description), 1000),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: isVoice
        ? GuildScheduledEventEntityType.Voice
        : GuildScheduledEventEntityType.External,
      scheduledStartTime: startsAt,
      scheduledEndTime: endsAt,
      ...(isVoice
        ? { channel: event.location }
        : { entityMetadata: { location: event.location || "Ort wird bekannt gegeben" } }),
    })
    return created.id
  } catch (error) {
    console.error("[joint-bot] Discord Server-Event konnte nicht erstellt werden:", error)
    return null
  }
}

export async function cancelGuildEvent(
  client: Client,
  discordGuildEventId: string,
): Promise<void> {
  const guild = await targetGuild(client)
  if (!guild) return

  try {
    await guild.scheduledEvents.edit(discordGuildEventId, {
      status: GuildScheduledEventStatus.Canceled,
    })
  } catch (error) {
    console.warn("[joint-bot] Server-Event cancel übersprungen:", error)
  }
}

export async function deleteGuildEvent(
  client: Client,
  discordGuildEventId: string,
): Promise<void> {
  const guild = await targetGuild(client)
  if (!guild) return

  try {
    await guild.scheduledEvents.delete(discordGuildEventId)
  } catch (error) {
    console.warn("[joint-bot] Server-Event delete übersprungen:", error)
  }
}
