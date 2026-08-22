import type { RecordModel } from "pocketbase"
import { ensureSuperuser, pb } from "./pocketbase"

export const EVENT_TYPES = [
  "announcement",
  "food",
  "giveaway",
  "tournament",
  "workshop",
  "other",
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export interface JointEvent {
  id: string
  title: string
  description: string
  type: EventType
  location: string
  startsAt: string
  endsAt: string
  pinned: boolean
  isCanceled: boolean
  discordCreatorId: string
  discordGuildEventId: string
}

export function toJointEvent(record: RecordModel): JointEvent {
  return {
    id: record.id,
    title: String(record.title ?? ""),
    description: String(record.description ?? ""),
    type: record.type as EventType,
    location: String(record.location ?? ""),
    startsAt: String(record.startsAt ?? ""),
    endsAt: String(record.endsAt ?? ""),
    pinned: Boolean(record.pinned),
    isCanceled: Boolean(record.isCanceled),
    discordCreatorId: String(record.discordCreatorId ?? ""),
    discordGuildEventId: String(record.discordGuildEventId ?? ""),
  }
}

function escapeFilter(value: string): string {
  return value.replaceAll(`"`, `\\"`).replaceAll(`'`, `\\'`)
}

export async function listUpcomingEvents(
  options: { type?: EventType; limit?: number; includeCanceled?: boolean } = {},
): Promise<JointEvent[]> {
  await ensureSuperuser()

  let filter = options.includeCanceled ? "" : "isCanceled != true"
  filter += filter ? " && startsAt >= @now" : "startsAt >= @now"
  if (options.type) {
    filter += ` && type = '${escapeFilter(options.type)}'`
  }

  const records = await pb.collection("events").getList(1, options.limit ?? 10, {
    filter,
    sort: "+startsAt",
  })

  return records.items.map(toJointEvent)
}

export async function getEvent(id: string): Promise<JointEvent | null> {
  await ensureSuperuser()

  try {
    const record = await pb.collection("events").getOne(id)
    return toJointEvent(record)
  } catch {
    return null
  }
}

export async function findEventsByTitle(title: string, limit = 25): Promise<JointEvent[]> {
  await ensureSuperuser()

  const records = await pb.collection("events").getList(1, limit, {
    filter: `title ~ '${escapeFilter(title.trim())}'`,
    sort: "+startsAt",
  })

  return records.items.map(toJointEvent)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export async function createEvent(input: {
  title: string
  type: EventType
  startsAt: Date
  endsAt?: Date
  location?: string
  description?: string
  discordCreatorId?: string
}): Promise<JointEvent> {
  await ensureSuperuser()

  const record = await pb.collection("events").create({
    title: input.title,
    type: input.type,
    startsAt: input.startsAt.toISOString(),
    ...(input.endsAt ? { endsAt: input.endsAt.toISOString() } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { description: `<p>${escapeHtml(input.description)}</p>` } : {}),
    ...(input.discordCreatorId ? { discordCreatorId: input.discordCreatorId } : {}),
  })

  return toJointEvent(record)
}

export async function cancelEvent(id: string): Promise<void> {
  await ensureSuperuser()
  await pb.collection("events").update(id, { isCanceled: true })
}

export async function setDiscordGuildEventId(id: string, guildEventId: string): Promise<void> {
  await ensureSuperuser()
  await pb.collection("events").update(id, { discordGuildEventId: guildEventId })
}

export async function listAllEvents(): Promise<JointEvent[]> {
  await ensureSuperuser()
  const records = await pb.collection("events").getFullList()
  return records.map(toJointEvent)
}

export async function deleteEvent(id: string): Promise<void> {
  await ensureSuperuser()
  await pb.collection("events").delete(id)
}
