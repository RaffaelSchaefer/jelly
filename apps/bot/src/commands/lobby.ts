import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { parseDateInput } from "../dates";
import { isChannelId } from "../embeds";
import { normalizeGameDestination } from "../events";
import {
  closeLobbyThread,
  createLobbyPost,
  fetchLobbyMessage,
  lobbyMessageUrl,
  refreshLobbyPost,
  resolveLobbyChannel,
  syncLobbyThreadMember,
  type LobbyPostResources,
} from "../lobby-post";
import {
  addLobbyParticipant,
  closeLobby,
  createLobby,
  deleteLobby,
  findOpenLobbiesByGame,
  getLobby,
  getLobbyParticipantCounts,
  listLobbyParticipantUserIds,
  removeLobbyParticipant,
  setLobbyPost,
  type Lobby,
} from "../lobbies";
import { confirmAction } from "./confirm";
import type { Command } from "./types";

const LOBBY_COLOR = 0x66c0f4;
const LOBBY_CLOSED_COLOR = 0x95a5a6;

export function clamp(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}

export interface ParsedLobbyOptions {
  game: string;
  gameUrl: string;
  playersWanted: number;
  startsAt: Date | null;
  location: string;
}

export function parseLobbyOptions(input: {
  spiel: string | null;
  gameLink: string | null;
  mitspieler: number | null;
  start: string | null;
  ort: string | null;
}): ParsedLobbyOptions {
  const game = input.spiel?.trim() ?? "";
  if (!game) throw new Error("`spiel` ist erforderlich.");
  if (game.length > 100) throw new Error("Der Spielname darf höchstens 100 Zeichen lang sein.");

  let gameUrl = "";
  if (input.gameLink?.trim()) {
    try {
      gameUrl = normalizeGameDestination(input.gameLink);
    } catch (error) {
      throw new Error(
        error instanceof Error ? `Ungültiger Game-Link: ${error.message}` : "Ungültiger Game-Link.",
      );
    }
  }

  const playersWanted = input.mitspieler ?? 0;
  if (playersWanted !== 0 && (playersWanted < 1 || playersWanted > 99)) {
    throw new Error("`mitspieler` muss zwischen 1 und 99 liegen.");
  }

  let startsAt: Date | null = null;
  const startInput = input.start?.trim();
  if (startInput) {
    startsAt = parseDateInput(startInput);
    if (!startsAt) {
      throw new Error(
        `Ungültiger Start \`${startInput.replaceAll("`", "'")}\`. ` +
          "Format: `2026-09-12T18:00` oder `12.09.2026 18:00` – ohne Start gilt „ab sofort“.",
      );
    }
  }

  return { game, gameUrl, playersWanted, startsAt, location: input.ort ?? "" };
}

