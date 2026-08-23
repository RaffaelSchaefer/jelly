import type { Client } from "discord.js";
import { env } from "./env";
import { getLobby, listOpenLobbies, setLobbyPost, toLobby, type Lobby } from "./lobbies";
import {
  closeLobbyThread,
  createLobbyPost,
  fetchLobbyMessage,
  fetchLobbyThread,
  refreshLobbyPost,
  resolveLobbyChannel,
  syncLobbyThreadMember,
} from "./lobby-post";
import { ensureSuperuser, pb } from "./pocketbase";

export interface LobbyMarkers {
  discordMessageId: string;
  discordThreadId: string;
  isClosed: boolean;
}

export function shouldPostLobby(
  lobby: Pick<Lobby, "createdBy" | "discordMessageId" | "isClosed">,
): boolean {
  return lobby.createdBy !== "" && lobby.discordMessageId === "" && !lobby.isClosed;
}

export function isMarkerOnlyChange(before: LobbyMarkers, after: LobbyMarkers): boolean {
  return (
    before.isClosed === after.isClosed &&
    (before.discordMessageId !== after.discordMessageId ||
      before.discordThreadId !== after.discordThreadId)
  );
}

const RECENT_TTL_MS = 15_000;
const recent = new Map<string, number>();

export function wasRecentlyHandled(key: string, now = Date.now()): boolean {
  const at = recent.get(key);
  if (at === undefined) return false;
  if (now - at > RECENT_TTL_MS) {
    recent.delete(key);
    return false;
  }
  return true;
}

export function markHandled(key: string, now = Date.now()): void {
  for (const [existing, at] of recent) {
    if (now - at > RECENT_TTL_MS) recent.delete(existing);
  }
  recent.set(key, now);
}

const lobbyMarkers = new Map<string, LobbyMarkers>();

function toMarkers(lobby: Lobby): LobbyMarkers {
  return {
    discordMessageId: lobby.discordMessageId,
    discordThreadId: lobby.discordThreadId,
    isClosed: lobby.isClosed,
  };
}

async function postWebLobby(client: Client, lobby: Lobby): Promise<void> {
  const channel = await resolveLobbyChannel(client);
  const post = await createLobbyPost(channel, lobby);
  await setLobbyPost(lobby.id, {
    discordMessageId: post.message.id,
    discordThreadId: post.thread.id,
  });
  console.log(`[joint-bot] Web-Lobby gepostet: ${lobby.game}`);
}

async function reconcileUnpostedLobbies(client: Client): Promise<void> {
  const lobbies = await listOpenLobbies(100);
  for (const lobby of lobbies) {
    lobbyMarkers.set(lobby.id, toMarkers(lobby));
    if (!shouldPostLobby(lobby)) continue;
    try {
      await postWebLobby(client, lobby);
    } catch (error) {
      console.warn(`[joint-bot] Web-Lobby konnte nicht gepostet werden: ${lobby.game}`, error);
    }
  }
}

async function handleLobbyChange(client: Client, lobby: Lobby): Promise<void> {
  const before = lobbyMarkers.get(lobby.id);
  const after = toMarkers(lobby);
  lobbyMarkers.set(lobby.id, after);

  if (before && isMarkerOnlyChange(before, after)) return;

  if (!before && shouldPostLobby(lobby)) {
    await postWebLobby(client, lobby);
    return;
  }

  if (!lobby.discordMessageId) return;

  if (lobby.isClosed && before && !before.isClosed) {
    await closeLobbyThread(client, lobby);
  }
  await refreshLobbyPost(client, lobby);
}

async function handleParticipantChange(
  client: Client,
  lobbyId: string,
  discordUserId: string,
  joined: boolean,
): Promise<void> {
  const lobby = await getLobby(lobbyId);
  if (!lobby || !lobby.discordMessageId || lobby.isClosed) return;
  await syncLobbyThreadMember(client, lobby, discordUserId, joined);
  await refreshLobbyPost(client, lobby);
}

async function subscribeLobbies(client: Client): Promise<void> {
  await pb.collection("lobbies").subscribe("*", (data) => {
    void (async () => {
      try {
        if (data.action === "delete") {
          lobbyMarkers.delete(data.record.id);
          const lobby = toLobby(data.record);
          const [message, thread] = await Promise.all([
            fetchLobbyMessage(client, lobby),
            fetchLobbyThread(client, lobby),
          ]);
          await thread?.delete("Lobby gelöscht").catch(() => {});
          await message?.delete().catch(() => {});
          return;
        }
        if (data.action !== "create" && data.action !== "update") return;
        await handleLobbyChange(client, toLobby(data.record));
      } catch (error) {
        console.error("[joint-bot] Lobby-Sync fehlgeschlagen:", error);
      }
    })();
  });
}

async function subscribeLobbyParticipants(client: Client): Promise<void> {
  await pb.collection("lobby_participants").subscribe("*", (data) => {
    if (data.action !== "create" && data.action !== "delete") return;
    const lobbyId = String(data.record.lobby ?? "");
    const discordUserId = String(data.record.discordUserId ?? "");
    if (!lobbyId || !discordUserId) return;
    const key = `${data.action}:${lobbyId}:${discordUserId}`;
    if (wasRecentlyHandled(key)) return;
    markHandled(key);
    void handleParticipantChange(client, lobbyId, discordUserId, data.action === "create").catch(
      (error) => {
        console.error("[joint-bot] Lobby-Teilnehmer-Sync fehlgeschlagen:", error);
      },
    );
  });
}

export async function startLobbySync(client: Client): Promise<void> {
  if (!env.lobbyChannelId) {
    console.log("[joint-bot] Kein LOBBY_CHANNEL_ID gesetzt – Web-Lobby-Sync deaktiviert");
    return;
  }
  await ensureSuperuser();
  await reconcileUnpostedLobbies(client);
  await subscribeLobbies(client);
  await subscribeLobbyParticipants(client);
  console.log("[joint-bot] Lobby-Sync aktiv (Web → Discord)");
}
