/**
 * Partner-Emotes ohne React: die Uhr einer Aufforderung und was ein Ereignis für dieses Jelly
 * heißt.
 *
 * @module
 */

import type { PartnerInvite } from "./types";

/** Was eine Aufforderung für dieses Jelly ist. */
export interface InviteChange {
  /** `incoming` richtet sich an dieses Jelly, `mine` stammt von ihm. */
  role: "incoming" | "mine";
  invite: PartnerInvite;
}

/** Ob `payload` wie eine Aufforderung aussieht. Ein neuerer Server darf anderes schicken. */
function isInvite(payload: unknown): payload is PartnerInvite {
  const invite = payload as PartnerInvite | null;
  return typeof invite?.id === "number" && typeof invite.partner_id === "number";
}

/**
 * Liest `partner_emote.updated`. `null`, wenn es dieses Jelly nicht betrifft: Rust lässt nur die
 * eigenen durch, aber die Oberfläche verlässt sich nicht darauf.
 */
export function classifyInvite(payload: unknown, ownId?: number): InviteChange | null {
  if (!isInvite(payload) || ownId === undefined) return null;
  if (payload.from_id === ownId) return { role: "mine", invite: payload };
  return payload.partner_id === ownId ? { role: "incoming", invite: payload } : null;
}
