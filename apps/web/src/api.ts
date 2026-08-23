import PocketBase, { ClientResponseError, type RecordModel } from "pocketbase";
import type {
  EventRecord,
  GameSuggestion,
  LobbyRecord,
  MembershipRecord,
  UserRecord,
} from "./types";

export const apiBase = import.meta.env.VITE_POCKETBASE_URL || window.location.origin;
export const pb = new PocketBase(apiBase);
pb.autoCancellation(false);

const as = <T>(record: RecordModel) => record as unknown as T;

export async function listEvents(): Promise<EventRecord[]> {
  return (
    await pb.collection("events").getFullList({
      sort: "-pinned,+startsAt",
      expand: "gameRef,createdBy",
    })
  ).map(as<EventRecord>);
}

export async function listLobbies(): Promise<LobbyRecord[]> {
  return (
    await pb.collection("lobbies").getFullList({
      sort: "+startsAt",
      expand: "gameRef,createdBy",
    })
  ).map(as<LobbyRecord>);
}

export async function listMemberships(
  collection: "event_attendees" | "lobby_participants",
): Promise<MembershipRecord[]> {
  return (await pb.collection(collection).getFullList()).map(as<MembershipRecord>);
}

export async function searchGames(query: string): Promise<GameSuggestion[]> {
  if (query.trim().length < 2) return [];
  const response = await fetch(
    `${apiBase}/api/joint/games/search?q=${encodeURIComponent(query.trim())}`,
  );
  if (!response.ok) throw new Error("Die Spielsuche ist gerade nicht erreichbar.");
  return ((await response.json()) as { suggestions: GameSuggestion[] }).suggestions;
}

export function eventBanner(event: EventRecord): string {
  return event.banner ? pb.files.getURL(event as unknown as RecordModel, event.banner) : "";
}

export function displayError(error: unknown): string {
  if (error instanceof ClientResponseError) {
    const reason = (error.response?.data as { reason?: string } | undefined)?.reason;
    if (reason === "full") return "Leider schon voll – such dir eine andere Runde aus.";
    if (reason === "closed") return "Diese Runde ist bereits geschlossen.";
    if (reason === "missing") return "Dieser Eintrag existiert nicht mehr.";
    return error.response?.message || error.message || "Die Aktion ist fehlgeschlagen.";
  }
  return error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen.";
}

export function countBy(records: MembershipRecord[], key: "event" | "lobby"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const id = record[key];
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function discordAvatar(discordId: string): string {
  let index = 0;
  try {
    index = Number((BigInt(discordId) >> 22n) % 6n);
  } catch {
    index = [...discordId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

export function discordThreadUrl(threadId: string): string {
  const guildId = import.meta.env.VITE_DISCORD_GUILD_ID;
  return guildId && threadId ? `https://discord.com/channels/${guildId}/${threadId}` : "";
}

export function discordEventUrl(eventId: string): string {
  const guildId = import.meta.env.VITE_DISCORD_GUILD_ID;
  return guildId && eventId ? `https://discord.com/events/${guildId}/${eventId}` : "";
}

export function currentUser(): UserRecord | null {
  return pb.authStore.record ? as<UserRecord>(pb.authStore.record) : null;
}
