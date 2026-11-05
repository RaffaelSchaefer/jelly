/**
 * Partner-Emotes ohne React: die Uhr einer Aufforderung und was ein Ereignis für dieses Jelly
 * heißt.
 *
 * @module
 */

import type { PartnerInvite } from "./types";

/**
 * Bis zu diesem Abstand in Jelly-Einheiten lohnt eine Aufforderung. Die Regel `near_distance` steht
 * in keiner Antwort an Spieler, das ist ihr Standardwert. Weicht die Orga ab, entscheidet trotzdem
 * der Server und antwortet `too_far`.
 */
export const NEAR_DISTANCE = 6;

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
