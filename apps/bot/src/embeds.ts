import { EmbedBuilder } from "discord.js"
import type { JointEvent, EventType } from "./events"

const TYPE_META: Record<EventType, { label: string; emoji: string; color: number }> = {
  announcement: { label: "Ankündigung", emoji: "📣", color: 0x5865f2 },
  food: { label: "Essen", emoji: "🍕", color: 0x57f287 },
  giveaway: { label: "Giveaway", emoji: "🎁", color: 0xfee75c },
  tournament: { label: "Turnier", emoji: "🏆", color: 0xeb459e },
  workshop: { label: "Workshop", emoji: "🛠️", color: 0xf97316 },
  other: { label: "Sonstiges", emoji: "❓", color: 0x95a5a6 },
}

const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
}

export function htmlToText(html: string): string {
  const text = html
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replaceAll(/<[^>]*>/g, "")
    .replaceAll(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => entities[match] ?? match)

  return text.replaceAll(/[ \t]+/g, " ").replaceAll(/\n{3,}/g, "\n\n").trim()
}

export function isChannelId(value: string): boolean {
  return /^\d{15,21}$/.test(value)
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + "…"
}

function timestamp(value: string, style: "f" | "t"): string | null {
  if (!value) return null
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return null
  return `<t:${Math.floor(ms / 1000)}:${style}>`
}

const CHANNEL_ID = /^\d{15,21}$/

export function eventToEmbed(event: JointEvent): EmbedBuilder {
  const meta = TYPE_META[event.type] ?? TYPE_META.other

  const embed = new EmbedBuilder()
    .setColor(event.isCanceled ? 0xed4245 : meta.color)
    .setTitle(`${event.isCanceled ? "❌ " : ""}${meta.emoji} ${event.title}`)
    .setFooter({ text: `UCB LAN Bot · ${meta.label}` })

  const start = timestamp(event.startsAt, "f")
  if (start) {
    embed.addFields({ name: "Start", value: start, inline: true })
  }

  const end = timestamp(event.endsAt, "t")
  if (end) {
    embed.addFields({ name: "Ende", value: end, inline: true })
  }

  if (event.location) {
    embed.addFields({
      name: "Ort",
      value: CHANNEL_ID.test(event.location) ? `<#${event.location}>` : event.location,
      inline: true,
    })
  }

  if (event.isCanceled) {
    embed.addFields({ name: "Status", value: "❌ **Abgesagt**" })
  }

  const description = htmlToText(event.description)
  if (description) {
    embed.setDescription(truncate(description, 400))
  }

  return embed
}
