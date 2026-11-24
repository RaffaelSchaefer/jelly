/**
 * Was das Pet vom eigenen Stapel mitbekommt: wo das Jelly im Turm steht und was es dazu sagt.
 * Geklettert wird auf der Karte, hier kommt nur `stack.changed` an.
 *
 * @module
 */

import type { ServerEvent } from "./types";

/** Der Stapel, auf dem das eigene Jelly steht, mit allen darauf von unten nach oben. */
export interface StackPlace {
  id: number;
  memberIds: number[];
}

/** Was ein `stack.changed` für das eigene Jelly bedeutet. */
export interface StackChange {
  /** Der Stapel danach, `null` auf dem Boden. */
  place: StackPlace | null;
  /** Was das Jelly sagt, `null`, wenn es nichts Neues für es ist. */
  message: string | null;
  /** Ob es gerade auf einen Turm geklettert ist. Dann hüpft es. */
  climbed: boolean;
}

const TEXT_STARTED = "Ich fang einen Turm an.";
const TEXT_CARRIED = "Huch, da klettert wer auf mich drauf!";
const TEXT_SLID = "Hoppla, ich rutsch ein Stück runter.";
const TEXT_DOWN = "Ich kletter wieder runter.";
const TEXT_FALLEN = "Hui, unser Turm fällt auseinander!";

/** Die Jellies eines Stapels, oder `null`, wenn das Ereignis nur seine ID trägt. */
function memberIdsOf(event: ServerEvent) {
  const ids = event.payload?.member_ids;
  return Array.isArray(ids) ? ids.map(Number) : null;
}

/** Ein Wechsel mit Satz, ohne Hüpfer. */
function said(place: StackPlace | null, message: string | null): StackChange {
  return { place, message, climbed: false };
}

/** Das Jelly ist neu auf diesem Stapel: Es hat ihn begonnen oder ist hinaufgeklettert. */
function arrived(place: StackPlace): StackChange {
  if (place.memberIds.length === 1) return said(place, TEXT_STARTED);
  return {
    place,
    message: `Ich kletter rauf, ${place.memberIds.length} Jellies hoch!`,
    climbed: true,
  };
}

/**
 * Der eigene Stapel steht weiter, mit dem Jelly darauf: Jemand ist hinaufgeklettert, oder einer ist
 * abgestiegen. Rutscht das Jelly dabei tiefer, merkt es das.
 */
function stillOn(before: StackPlace, place: StackPlace, ownId: number): StackChange {
  if (place.memberIds.length > before.memberIds.length) return said(place, TEXT_CARRIED);
  const isLower = place.memberIds.indexOf(ownId) < before.memberIds.indexOf(ownId);
  return said(place, isLower ? TEXT_SLID : null);
}

/**
 * Wie sich der Platz des Jellys `ownId` durch `event` ändert und was es dazu sagt. Ein Stapel, der
 * weiter steht, kommt ganz. Einer, der weg ist, kommt nur mit seiner ID: mit dem Jelly, das als
 * letztes abgestiegen ist, oder ohne, wenn seine Zeit um ist.
 */
export function stackChange(
  before: StackPlace | null,
  event: ServerEvent,
  ownId: number,
): StackChange {
  if (event.type !== "stack.changed") return said(before, null);
  const id = Number(event.payload?.id);
  const memberIds = memberIdsOf(event);
  const isKnown = before?.id === id;
  if (memberIds?.includes(ownId)) {
    const place = { id, memberIds };
    return isKnown && before ? stillOn(before, place, ownId) : arrived(place);
  }
  if (!isKnown) return said(before, null);
  if (memberIds || event.player_id === ownId) return said(null, TEXT_DOWN);
  return said(null, TEXT_FALLEN);
}