export function isLobbyFull(
  lobby: Pick<Lobby, "playersWanted">,
  participantCount: number,
): boolean {
  return lobby.playersWanted > 0 && participantCount >= lobby.playersWanted;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function whenLabel(lobby: Lobby): string {
  if (lobby.startsAt) {
    const start = new Date(lobby.startsAt);
    if (!Number.isNaN(start.getTime())) {
      return `<t:${Math.floor(start.getTime() / 1000)}:f>`;
    }
  }
  return "**jetzt** 🔍";
}

export function lobbyChoiceLabel(lobby: Lobby, now = new Date()): string {
  const start = new Date(lobby.startsAt);
  const when =
    lobby.startsAt && !Number.isNaN(start.getTime())
      ? `${pad(start.getDate())}.${pad(start.getMonth() + 1)}. · ${pad(start.getHours())}:${pad(
          start.getMinutes(),
        )} Uhr`
      : "jetzt";
  const label = `${lobby.game} (${when})`;
  return label.length > 100 ? label.slice(0, 97) + "..." : label;
}

export function lobbyToEmbed(lobby: Lobby, participantCount: number): EmbedBuilder {
  const wanted = lobby.playersWanted > 0 ? ` / ${lobby.playersWanted}` : "";
  const embed = new EmbedBuilder()
    .setColor(lobby.isClosed ? LOBBY_CLOSED_COLOR : LOBBY_COLOR)
    .setTitle(`🎮 ${lobby.game}${lobby.isClosed ? " · geschlossen" : ""}`)
    .setFooter({ text: "UCB LAN Bot · Lobby" });

  if (lobby.gameUrl) embed.setURL(lobby.gameUrl);

  const start = new Date(lobby.startsAt);
  if (lobby.startsAt && !Number.isNaN(start.getTime())) {
    embed.addFields({
      name: "Start",
      value: `<t:${Math.floor(start.getTime() / 1000)}:f>`,
      inline: true,
    });
  }

  embed.addFields({ name: "Mitspieler", value: `${participantCount}${wanted}`, inline: true });

  if (lobby.location) {
    embed.addFields({
      name: "Ort",
      value: isChannelId(lobby.location) ? `<#${lobby.location}>` : lobby.location,
      inline: true,
    });
  }

  if (!lobby.isClosed && isLobbyFull(lobby, participantCount)) {
    embed.addFields({ name: "Status", value: "✅ **Voll**" });
  }

  return embed;
}

export function lobbyComponents(
  lobby: Pick<Lobby, "id" | "isClosed" | "playersWanted">,
  participantCount: number,
): ActionRowBuilder<ButtonBuilder>[] {
  if (lobby.isClosed) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`lobby:join:${lobby.id}`)
        .setLabel("Mitmachen")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isLobbyFull(lobby, participantCount)),
      new ButtonBuilder()
        .setCustomId(`lobby:leave:${lobby.id}`)
        .setLabel("Verlassen")
        .setEmoji("🚪")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function parseLobbyCustomId(
  customId: string,
): { action: "join" | "leave"; lobbyId: string } | null {
  const parts = customId.split(":");
  if (parts.length !== 3 || parts[0] !== "lobby") return null;
  if (parts[1] !== "join" && parts[1] !== "leave") return null;
  return { action: parts[1], lobbyId: parts[2] };
}

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  try {
    const focused = interaction.options.getFocused(true);

    if (focused.name === "spiel") {
      const lobbies = await findOpenLobbiesByGame(focused.value, 25);
      const seen = new Set<string>();
      const games: string[] = [];
      for (const lobby of lobbies) {
        const key = lobby.game.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        games.push(lobby.game);
      }
      await interaction.respond(games.slice(0, 25).map((game) => ({ name: game, value: game })));
      return;
    }

    if (focused.name === "lobby") {
      const isAdmin =
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
      const lobbies = await findOpenLobbiesByGame("", 50);
      const visible = isAdmin
        ? lobbies
        : lobbies.filter((lobby) => lobby.discordCreatorId === interaction.user.id);
      await interaction.respond(
        visible.slice(0, 25).map((lobby) => ({
          name: lobbyChoiceLabel(lobby),
          value: lobby.id,
        })),
      );
      return;
    }

    await interaction.respond([]);
  } catch {
    await interaction.respond([]);
  }
}

async function handleJoin(interaction: ButtonInteraction, lobby: Lobby): Promise<string> {
  const userIds = await listLobbyParticipantUserIds(lobby.id);
  if (userIds.includes(interaction.user.id)) {
    return `Du bist schon bei **${lobby.game}** dabei.`;
  }
  if (isLobbyFull(lobby, userIds.length)) {
    return `❌ Die Lobby **${lobby.game}** ist leider schon voll.`;
  }

  await addLobbyParticipant(lobby.id, interaction.user.id);
  await syncLobbyThreadMember(interaction.client, lobby, interaction.user.id, true);
  await refreshLobbyPost(interaction.client, lobby);
  return (
    `✅ Du bist bei **${lobby.game}** dabei!` +
    (lobby.discordThreadId ? `\n💬 <#${lobby.discordThreadId}>` : "")
  );
}

