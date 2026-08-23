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
  listUpcomingEvents,
  normalizeGameDestination,
  type EventType,
  type JointEvent,
} from "../events";
import { eventToEmbed } from "../embeds";
import {
  cancelGuildEvent,
  closeGameThread,
  createGameThread,
  createGuildEvent,
  deleteGameThreadResources,
  deleteGuildEvent,
  resolveGameThreadChannel,
} from "../guild-events";
import { env } from "../env";
import type { Command } from "./types";

const typeChoices = EVENT_TYPES.map((type) => ({ name: type, value: type }));
const BANNER_MAX_BYTES = 5 * 1024 * 1024;
const BANNER_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const BANNER_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

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

export async function createGameEventTransaction<T, R>(operations: {
  createGuildEvent: () => Promise<string | null>;
  createThread: (guildEventId: string) => Promise<R>;
  persist: (guildEventId: string, resources: R) => Promise<T>;
  rollbackThread: (resources: R) => Promise<boolean>;
  rollbackGuildEvent: (guildEventId: string) => Promise<boolean>;
}): Promise<T | null> {
  async function rollback(label: string, operation: () => Promise<boolean>): Promise<void> {
    try {
      if (!(await operation())) console.error(`[joint-bot] Game-Rollback unvollständig: ${label}`);
    } catch (error) {
      console.error(`[joint-bot] Game-Rollback fehlgeschlagen: ${label}`, error);
    }
  }

  const guildEventId = await operations.createGuildEvent();
  if (!guildEventId) return null;

  let resources: R;
  try {
    resources = await operations.createThread(guildEventId);
  } catch (error) {
    await rollback("Discord Server-Event", () => operations.rollbackGuildEvent(guildEventId));
    throw error;
  }

  try {
    return await operations.persist(guildEventId, resources);
  } catch (error) {
    await rollback("Thread und Ankündigung", () => operations.rollbackThread(resources));
    await rollback("Discord Server-Event", () => operations.rollbackGuildEvent(guildEventId));
    throw error;
  }
}

export function parseGameOptions(
  type: EventType,
  gameInput: string | null,
  destinationInput: string | null,
  playersWanted: number | null,
): { game: string; gameUrl: string; playersWanted: number } {
  const game = gameInput?.trim() ?? "";
  const hasGameDetails = Boolean(game || destinationInput?.trim() || playersWanted);

  if (type !== "game") {
    if (hasGameDetails)
      throw new Error("Spiel, Ziel und Mitspieler sind nur für Typ `game` erlaubt.");
    return { game: "", gameUrl: "", playersWanted: 0 };
  }
  if (!game) throw new Error("Für Typ `game` muss `spiel` angegeben werden.");
  if (game.length > 100) throw new Error("Der Spielname darf höchstens 100 Zeichen lang sein.");
  if (
    playersWanted !== null &&
    (!Number.isInteger(playersWanted) || playersWanted < 1 || playersWanted > 99)
  ) {
    throw new Error("`mitspieler` muss zwischen 1 und 99 liegen.");
  }

  return {
    game,
    gameUrl: destinationInput ? normalizeGameDestination(destinationInput) : "",
    playersWanted: playersWanted ?? 0,
  };
}

