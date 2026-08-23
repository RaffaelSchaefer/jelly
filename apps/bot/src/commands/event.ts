import {
  ChannelType,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
  type Attachment,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { parseDateInput } from "../dates";
import {
  cancelEvent,
  createEvent,
  deleteEvent,
  EVENT_TYPES,
  findEventsByTitle,
  getEventAttendeeCounts,
  getEvent,
  listEventAttendeeUserIds,
  listUpcomingEventsPage,
  type EventType,
  type JointEvent,
} from "../events";
import { eventToEmbed } from "../embeds";
import { confirmAction } from "./confirm";
import {
  cancelGuildEvent,
  closeGameThread,
  createGuildEvent,
  deleteGuildEvent,
} from "../guild-events";
import { env } from "../env";
import type { Command } from "./types";

const typeChoices = EVENT_TYPES.filter((type) => type !== "game").map((type) => ({
  name: type,
  value: type,
}));
const BANNER_MAX_BYTES = 5 * 1024 * 1024;
const BANNER_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EVENT_NOT_FOUND =
  "❌ Event nicht gefunden – es wurde vielleicht gelöscht. Bitte erneut über die Autocomplete-Vorschläge wählen.";
const DATE_FORMAT_HINT = "Format: `2026-09-12T18:00` oder `12.09.2026 18:00`.";

export function validateBannerUpload(contentType: string | null, size: number): string | null {
  if (!contentType || !BANNER_MIME_TYPES.has(contentType)) {
    return "Das Banner muss eine PNG-, JPEG- oder WebP-Datei sein.";
  }
  if (size > BANNER_MAX_BYTES) {
    return "Das Banner darf höchstens 5 MiB groß sein.";
  }
  return null;
}

export async function downloadBanner(
  attachment: Pick<Attachment, "contentType" | "name" | "size" | "url">,
): Promise<{ buffer: Buffer; file: File }> {
  const metadataError = validateBannerUpload(attachment.contentType, attachment.size);
  if (metadataError) throw new Error(metadataError);

  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error("Das Banner konnte nicht von Discord geladen werden.");

  const bytes = await response.arrayBuffer();
  const contentError = validateBannerUpload(attachment.contentType, bytes.byteLength);
  if (contentError) throw new Error(contentError);

  return {
    buffer: Buffer.from(bytes),
    file: new File([new Uint8Array(bytes)], attachment.name, { type: attachment.contentType! }),
  };
}

export async function persistEventAfterGuildCreate<T>(
  guildEventId: string | null,
  persist: (guildEventId: string) => Promise<T>,
  rollback: (guildEventId: string) => Promise<boolean>,
): Promise<T | null> {
  if (!guildEventId) return null;

  try {
    return await persist(guildEventId);
  } catch (error) {
    let removed = false;
    try {
      removed = await rollback(guildEventId);
    } catch {
      // Preserve the PocketBase error below.
    }
    if (!removed) {
      console.error(`[joint-bot] Verwaistes Discord Server-Event: ${guildEventId}`);
    }
    throw error;
  }
}

export function eventChoiceLabel(event: JointEvent, now = new Date()): string {
  const start = new Date(event.startsAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  const valid = !Number.isNaN(start.getTime());
  const date = valid
    ? `${pad(start.getDate())}.${pad(start.getMonth() + 1)}. · ${pad(start.getHours())}:${pad(
        start.getMinutes(),
      )} Uhr`
    : "ohne Datum";
  const suffix = event.isCanceled ? " · abgesagt" : valid && start < now ? " · vorbei" : "";
  const label = `${event.title} (${date})${suffix}`;
  return label.length > 100 ? label.slice(0, 97) + "..." : label;
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  try {
    const query = interaction.options.getFocused();
    const events = await findEventsByTitle(query, 25);
    await interaction.respond(
      events.map((event) => ({ name: eventChoiceLabel(event), value: event.id })),
    );
  } catch {
    await interaction.respond([]);
  }
}

async function resolveEventOption(interaction: ChatInputCommandInteraction) {
  return getEvent(interaction.options.getString("event", true));
}

function canModerate(interaction: ChatInputCommandInteraction, event: JointEvent): boolean {
  const isAdmin =
    interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
  return isAdmin || event.discordCreatorId === interaction.user.id;
}

function chunkLines(lines: string[], maxLength = 1_800): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    if (current && current.length + line.length + 1 > maxLength) {
      chunks.push(current);
      current = "";
    }
    current += `${current ? "\n" : ""}${line}`;
  }

  if (current) chunks.push(current);
  return chunks;
}

