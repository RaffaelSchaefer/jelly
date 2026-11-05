/**
 * Die anderen Jellies der Bühne: was das eigene zu einem neuen Ziel oder Ausflug sagt und wie ein
 * Partner aussieht.
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

/** Wo das Jelly gerade hinwill. `undefined` heißt: Es gibt noch keinen Stand. */
export interface Away {
  /** Das Jelly, bei dem es steht. */
  follow?: number | null;
  /** Ende des Ausflugs als Server-Zeit. */
  tripUntil?: number | null;
}

/**
 * Was das Jelly sagt, wenn sich Ziel oder Ausflug ändern, sonst `null`. Der Server beendet das
 * eine, wenn das andere beginnt. Dann zählt nur, was jetzt anfängt.
 */
export function awayMessage(before: Away, now: Away) {
  const { tripUntil: wasUntil } = before;
  const { tripUntil: until } = now;
  if (wasUntil !== undefined && until !== undefined && wasUntil !== until) {
    if (until !== null) return "Ich mach einen Ausflug.";
    if (!now.follow) return "Ich bin wieder da.";
  }
  return followMessage(before.follow, now.follow);
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

/**
 * Die Jellies, deren Name zum Suchtext passt, alphabetisch. Groß- und Kleinschreibung zählen nicht.
 * Das eigene fehlt, dafür gibt es einen eigenen Knopf. Ein leerer Suchtext passt zu allen.
 */
export function findPlayersByName<Player extends Pick<StagePlayer, "id" | "name">>(
  players: Player[],
  query: string,
  ownId: number | null,
): Player[] {
  const wanted = query.trim().toLocaleLowerCase("de");
  return players
    .filter((player) => player.id !== ownId && player.name.toLocaleLowerCase("de").includes(wanted))
    .sort((first, second) => first.name.localeCompare(second.name, "de", { numeric: true }));
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