function eventChoiceLabel(event: JointEvent): string {
  const date = new Date(event.startsAt).toLocaleDateString("de-DE");
  const suffix = event.isCanceled ? " · abgesagt" : "";
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
        .addStringOption((option) =>
          option.setName("spiel").setDescription("Für Typ game: Spielname").setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("ziel")
            .setDescription("Für Typ game: Steam-App-ID/-Link oder HTTPS-Spiel-Link")
            .setMaxLength(500),
        )
        .addIntegerOption((option) =>
          option
            .setName("mitspieler")
            .setDescription("Für Typ game: zusätzlich gesuchte Spieler (1–99)")
            .setMinValue(1)
            .setMaxValue(99),
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
        .setDescription("Event absagen (nur Ersteller oder Server-Admins)")
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
        .setDescription("Event löschen (nur Ersteller oder Server-Admins)")
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
      const events = await listUpcomingEvents({ type: type ?? undefined, limit: 10 });

      if (events.length === 0) {
        await interaction.editReply("Keine kommenden Events gefunden.");
        return;
      }

      const counts = await getEventAttendeeCounts(events);
      await interaction.editReply({
        content: `📅 **${events.length} kommende Events:**`,
        embeds: events.map((event) => eventToEmbed(event, counts.get(event.id) ?? 0)).slice(0, 10),
      });
      return;
    }

    if (sub === "show") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const event = await resolveEventOption(interaction);
      if (!event) {
        await interaction.editReply("Event nicht gefunden.");
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
        await interaction.editReply("Event nicht gefunden.");
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

      const startsAt = parseDateInput(interaction.options.getString("start", true));
      if (!startsAt) {
        await interaction.editReply(
          "Ungültiges Start-Datum. Format: `2026-09-12T18:00` oder `12.09.2026 18:00`.",
        );
        return;
      }

      const endsInput = interaction.options.getString("ende");
      let endsAt: Date | null = null;
      if (endsInput) {
        endsAt = parseDateInput(endsInput);
        if (!endsAt || endsAt <= startsAt) {
          await interaction.editReply("Ungültiges Ende – muss nach dem Start liegen.");
          return;
        }
      }

      const title = interaction.options.getString("titel", true);
      const type = interaction.options.getString("typ", true) as EventType;
      const location = interaction.options.getChannel("ort")?.id;
      const description = interaction.options.getString("beschreibung") ?? undefined;
      let gameDetails: ReturnType<typeof parseGameOptions>;
      try {
        gameDetails = parseGameOptions(
          type,
          interaction.options.getString("spiel"),
          interaction.options.getString("ziel"),
          interaction.options.getInteger("mitspieler"),
        );
      } catch (error) {
        await interaction.editReply(
          error instanceof Error ? error.message : "Die Game-Angaben sind ungültig.",
        );
        return;
      }

      let gameThreadChannel: Awaited<ReturnType<typeof resolveGameThreadChannel>> | null = null;
      if (type === "game") {
        try {
          gameThreadChannel = await resolveGameThreadChannel(interaction.client);
        } catch (error) {
          await interaction.editReply(
            error instanceof Error
              ? `❌ Game-Event nicht angelegt: ${error.message}`
              : "❌ Der Game-Thread kann nicht erstellt werden.",
          );
          return;
        }
      }

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
        ...gameDetails,
        discordThreadId: "",
      };

      const persist = (discordGuildEventId: string, discordThreadId = "") =>
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
          ...gameDetails,
          discordThreadId,
        });

      let event: JointEvent | null;
      if (type === "game") {
        try {
          event = await createGameEventTransaction({
            createGuildEvent: () =>
              createGuildEvent(interaction.client, draft, banner?.buffer ?? null),
            createThread: (discordGuildEventId) =>
              createGameThread(
                gameThreadChannel!,
                { ...draft, discordGuildEventId },
                banner
                  ? {
                      buffer: banner.buffer,
                      name: `game-banner.${BANNER_EXTENSIONS[banner.file.type]}`,
                    }
                  : null,
              ),
            persist: (discordGuildEventId, resources) =>
              persist(discordGuildEventId, resources.thread.id),
            rollbackThread: deleteGameThreadResources,
            rollbackGuildEvent: (discordGuildEventId) =>
              deleteGuildEvent(interaction.client, discordGuildEventId),
          });
        } catch (error) {
          await interaction.editReply(
            error instanceof Error
              ? `❌ Game-Event vollständig zurückgerollt: ${error.message}`
              : "❌ Game-Event konnte nicht angelegt werden und wurde zurückgerollt.",
          );
          return;
        }
      } else {
        const guildEventId = await createGuildEvent(
          interaction.client,
          draft,
          banner?.buffer ?? null,
        );
        event = await persistEventAfterGuildCreate(
          guildEventId,
          (discordGuildEventId) => persist(discordGuildEventId),
          (discordGuildEventId) => deleteGuildEvent(interaction.client, discordGuildEventId),
        );
      }

      if (!event) {
        await interaction.editReply(
          "❌ Event nicht angelegt – Discord Server-Event konnte nicht erstellt werden.",
        );
        return;
      }

      await interaction.editReply({
        content:
          event.type === "game"
            ? `✅ Game-Event angelegt (\`${event.id}\`) – 📅 Server-Event und <#${event.discordThreadId}> erstellt.`
            : `✅ Event angelegt (\`${event.id}\`) – 📅 Server-Event erstellt.`,
        embeds: [eventToEmbed(event, 0)],
      });
      return;
    }

    if (sub === "announce") {
      await interaction.deferReply();

      const event = await resolveEventOption(interaction);
      if (!event) {
        await interaction.editReply("Event nicht gefunden.");
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
        await interaction.editReply("Event nicht gefunden.");
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

      await cancelEvent(event.id);

      const counts = await getEventAttendeeCounts([event]);

      if (event.discordGuildEventId) {
        await cancelGuildEvent(interaction.client, event.discordGuildEventId);
      }
      await closeGameThread(interaction.client, { ...event, isCanceled: true });

      if (interaction.options.getBoolean("ankuendigen") ?? true) {
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
        await interaction.editReply("Event nicht gefunden.");
        return;
      }
      if (!canModerate(interaction, event)) {
        await interaction.editReply(
          "Nur der Ersteller dieses Events oder Server-Admins können es löschen.",
        );
        return;
      }

      if (event.discordGuildEventId) {
        await deleteGuildEvent(interaction.client, event.discordGuildEventId);
      }
      await closeGameThread(interaction.client, event);

      await deleteEvent(event.id);
      await interaction.editReply(`🗑️ Event **${event.title}** gelöscht.`);
    }
  },
};
