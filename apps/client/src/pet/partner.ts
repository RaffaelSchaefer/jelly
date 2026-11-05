/**
 * Partner-Emotes ohne React: die Uhr einer Aufforderung und was ein Ereignis für dieses Jelly
 * heißt.
 *
 * @module
 */

import type { PartnerInvite } from "./types";

/** Ab diesem Anteil der Restzeit drängt die Uhr. */
const PARTNER_CLOCK_URGENT = 0.25;

/** Wie voll die Uhr noch ist, von 0 bis 1, und ob man sich beeilen muss. */
export function partnerClock(remainingMs: number, durationMs: number) {
  const left = Math.min(1, Math.max(0, remainingMs / durationMs));
  return { left, urgent: left <= PARTNER_CLOCK_URGENT };
}

/** Was eine Aufforderung für dieses Jelly ist. */
export interface InviteChange {
  /** `incoming` richtet sich an dieses Jelly, `mine` stammt von ihm. */
  role: "incoming" | "mine";
  invite: PartnerInvite;
}

/** Ob `payload` wie eine Aufforderung aussieht. Ein neuerer Server darf anderes schicken. */
function isInvite(payload: unknown): payload is PartnerInvite {
  const invite = payload as PartnerInvite | null;
  return typeof invite?.id === "number" && Array.isArray(invite.partner_ids);
}

/**
 * Liest `partner_emote.updated`. `null`, wenn es dieses Jelly nicht betrifft: Rust lässt nur die
 * eigenen durch, aber die Oberfläche verlässt sich nicht darauf.
 */
export function classifyInvite(payload: unknown, ownId?: number): InviteChange | null {
  if (!isInvite(payload) || ownId === undefined) return null;
  if (payload.from_id === ownId) return { role: "mine", invite: payload };
  return payload.partner_ids.includes(ownId) ? { role: "incoming", invite: payload } : null;
}
