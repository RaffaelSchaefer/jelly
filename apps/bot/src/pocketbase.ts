import { EventSource } from "eventsource"
import PocketBase from "pocketbase"
import { env } from "./env"

if (typeof globalThis.EventSource === "undefined") {
  ;(globalThis as { EventSource: unknown }).EventSource = EventSource
}

export const pb = new PocketBase(env.pocketbaseUrl)

let authenticated = false

export function hasSuperuser(): boolean {
  return Boolean(env.superuserEmail && env.superuserPassword)
}

export async function ensureSuperuser(): Promise<void> {
  if (!hasSuperuser()) return
  if (authenticated && pb.authStore.isValid) return

  await pb.collection("_superusers").authWithPassword(
    env.superuserEmail!,
    env.superuserPassword!,
  )
  authenticated = true
}
