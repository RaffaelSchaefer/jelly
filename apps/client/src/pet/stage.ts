/**
 * Die anderen Jellies der Bühne: was das eigene zu einem neuen Ziel sagt und wie ein Partner
 * aussieht.
 *
 * @module
 */

import type { Equipped, PetColor, StagePlayer } from "./types";

import { PET_COLORS } from "./colors";

/**
 * Was das Jelly sagt, wenn sich sein Ziel ändert, sonst `null`. `undefined` heißt: Es gibt noch
 * keinen Stand, dann ist auch ein gesetztes Ziel keine Neuigkeit.
 */
export function followMessage(before: number | null | undefined, now?: number | null) {
  if (before === undefined || now === undefined || before === now) return null;
  return now === null ? "Ich geh wieder meiner Wege." : "Ich stell mich dazu.";
}

/** Grundfarbe eines Jellys. `undefined` bei einer Farbe, die die App nicht kennt. */
export function stagePlayerHex(color: string) {
  return Object.hasOwn(PET_COLORS, color) ? PET_COLORS[color as PetColor].hex : undefined;
}

/**
 * Eine Farbe, die die App kennt. Eine unbekannte wird zur Grundfarbe: Ein neuerer Server kann sie
 * liefern.
 */
export function knownPetColor(color: string): PetColor {
  return stagePlayerHex(color) ? (color as PetColor) : "mint";
}

/** Wie ein anderes Jelly aussieht, wenn es für ein Partner-Emote herüberkommt. */
export interface PartnerLook {
  color: PetColor;
  equipped: Equipped;
}

/** Das Aussehen von Jelly `id`, oder `null`, wenn es nicht auf der Bühne steht. */
export function partnerLook(players: StagePlayer[], id: number): PartnerLook | null {
  const player = players.find((item) => item.id === id);
  if (!player) return null;
  return { color: knownPetColor(player.color), equipped: player.equipped };
}
