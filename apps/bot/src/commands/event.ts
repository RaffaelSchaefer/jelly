import {
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js"
import { parseDateInput } from "../dates"
import { createEvent, EVENT_TYPES, getEvent, listUpcomingEvents, type EventType } from "../events"
import { eventToEmbed } from "../embeds"
import { env } from "../env"
import type { Command } from "./types"

const typeChoices = EVENT_TYPES.map((type) => ({ name: type, value: type }))

async function resolveAnnounceChannel(interaction: ChatInputCommandInteraction) {
  const optionChannel = interaction.options.getChannel("kanal")
  if (optionChannel && "send" in optionChannel) return optionChannel

  if (env.announceChannelId) {
    const configured = await interaction.client.channels.fetch(env.announceChannelId)
    if (configured && "send" in configured) return configured
  }

  const current = interaction.channel
  if (current && "send" in current) return current

  return null
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Events vom UCB LAN Bot verwalten und ankündigen")
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Kommende Events anzeigen")
        .addStringOption((option) =>
          option
            .setName("typ")
            .setDescription("Nach Event-Typ filtern")
            .addChoices(...typeChoices),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Ein einzelnes Event anzeigen")
        .addStringOption((option) =>
          option.setName("id").setDescription("PocketBase Event-ID").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Neues Event anlegen")
        .addStringOption((option) =>
          option.setName("titel").setDescription("Titel (3–120 Zeichen)").setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("typ")
            .setDescription("Event-Typ")
            .setRequired(true)
            .addChoices(...typeChoices),
        )
        .addStringOption((option) =>
          option
            .setName("start")
            .setDescription("z.B. 2026-09-12T18:00 oder 12.09.2026 18:00")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("ende")
            .setDescription("z.B. 2026-09-13T06:00 oder 13.09.2026 06:00"),
        )
        .addStringOption((option) => option.setName("beschreibung").setDescription("Kurzbeschreibung"))
        .addChannelOption((option) =>
          option
            .setName("ort")
            .setDescription("Discord-Voice-Channel als Ort")
            .addChannelTypes(ChannelType.GuildVoice),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("announce")
        .setDescription("Ein Event als Embed in einen Channel posten")
        .addStringOption((option) =>
          option.setName("id").setDescription("PocketBase Event-ID").setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("kanal")
            .setDescription("Ziel-Channel (Standard: konfigurierter Announce-Channel)"),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand()

    if (sub === "list") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const type = interaction.options.getString("typ") as EventType | null
      const events = await listUpcomingEvents({ type: type ?? undefined, limit: 10 })

      if (events.length === 0) {
        await interaction.editReply("Keine kommenden Events gefunden.")
        return
      }

      await interaction.editReply({
        content: `📅 **${events.length} kommende Events:**`,
        embeds: events.map(eventToEmbed).slice(0, 10),
      })
      return
    }

    if (sub === "show") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const event = await getEvent(interaction.options.getString("id", true))
      if (!event) {
        await interaction.editReply("Event nicht gefunden.")
        return
      }

      await interaction.editReply({ embeds: [eventToEmbed(event)] })
      return
    }

    if (sub === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const startsAt = parseDateInput(interaction.options.getString("start", true))
      if (!startsAt) {
        await interaction.editReply(
          "Ungültiges Start-Datum. Format: `2026-09-12T18:00` oder `12.09.2026 18:00`.",
        )
        return
      }

      const endsInput = interaction.options.getString("ende")
      let endsAt: Date | null = null
      if (endsInput) {
        endsAt = parseDateInput(endsInput)
        if (!endsAt || endsAt <= startsAt) {
          await interaction.editReply("Ungültiges Ende – muss nach dem Start liegen.")
          return
        }
      }

      const event = await createEvent({
        title: interaction.options.getString("titel", true),
        type: interaction.options.getString("typ", true) as EventType,
        startsAt,
        endsAt: endsAt ?? undefined,
        location: interaction.options.getChannel("ort")?.id,
        description: interaction.options.getString("beschreibung") ?? undefined,
      })

      await interaction.editReply({
        content: `✅ Event angelegt (\`${event.id}\`).`,
        embeds: [eventToEmbed(event)],
      })
      return
    }

    if (sub === "announce") {
      await interaction.deferReply()

      const event = await getEvent(interaction.options.getString("id", true))
      if (!event) {
        await interaction.editReply("Event nicht gefunden.")
        return
      }

      const channel = await resolveAnnounceChannel(interaction)
      if (!channel) {
        await interaction.editReply("Kein Ziel-Channel gefunden.")
        return
      }

      await channel.send({ embeds: [eventToEmbed(event)] })
      await interaction.editReply(`📢 Ankündigung in <#${channel.id}> gepostet.`)
    }
  },
}
