/**
 * Die anderen Jellies der Bühne: Reihenfolge in der Liste, Suche nach Namen und ihr Farbpunkt.
 *
 * @module
 */

import type { PetColor, StagePlayer } from "./types";

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

/** Grundfarbe eines Jellys. `undefined` bei einer Farbe, die die App nicht kennt. */
export function stagePlayerHex(color: string) {
  return Object.hasOwn(PET_COLORS, color) ? PET_COLORS[color as PetColor].hex : undefined;
}
