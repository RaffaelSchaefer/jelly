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
  }
}

function escapeFilter(value: string): string {
  return value.replaceAll(`"`, `\\"`).replaceAll(`'`, `\\'`)
}

export async function listUpcomingEvents(
  options: { type?: EventType; limit?: number } = {},
): Promise<JointEvent[]> {
  await ensureSuperuser()

  let filter = "startsAt >= @now"
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
}): Promise<JointEvent> {
  await ensureSuperuser()

  const record = await pb.collection("events").create({
    title: input.title,
    type: input.type,
    startsAt: input.startsAt.toISOString(),
    ...(input.endsAt ? { endsAt: input.endsAt.toISOString() } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.description ? { description: `<p>${escapeHtml(input.description)}</p>` } : {}),
  })

  return toJointEvent(record)
}
