import {
  ChannelType,
  PermissionsBitField,
  ThreadAutoArchiveDuration,
  type AnyThreadChannel,
  type Client,
  type GuildTextBasedChannel,
  type Message,
  type PublicThreadChannel,
} from "discord.js";
import { clamp, lobbyComponents, lobbyToEmbed } from "./commands/lobby";
import { env } from "./env";
import { listLobbyParticipantUserIds, type Lobby } from "./lobbies";

const LOBBY_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.ManageThreads,
];

export interface LobbyPostResources {
  message: Message<true>;
  thread: PublicThreadChannel<false>;
}

export async function resolveLobbyChannel(client: Client): Promise<GuildTextBasedChannel> {
  if (!env.guildId) throw new Error("Für Lobbys muss DISCORD_GUILD_ID gesetzt sein.");
  if (!env.lobbyChannelId) throw new Error("Für Lobbys muss LOBBY_CHANNEL_ID gesetzt sein.");

  const channel = await client.channels.fetch(env.lobbyChannelId);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw new Error("Der Lobby-Channel muss ein threadfähiger Server-Textkanal sein.");
  }
  if (channel.guildId !== env.guildId) {
    throw new Error("Lobby-Channel und DISCORD_GUILD_ID müssen zum selben Server gehören.");
  }

  const me = channel.guild.members.me ?? client.user;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions || !LOBBY_PERMISSIONS.every((permission) => permissions.has(permission))) {
    throw new Error(
      "Im Lobby-Channel fehlen Rechte zum Senden, Einbetten oder Verwalten öffentlicher Threads.",
    );
  }

  return channel;
}

export async function createLobbyPost(
  channel: GuildTextBasedChannel,
  lobby: Lobby,
): Promise<LobbyPostResources> {
  const resources: Partial<LobbyPostResources> = {};
  try {
    resources.message = await channel.send({
      embeds: [lobbyToEmbed(lobby, 0)],
      components: lobbyComponents(lobby, 0),
    });
    resources.thread = await resources.message.startThread({
      name: clamp(`🎮 ${lobby.game}`, 100),
      autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
      reason: "Neue Lobby",
    });
    await resources.thread.members.add(lobby.discordCreatorId);
    await resources.thread.send({
      content:
        `Organisiert euch hier für **${lobby.game}** – ` +
        "Teilnehmen geht über die Buttons direkt am Lobby-Post.",
    });
    return resources as LobbyPostResources;
  } catch (error) {
    try {
      await resources.thread?.delete("Lobby-Erstellung zurückgerollt");
    } catch (cleanupError) {
      console.error("[joint-bot] Verwaister Lobby-Thread:", cleanupError);
    }
    try {
      await resources.message?.delete();
    } catch (cleanupError) {
      console.error("[joint-bot] Verwaister Lobby-Post:", cleanupError);
    }
    throw error;
  }
}

export async function fetchLobbyThread(
  client: Client,
  lobby: Lobby,
): Promise<AnyThreadChannel | null> {
  if (!lobby.discordThreadId) return null;
  const channel = await client.channels.fetch(lobby.discordThreadId).catch(() => null);
  return channel?.isThread() ? channel : null;
}

export async function fetchLobbyMessage(client: Client, lobby: Lobby): Promise<Message | null> {
  if (!env.lobbyChannelId || !lobby.discordMessageId) return null;
  const channel = await client.channels.fetch(env.lobbyChannelId).catch(() => null);
  if (!channel || !("messages" in channel)) return null;
  return channel.messages.fetch(lobby.discordMessageId).catch(() => null);
}

export async function syncLobbyThreadMember(
  client: Client,
  lobby: Lobby,
  discordUserId: string,
  joined: boolean,
): Promise<void> {
  const thread = await fetchLobbyThread(client, lobby);
  if (!thread) return;
  if (thread.archived) await thread.setArchived(false, "Lobby-Teilnehmer aktualisiert");

  if (joined || discordUserId === lobby.discordCreatorId) {
    await thread.members.add(discordUserId);
  } else {
    await thread.members.remove(discordUserId);
  }
}

export async function closeLobbyThread(client: Client, lobby: Lobby): Promise<void> {
  try {
    const thread = await fetchLobbyThread(client, lobby);
    if (!thread || (thread.archived && thread.locked)) return;
    if (thread.archived) await thread.setArchived(false, "Lobby geschlossen");
    if (!thread.locked) await thread.setLocked(true, "Lobby geschlossen");
    await thread.setArchived(true, "Lobby geschlossen");
  } catch (error) {
    console.warn(`[joint-bot] Lobby-Thread konnte nicht geschlossen werden: ${lobby.game}`, error);
  }
}

export async function refreshLobbyPost(client: Client, lobby: Lobby): Promise<void> {
  const [message, participants] = await Promise.all([
    fetchLobbyMessage(client, lobby),
    listLobbyParticipantUserIds(lobby.id),
  ]);
  await message?.edit({
    embeds: [lobbyToEmbed(lobby, participants.length)],
    components: lobbyComponents(lobby, participants.length),
  });
}

export function lobbyMessageUrl(guildId: string | null | undefined, lobby: Lobby): string | null {
  if (!guildId || !env.lobbyChannelId || !lobby.discordMessageId) return null;
  return `https://discord.com/channels/${guildId}/${env.lobbyChannelId}/${lobby.discordMessageId}`;
}
