import type { RecordModel } from "pocketbase";
import { ensureSuperuser, pb } from "./pocketbase";

export interface Lobby {
  id: string;
  game: string;
  gameUrl: string;
  playersWanted: number;
  startsAt: string;
  location: string;
  discordCreatorId: string;
  discordMessageId: string;
  discordThreadId: string;
  isClosed: boolean;
  createdBy: string;
}

export function toLobby(record: RecordModel): Lobby {
  return {
    id: record.id,
    game: String(record.game ?? ""),
    gameUrl: String(record.gameUrl ?? ""),
    playersWanted: Number(record.playersWanted ?? 0),
    startsAt: String(record.startsAt ?? ""),
    location: String(record.location ?? ""),
    discordCreatorId: String(record.discordCreatorId ?? ""),
    discordMessageId: String(record.discordMessageId ?? ""),
    discordThreadId: String(record.discordThreadId ?? ""),
    isClosed: Boolean(record.isClosed),
    createdBy: String(record.createdBy ?? ""),
  };
}

function escapeFilter(value: string): string {
  return value.replaceAll(`"`, `\\"`).replaceAll(`'`, `\\'`);
}

export function createLobby(input: {
  game: string;
  gameUrl?: string;
  playersWanted?: number;
  startsAt?: Date;
  location?: string;
  discordCreatorId: string;
}): Promise<Lobby> {
  return ensureSuperuser().then(() =>
    pb
      .collection("lobbies")
      .create({
        game: input.game,
        ...(input.gameUrl ? { gameUrl: input.gameUrl } : {}),
        ...(input.playersWanted ? { playersWanted: input.playersWanted } : {}),
        ...(input.startsAt ? { startsAt: input.startsAt.toISOString() } : {}),
        ...(input.location ? { location: input.location } : {}),
        discordCreatorId: input.discordCreatorId,
      })
      .then(toLobby),
  );
}

export async function getLobby(id: string): Promise<Lobby | null> {
  await ensureSuperuser();

  try {
    const record = await pb.collection("lobbies").getOne(id);
    return toLobby(record);
  } catch {
    return null;
  }
}

async function updateLobby(id: string, body: Record<string, unknown>): Promise<void> {
  await ensureSuperuser();
  await pb.collection("lobbies").update(id, body);
}

export async function setLobbyPost(
  id: string,
  post: { discordMessageId: string; discordThreadId: string },
): Promise<void> {
  await updateLobby(id, post);
}

export async function closeLobby(id: string): Promise<void> {
  await updateLobby(id, { isClosed: true });
}

export async function deleteLobby(id: string): Promise<void> {
  await ensureSuperuser();
  await pb.collection("lobbies").delete(id);
}

const OPEN_FILTER = "isClosed != true";

export async function listOpenLobbies(limit = 25): Promise<Lobby[]> {
  await ensureSuperuser();

  const records = await pb.collection("lobbies").getList(1, limit, {
    filter: OPEN_FILTER,
    sort: "+startsAt",
  });

  return records.items.map(toLobby);
}

export async function findOpenLobbiesByGame(game: string, limit = 25): Promise<Lobby[]> {
  await ensureSuperuser();

  const query = escapeFilter(game.trim());
  if (!query) return listOpenLobbies(limit);

  const records = await pb.collection("lobbies").getList(1, limit, {
    filter: `${OPEN_FILTER} && game ~ '${query}'`,
    sort: "+startsAt",
  });

  return records.items.map(toLobby);
}

interface LobbyParticipantRecord {
  lobby: string;
  discordUserId: string;
}

async function listLobbyParticipantRecords(lobbyId: string): Promise<LobbyParticipantRecord[]> {
  await ensureSuperuser();
  const records = await pb.collection("lobby_participants").getFullList({
    filter: `lobby = '${escapeFilter(lobbyId)}'`,
    fields: "id,lobby,discordUserId",
  });
  return records.map((record) => ({
    lobby: String(record.lobby),
    discordUserId: String(record.discordUserId),
  }));
}

export async function listLobbyParticipantUserIds(lobbyId: string): Promise<string[]> {
  const records = await listLobbyParticipantRecords(lobbyId);
  return records.map((record) => record.discordUserId);
}

export async function addLobbyParticipant(lobbyId: string, discordUserId: string): Promise<void> {
  await ensureSuperuser();

  try {
    await pb.collection("lobby_participants").create({ lobby: lobbyId, discordUserId });
  } catch (error) {
    const existing = await pb.collection("lobby_participants").getFullList({
      filter:
        `lobby = '${escapeFilter(lobbyId)}' && ` +
        `discordUserId = '${escapeFilter(discordUserId)}'`,
      fields: "id",
    });
    if (existing.length > 0) return;
    throw error;
  }
}

export async function removeLobbyParticipant(
  lobbyId: string,
  discordUserId: string,
): Promise<void> {
  await ensureSuperuser();
  const records = await pb.collection("lobby_participants").getFullList({
    filter:
      `lobby = '${escapeFilter(lobbyId)}' && ` + `discordUserId = '${escapeFilter(discordUserId)}'`,
    fields: "id",
  });
  for (const record of records) {
    await pb.collection("lobby_participants").delete(record.id);
  }
}

export async function getLobbyParticipantCounts(lobbies: Lobby[]): Promise<Map<string, number>> {
  const counts = new Map(lobbies.map((lobby) => [lobby.id, 0]));
  if (lobbies.length === 0) return counts;

  await ensureSuperuser();
  const filter = lobbies.map((lobby) => `lobby = '${escapeFilter(lobby.id)}'`).join(" || ");
  const records = await pb.collection("lobby_participants").getFullList({
    filter: `(${filter})`,
    fields: "lobby",
  });

  for (const record of records) {
    const lobbyId = String(record.lobby);
    counts.set(lobbyId, (counts.get(lobbyId) ?? 0) + 1);
  }
  return counts;
}