async function handleLeave(interaction: ButtonInteraction, lobby: Lobby): Promise<string> {
  if (interaction.user.id === lobby.discordCreatorId) {
    return "Als Ersteller kannst du deine eigene Lobby nicht verlassen – nutze `/lobby close`.";
  }

  const userIds = await listLobbyParticipantUserIds(lobby.id);
  if (!userIds.includes(interaction.user.id)) {
    return `Du warst bei **${lobby.game}** nicht angemeldet.`;
  }

  await removeLobbyParticipant(lobby.id, interaction.user.id);
  await syncLobbyThreadMember(interaction.client, lobby, interaction.user.id, false);
  await refreshLobbyPost(interaction.client, lobby);
  return `👋 Du bist aus **${lobby.game}** ausgetreten.`;
}

async function handleComponent(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseLobbyCustomId(interaction.customId);
  if (!parsed) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lobby = await getLobby(parsed.lobbyId);
  if (!lobby) {
    await interaction.editReply("Diese Lobby existiert nicht mehr.");
    return;
  }
  if (lobby.isClosed) {
    await interaction.editReply(`🔒 Die Lobby **${lobby.game}** ist bereits geschlossen.`);
    return;
  }

  const reply =
    parsed.action === "join"
      ? await handleJoin(interaction, lobby)
      : await handleLeave(interaction, lobby);
  await interaction.editReply(reply);
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("lobby")
    .setDescription("Lobbys (Looking-for-Group) erstellen und finden")
    .addSubcommand((sub) =>
      sub
        .setName("post")
        .setDescription("Neue Lobby posten – ohne Start wird ab sofort gesucht")
        .addStringOption((option) =>
          option
            .setName("spiel")
            .setDescription("Spielname (Vorschläge bekannter Spiele erscheinen beim Tippen)")
            .setRequired(true)
            .setMaxLength(100)
            .setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("mitspieler")
            .setDescription("Gesuchte Spieler gesamt (leer = offene Gruppe)")
            .setMinValue(1)
            .setMaxValue(99),
        )
        .addStringOption((option) =>
          option
            .setName("start")
            .setDescription("z.B. 2026-09-12T20:00 oder 12.09.2026 20:00 (leer = jetzt)"),
        )
        .addStringOption((option) =>
          option
            .setName("game_link")
            .setDescription("Optional: Steam-App-ID/-Link oder HTTPS-Game-Link")
            .setMaxLength(500),
        )
        .addChannelOption((option) =>
          option
            .setName("ort")
            .setDescription("Discord-Voice-Channel als Treffpunkt")
            .addChannelTypes(ChannelType.GuildVoice),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Offene Lobbys anzeigen")
        .addStringOption((option) =>
          option
            .setName("spiel")
            .setDescription("Nach Spiel filtern (Vorschläge erscheinen beim Tippen)")
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Eigene Lobby schließen (Server-Admins: alle)")
        .addStringOption((option) =>
          option
            .setName("lobby")
            .setDescription("Eigene Lobby (Vorschläge erscheinen beim Tippen)")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "post") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let options: ParsedLobbyOptions;
      try {
        options = parseLobbyOptions({
          spiel: interaction.options.getString("spiel"),
          gameLink: interaction.options.getString("game_link"),
          mitspieler: interaction.options.getInteger("mitspieler"),
          start: interaction.options.getString("start"),
          ort: interaction.options.getChannel("ort")?.id ?? null,
        });
      } catch (error) {
        await interaction.editReply(
          error instanceof Error ? `❌ ${error.message}` : "❌ Ungültige Angaben.",
        );
        return;
      }

      let channel: GuildTextBasedChannel;
      try {
        channel = await resolveLobbyChannel(interaction.client);
      } catch (error) {
        await interaction.editReply(
          error instanceof Error
            ? `❌ Lobby nicht gepostet: ${error.message}`
            : "❌ Kein Lobby-Channel.",
        );
        return;
      }

      const lobby = await createLobby({
        game: options.game,
        gameUrl: options.gameUrl || undefined,
        playersWanted: options.playersWanted || undefined,
        startsAt: options.startsAt ?? undefined,
        location: options.location || undefined,
        discordCreatorId: interaction.user.id,
      });

      let post: LobbyPostResources;
      try {
        post = await createLobbyPost(channel, lobby);
      } catch (error) {
        await deleteLobby(lobby.id);
        await interaction.editReply(
          error instanceof Error
            ? `❌ Lobby nicht angelegt: ${error.message}`
            : "❌ Der Lobby-Post konnte nicht erstellt werden.",
        );
        return;
      }

      await setLobbyPost(lobby.id, {
        discordMessageId: post.message.id,
        discordThreadId: post.thread.id,
      });

      await interaction.editReply({
        content:
          `✅ Lobby **${lobby.game}** ist online.\n` +
          `📌 Post: ${post.message.url}\n💬 Thread: <#${post.thread.id}>`,
      });
      return;
    }

    if (sub === "list") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const game = interaction.options.getString("spiel");
      const open = await findOpenLobbiesByGame(game ?? "", 25);
      if (open.length === 0) {
        await interaction.editReply(
          game
            ? `Keine offene Lobby für **${game}** – starte eine mit \`/lobby post\`!`
            : "Keine offenen Lobbys – starte eine mit `/lobby post`!",
        );
        return;
      }

      const nowLobbies = open.filter((lobby) => !lobby.startsAt);
      const dated = open
        .filter((lobby) => lobby.startsAt)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const shown = [...nowLobbies, ...dated].slice(0, 10);
      const counts = await getLobbyParticipantCounts(shown);

      const lines = shown.map((lobby) => {
        const count = counts.get(lobby.id) ?? 0;
        const target = lobby.playersWanted > 0 ? `/${lobby.playersWanted}` : "";
        const full = isLobbyFull(lobby, count) ? " ✅" : "";
        const when = whenLabel(lobby);
        const url = lobbyMessageUrl(interaction.guildId, lobby);
        const link = url ? ` · [Post](${url})` : "";
        return `• **${lobby.game}** — 👥 ${count}${target}${full} — ${when}${link}`;
      });

      await interaction.editReply(`🎮 **Offene Lobbys:**\n${lines.join("\n")}`);
      return;
    }

    if (sub === "close") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const lobby = await getLobby(interaction.options.getString("lobby", true));
      if (!lobby) {
        await interaction.editReply(
          "❌ Lobby nicht gefunden – sie wurde vielleicht schon geschlossen. Bitte erneut wählen.",
        );
        return;
      }

      const isAdmin =
        interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
      if (!isAdmin && lobby.discordCreatorId !== interaction.user.id) {
        await interaction.editReply(
          "Nur der Ersteller oder Server-Admins können diese Lobby schließen.",
        );
        return;
      }
      if (lobby.isClosed) {
        await interaction.editReply("Diese Lobby ist bereits geschlossen.");
        return;
      }

      const confirmed = await confirmAction(interaction, {
        prompt: `🔒 Lobby **${lobby.game}** wirklich schließen? Thread und Post werden geschlossen.`,
        confirmLabel: "Schließen",
      });
      if (!confirmed) return;

      await closeLobby(lobby.id);
      await closeLobbyThread(interaction.client, lobby);

      const [message, count] = await Promise.all([
        fetchLobbyMessage(interaction.client, lobby),
        listLobbyParticipantUserIds(lobby.id),
      ]);
      await message?.edit({
        embeds: [lobbyToEmbed({ ...lobby, isClosed: true }, count.length)],
        components: [],
      });

      await interaction.editReply(`🔒 Lobby **${lobby.game}** geschlossen.`);
      return;
    }
  },

  autocomplete,

  handleComponent,
};