async function resolveAnnounceChannel(interaction: ChatInputCommandInteraction) {
  const optionChannel = interaction.options.getChannel("kanal");
  if (optionChannel && "send" in optionChannel) return optionChannel;

  if (env.announceChannelId) {
    const configured = await interaction.client.channels.fetch(env.announceChannelId);
    if (configured && "send" in configured) return configured;
  }

  const current = interaction.channel;
  if (current && "send" in current) return current;

  return null;
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
          option
            .setName("event")
            .setDescription("Event-Name (Vorschläge erscheinen beim Tippen)")
            .setRequired(true)
            .setAutocomplete(true),
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
          option.setName("ende").setDescription("z.B. 2026-09-13T06:00 oder 13.09.2026 06:00"),
        )
        .addStringOption((option) =>
          option.setName("beschreibung").setDescription("Kurzbeschreibung"),
        )
        .addChannelOption((option) =>
          option
            .setName("ort")
            .setDescription("Discord-Voice-Channel als Ort")
            .addChannelTypes(ChannelType.GuildVoice),
        )
        .addAttachmentOption((option) =>
          option
            .setName("banner")
            .setDescription("Optional: PNG, JPEG oder WebP bis 5 MiB (empfohlen: 800×320)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("attendees")
        .setDescription("Interessierte anzeigen (nur Ersteller oder Server-Admins)")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event-Name (Vorschläge erscheinen beim Tippen)")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("announce")
        .setDescription("Ein Event als Embed in einen Channel posten")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event-Name (Vorschläge erscheinen beim Tippen)")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addChannelOption((option) =>
          option
            .setName("kanal")
            .setDescription("Ziel-Channel (Standard: konfigurierter Announce-Channel)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Event absagen – fragt vorher nach (nur Ersteller oder Server-Admins)")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event-Name (Vorschläge erscheinen beim Tippen)")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("ankuendigen")
            .setDescription("Abgesagt-Info in den Announce-Channel posten (Standard: ja)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Event endgültig löschen – fragt vorher nach (nur Ersteller oder Admins)")
        .addStringOption((option) =>
          option
            .setName("event")
            .setDescription("Event-Name (Vorschläge erscheinen beim Tippen)")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const type = interaction.options.getString("typ") as EventType | null;
      const { events, total } = await listUpcomingEventsPage({
        type: type ?? undefined,
        limit: 10,
      });

      if (total === 0) {
        await interaction.editReply("Keine kommenden Events gefunden.");
        return;
      }

      const counts = await getEventAttendeeCounts(events);
      const header =
        total > events.length
          ? `📅 **Kommende Events – ${events.length} von ${total}** (Filter: \`/event list\`):`
          : `📅 **${total} kommende Event${total === 1 ? "" : "s"}:**`;
      await interaction.editReply({
        content: header,
        embeds: events.map((event) => eventToEmbed(event, counts.get(event.id) ?? 0)).slice(0, 10),
      });
      return;
    }

    if (sub === "show") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const event = await resolveEventOption(interaction);
      if (!event) {
        await interaction.editReply(EVENT_NOT_FOUND);
        return;
      }

      const counts = await getEventAttendeeCounts([event]);
      await interaction.editReply({
        embeds: [eventToEmbed(event, counts.get(event.id) ?? 0)],
      });
      return;
    }

    if (sub === "attendees") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const event = await resolveEventOption(interaction);
      if (!event) {
        await interaction.editReply(EVENT_NOT_FOUND);
        return;
      }
      if (!canModerate(interaction, event)) {
        await interaction.editReply(
          "Nur der Ersteller dieses Events oder Server-Admins können die Interessierten sehen.",
        );
        return;
      }

      const userIds = (await listEventAttendeeUserIds(event.id)).sort();
      if (userIds.length === 0) {
        await interaction.editReply(`Noch niemand ist an **${event.title}** interessiert.`);
        return;
      }

      const chunks = chunkLines(userIds.map((userId) => `<@${userId}>`));
      await interaction.editReply({
        content: `👥 **${userIds.length} Interessierte für ${event.title}:**\n${chunks[0]}`,
        allowedMentions: { parse: [] },
      });
      for (const chunk of chunks.slice(1)) {
        await interaction.followUp({
          content: chunk,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
      }
      return;
    }

    if (sub === "create") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const startInput = interaction.options.getString("start", true);
      const startsAt = parseDateInput(startInput);
      if (!startsAt) {
        await interaction.editReply(
          `❌ Ungültiges Start-Datum \`${startInput.replaceAll("`", "'")}\`.\n${DATE_FORMAT_HINT}`,
        );
        return;
      }

      const endsInput = interaction.options.getString("ende");
      let endsAt: Date | null = null;
      if (endsInput) {
        endsAt = parseDateInput(endsInput);
        if (!endsAt) {
          await interaction.editReply(
            `❌ Ungültiges Ende \`${endsInput.replaceAll("`", "'")}\`.\n${DATE_FORMAT_HINT}`,
          );
          return;
        }
        if (endsAt <= startsAt) {
          await interaction.editReply(
            "❌ Das Ende muss nach dem Start liegen – z.B. Start `18:00`, Ende `23:00`.",
          );
          return;
        }
      }

      const title = interaction.options.getString("titel", true);
      const type = interaction.options.getString("typ", true) as EventType;
      const location = interaction.options.getChannel("ort")?.id;
      const description = interaction.options.getString("beschreibung") ?? undefined;

      const attachment = interaction.options.getAttachment("banner");
      let banner: Awaited<ReturnType<typeof downloadBanner>> | undefined;

      if (attachment) {
        try {
          banner = await downloadBanner(attachment);
        } catch (error) {
          await interaction.editReply(
            error instanceof Error ? error.message : "Das Banner konnte nicht geladen werden.",
          );
          return;
        }
      }

      const draft: JointEvent = {
        id: "",
        title,
        description: description ?? "",
        bannerUrl: "",
        type,
        location: location ?? "",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt?.toISOString() ?? "",
        pinned: false,
        isCanceled: false,
        discordCreatorId: interaction.user.id,
        discordGuildEventId: "",
        game: "",
        gameUrl: "",
        playersWanted: 0,
        discordThreadId: "",
      };

      const persist = (discordGuildEventId: string) =>
        createEvent({
          title,
          type,
          startsAt,
          endsAt: endsAt ?? undefined,
          location,
          description,
          banner: banner?.file,
          discordCreatorId: interaction.user.id,
          discordGuildEventId,
        });

      const guildEventId = await createGuildEvent(
        interaction.client,
        draft,
        banner?.buffer ?? null,
      );
      const event = await persistEventAfterGuildCreate(
        guildEventId,
        persist,
        (discordGuildEventId) => deleteGuildEvent(interaction.client, discordGuildEventId),
      );

      if (!event) {
        await interaction.editReply(
          "❌ Event nicht angelegt – Discord Server-Event konnte nicht erstellt werden.",
        );
        return;
      }

      await interaction.editReply({
        content: `✅ Event angelegt (\`${event.id}\`) – 📅 Server-Event erstellt.`,
        embeds: [eventToEmbed(event, 0)],
      });
      return;
    }

    if (sub === "announce") {
      await interaction.deferReply();

      const event = await resolveEventOption(interaction);
      if (!event) {
        await interaction.editReply(EVENT_NOT_FOUND);
        return;
      }

      const channel = await resolveAnnounceChannel(interaction);
      if (!channel) {
        await interaction.editReply("Kein Ziel-Channel gefunden.");
        return;
      }

      const counts = await getEventAttendeeCounts([event]);
      await channel.send({ embeds: [eventToEmbed(event, counts.get(event.id) ?? 0)] });
      await interaction.editReply(`📢 Ankündigung in <#${channel.id}> gepostet.`);
      return;
    }

    if (sub === "cancel") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const event = await resolveEventOption(interaction);
      if (!event) {
        await interaction.editReply(EVENT_NOT_FOUND);
        return;
      }
      if (event.isCanceled) {
        await interaction.editReply("Dieses Event ist bereits abgesagt.");
        return;
      }

      if (!canModerate(interaction, event)) {
        await interaction.editReply(
          "Nur der Ersteller dieses Events oder Server-Admins können es absagen.",
        );
        return;
      }

      const notify = interaction.options.getBoolean("ankuendigen") ?? true;
      const confirmed = await confirmAction(interaction, {
        prompt:
          `❌ **${event.title}** wirklich absagen?\n` +
          (notify
            ? "Die Absage wird danach im Announce-Channel gepostet."
            : "Es wird keine Absage-Ankündigung gepostet."),
        confirmLabel: "Absagen",
      });
      if (!confirmed) return;

      await cancelEvent(event.id);

      const counts = await getEventAttendeeCounts([event]);

      if (event.discordGuildEventId) {
        await cancelGuildEvent(interaction.client, event.discordGuildEventId);
      }
      await closeGameThread(interaction.client, { ...event, isCanceled: true });

      if (notify) {
        const channel = await resolveAnnounceChannel(interaction);
        if (channel) {
          await channel.send({
            embeds: [eventToEmbed({ ...event, isCanceled: true }, counts.get(event.id) ?? 0)],
          });
          await interaction.editReply(`❌ Event abgesagt – Info in <#${channel.id}> gepostet.`);
          return;
        }
      }

      await interaction.editReply(`❌ Event \`${event.id}\` abgesagt.`);
      return;
    }

    if (sub === "delete") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const event = await resolveEventOption(interaction);
      if (!event) {
        await interaction.editReply(EVENT_NOT_FOUND);
        return;
      }
      if (!canModerate(interaction, event)) {
        await interaction.editReply(
          "Nur der Ersteller dieses Events oder Server-Admins können es löschen.",
        );
        return;
      }

      const confirmed = await confirmAction(interaction, {
        prompt:
          `🗑️ **${event.title}** endgültig löschen?\n` +
          "Discord Server-Event, Game-Thread und der Event-Eintrag werden entfernt. Das kann nicht rückgängig gemacht werden.",
        confirmLabel: "Löschen",
      });
      if (!confirmed) return;

      if (event.discordGuildEventId) {
        await deleteGuildEvent(interaction.client, event.discordGuildEventId);
      }
      await closeGameThread(interaction.client, event);

      await deleteEvent(event.id);
      await interaction.editReply(`🗑️ Event **${event.title}** gelöscht.`);
    }
  },
};
