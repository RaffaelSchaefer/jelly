/**
 * Die anderen Jellies der Bühne: Reihenfolge in der Liste, Suche nach Namen und ihr Farbpunkt.
 *
 * @module
 */

import type { Equipped, PetColor, StagePlayer } from "./types";

import { PET_COLORS } from "./colors";

/** Die anderen Jellies nach Namen. Das eigene steht auch auf der Bühne, gehört aber nicht zur Wahl. */
export function sortStagePlayers(players: StagePlayer[], ownId?: number) {
  return players
    .filter((player) => player.id !== ownId)
    .sort((first, second) => first.name.localeCompare(second.name, "de"));
}

/**
 * Die Jellies, deren Name `query` enthält, ohne Rücksicht auf Groß- und Kleinschreibung.
 *
 * Ponytail: „muller“ findet „Müller“ nicht. Umlaute falten, wenn jemand ohne sie sucht.
 */
export function filterStagePlayers(players: StagePlayer[], query: string) {
  const wanted = query.trim().toLocaleLowerCase("de");
  return players.filter((player) => player.name.toLocaleLowerCase("de").includes(wanted));
}

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
