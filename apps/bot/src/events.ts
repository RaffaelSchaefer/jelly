import type { RecordModel } from "pocketbase";
import { ensureSuperuser, pb } from "./pocketbase";

export const EVENT_TYPES = [
  "announcement",
  "food",
  "giveaway",
  "tournament",
  "workshop",
  "game",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface JointEvent {
  id: string;
  title: string;
  description: string;
  bannerUrl: string;
  type: EventType;
  location: string;
  startsAt: string;
  endsAt: string;
  pinned: boolean;
  isCanceled: boolean;
  discordCreatorId: string;
  discordGuildEventId: string;
  game: string;
  gameUrl: string;
  playersWanted: number;
  discordThreadId: string;
}

export function toJointEvent(record: RecordModel): JointEvent {
  const banner = String(record.banner ?? "");

  return {
    id: record.id,
    title: String(record.title ?? ""),
    description: String(record.description ?? ""),
    bannerUrl: banner ? pb.files.getURL(record, banner) : "",
    type: record.type as EventType,
    location: String(record.location ?? ""),
    startsAt: String(record.startsAt ?? ""),
    endsAt: String(record.endsAt ?? ""),
    pinned: Boolean(record.pinned),
    isCanceled: Boolean(record.isCanceled),
    discordCreatorId: String(record.discordCreatorId ?? ""),
    discordGuildEventId: String(record.discordGuildEventId ?? ""),
    game: String(record.game ?? ""),
    gameUrl: String(record.gameUrl ?? ""),
    playersWanted: Number(record.playersWanted ?? 0),
    discordThreadId: String(record.discordThreadId ?? ""),
  };
}

const STEAM_APP_ID_MAX = 4_294_967_295;

function steamUrl(value: string): string | null {
  const appId = Number(value);
  if (!Number.isSafeInteger(appId) || appId < 1 || appId > STEAM_APP_ID_MAX) return null;
  return `https://store.steampowered.com/app/${appId}/`;
}

export function normalizeGameDestination(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (/^\d+$/.test(value)) {
    const url = steamUrl(value);
    if (!url) throw new Error("Die Steam-App-ID ist ungültig.");
    return url;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Das Spielziel muss eine Steam-App-ID oder vollständige HTTPS-URL sein.");
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Das Spielziel muss eine HTTPS-URL ohne Zugangsdaten sein.");
  }

  if (
    ["store.steampowered.com", "www.store.steampowered.com"].includes(url.hostname.toLowerCase())
  ) {
    const match = url.pathname.match(/^\/app\/(\d+)(?:\/|$)/);
    const canonical = match ? steamUrl(match[1]) : null;
    if (!canonical) throw new Error("Der Steam-Link muss auf eine gültige App-Seite zeigen.");
    return canonical;
  }

  if (url.href.length > 500) throw new Error("Das Spielziel darf höchstens 500 Zeichen lang sein.");
  return url.href;
}

function escapeFilter(value: string): string {
  return value.replaceAll(`"`, `\\"`).replaceAll(`'`, `\\'`);
}

function pocketBaseDate(date: Date): string {
  return date.toISOString().replace("T", " ");
}

export async function listUpcomingEvents(
  options: { type?: EventType; limit?: number; includeCanceled?: boolean } = {},
): Promise<JointEvent[]> {
  await ensureSuperuser();

  let filter = options.includeCanceled ? "" : "isCanceled != true";
  filter += filter ? " && startsAt >= @now" : "startsAt >= @now";
  if (options.type) {
    filter += ` && type = '${escapeFilter(options.type)}'`;
  }

  const records = await pb.collection("events").getList(1, options.limit ?? 10, {
    filter,
    sort: "+startsAt",
  });

  return records.items.map(toJointEvent);
}

export async function listLinkedCurrentEvents(now = new Date()): Promise<JointEvent[]> {
  await ensureSuperuser();

  const nowIso = pocketBaseDate(now);
  const fallbackStart = pocketBaseDate(new Date(now.getTime() - 2 * 60 * 60 * 1000));
  const records = await pb.collection("events").getFullList({
    filter:
      `isCanceled != true && discordGuildEventId != '' && ` +
      `(startsAt >= '${nowIso}' || endsAt > '${nowIso}' || ` +
      `(endsAt = '' && startsAt >= '${fallbackStart}'))`,
    sort: "+startsAt",
  });

  return records.map(toJointEvent);
}

export async function listAutoStartCandidates(now: Date): Promise<JointEvent[]> {
  await ensureSuperuser();

  const nowIso = pocketBaseDate(now);
  const fallbackStart = pocketBaseDate(new Date(now.getTime() - 2 * 60 * 60 * 1000));
  const records = await pb.collection("events").getFullList({
    filter:
      `isCanceled != true && discordGuildEventId != '' && startsAt <= '${nowIso}' && ` +
      `(endsAt > '${nowIso}' || (endsAt = '' && startsAt >= '${fallbackStart}'))`,
    sort: "+startsAt",
  });

  return records.map(toJointEvent);
}

export async function getEvent(id: string): Promise<JointEvent | null> {
  await ensureSuperuser();

  try {
    const record = await pb.collection("events").getOne(id);
    return toJointEvent(record);
  } catch {
    return null;
  }
}

export async function findEventByDiscordGuildEventId(
  guildEventId: string,
): Promise<JointEvent | null> {
  await ensureSuperuser();

  try {
    const record = await pb
      .collection("events")
      .getFirstListItem(`discordGuildEventId = '${escapeFilter(guildEventId)}'`);
    return toJointEvent(record);
  } catch {
    return null;
  }
}

export async function findEventsByTitle(title: string, limit = 25): Promise<JointEvent[]> {
  await ensureSuperuser();

  const records = await pb.collection("events").getList(1, limit, {
    filter: `title ~ '${escapeFilter(title.trim())}'`,
    sort: "+startsAt",
  });

  return records.items.map(toJointEvent);
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function createEvent(input: {
  title: string;
  type: EventType;
  startsAt: Date;
  endsAt?: Date;
  location?: string;
  description?: string;
  banner?: File;
  discordCreatorId?: string;
  discordGuildEventId?: string;
  game?: string;
  gameUrl?: string;
  playersWanted?: number;
  discordThreadId?: string;
}): Promise<JointEvent> {
  await ensureSuperuser();

  const record = await pb.collection("events").create({
    title: input.title,
    type: input.type,
    startsAt: input.startsAt.toISOString(),
    ...(input.endsAt ? { endsAt: input.endsAt.toISOString() } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { description: `<p>${escapeHtml(input.description)}</p>` } : {}),
    ...(input.banner ? { banner: input.banner } : {}),
    ...(input.discordCreatorId ? { discordCreatorId: input.discordCreatorId } : {}),
    ...(input.discordGuildEventId ? { discordGuildEventId: input.discordGuildEventId } : {}),
    ...(input.game ? { game: input.game } : {}),
    ...(input.gameUrl ? { gameUrl: input.gameUrl } : {}),
    ...(input.playersWanted ? { playersWanted: input.playersWanted } : {}),
    ...(input.discordThreadId ? { discordThreadId: input.discordThreadId } : {}),
  });

  return toJointEvent(record);
}

export async function cancelEvent(id: string): Promise<void> {
  await ensureSuperuser();
  await pb.collection("events").update(id, { isCanceled: true });
}

export async function listAllEvents(): Promise<JointEvent[]> {
  await ensureSuperuser();
  const records = await pb.collection("events").getFullList();
  return records.map(toJointEvent);
}

export async function deleteEvent(id: string): Promise<void> {
  await ensureSuperuser();
  await pb.collection("events").delete(id);
}

interface EventAttendeeRecord {
  id: string;
  event: string;
  discordUserId: string;
}

async function listEventAttendeeRecords(eventId: string): Promise<EventAttendeeRecord[]> {
  await ensureSuperuser();
  const records = await pb.collection("event_attendees").getFullList({
    filter: `event = '${escapeFilter(eventId)}'`,
    fields: "id,event,discordUserId",
  });
  return records.map((record) => ({
    id: record.id,
    event: String(record.event),
    discordUserId: String(record.discordUserId),
  }));
}

export function diffAttendeeIds(
  currentIds: Iterable<string>,
  discordIds: Iterable<string>,
): { add: string[]; remove: string[] } {
  const current = new Set(currentIds);
  const discord = new Set(discordIds);
  return {
    add: [...discord].filter((id) => !current.has(id)),
    remove: [...current].filter((id) => !discord.has(id)),
  };
}

export async function listEventAttendeeUserIds(eventId: string): Promise<string[]> {
  const records = await listEventAttendeeRecords(eventId);
  return records.map((record) => record.discordUserId);
}

export async function getEventAttendeeCounts(events: JointEvent[]): Promise<Map<string, number>> {
  const counts = new Map(events.map((event) => [event.id, 0]));
  if (events.length === 0) return counts;

  await ensureSuperuser();
  const filter = events.map((event) => `event = '${escapeFilter(event.id)}'`).join(" || ");
  const records = await pb.collection("event_attendees").getFullList({
    filter: `(${filter})`,
    fields: "event",
  });

  for (const record of records) {
    const eventId = String(record.event);
    counts.set(eventId, (counts.get(eventId) ?? 0) + 1);
  }
  return counts;
}

async function findEventAttendeeRecordId(
  eventId: string,
  discordUserId: string,
): Promise<string | null> {
  try {
    const record = await pb
      .collection("event_attendees")
      .getFirstListItem(
        `event = '${escapeFilter(eventId)}' && discordUserId = '${escapeFilter(discordUserId)}'`,
        { fields: "id" },
      );
    return record.id;
  } catch {
    return null;
  }
}

export async function addEventAttendee(eventId: string, discordUserId: string): Promise<void> {
  await ensureSuperuser();

  try {
    await pb.collection("event_attendees").create({ event: eventId, discordUserId });
  } catch (error) {
    if (await findEventAttendeeRecordId(eventId, discordUserId)) return;
    throw error;
  }
}

export async function removeEventAttendee(eventId: string, discordUserId: string): Promise<void> {
  await ensureSuperuser();
  const recordId = await findEventAttendeeRecordId(eventId, discordUserId);
  if (recordId) await pb.collection("event_attendees").delete(recordId);
}

export async function reconcileEventAttendees(
  eventId: string,
  discordUserIds: Iterable<string>,
): Promise<void> {
  const current = await listEventAttendeeRecords(eventId);
  const byUserId = new Map(current.map((record) => [record.discordUserId, record.id]));
  const changes = diffAttendeeIds(byUserId.keys(), discordUserIds);

  for (const discordUserId of changes.add) {
    await addEventAttendee(eventId, discordUserId);
  }
  for (const discordUserId of changes.remove) {
    await pb.collection("event_attendees").delete(byUserId.get(discordUserId)!);
  }
}
