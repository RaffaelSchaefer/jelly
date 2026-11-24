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

/** Die Jellies eines Stapels, oder `null`, wenn das Ereignis nur seine ID trägt. */
function memberIdsOf(event: ServerEvent) {
  const ids = event.payload?.member_ids;
  return Array.isArray(ids) ? ids.map(Number) : null;
}

/** Jemand ist hinaufgeklettert: das eigene Jelly selbst oder ein anderes über ihm. */
function afterClimb(event: ServerEvent, place: StackPlace, ownId: number): StackChange {
  if (event.player_id !== ownId)
    return { place, message: "Huch, da klettert wer auf mich drauf!", climbed: false };
  if (place.memberIds.length === 1)
    return { place, message: "Ich fang einen Turm an.", climbed: false };
  return {
    place,
    message: `Ich kletter rauf, ${place.memberIds.length} Jellies hoch!`,
    climbed: true,
  };
}

/** Jemand ist vom eigenen Stapel gestiegen, oder er ist auseinandergefallen (`player_id` fehlt). */
function afterLeave(event: ServerEvent, before: StackPlace, ownId: number): StackChange {
  if (event.player_id === null)
    return { place: null, message: "Hui, unser Turm fällt auseinander!", climbed: false };
  if (event.player_id === ownId)
    return { place: null, message: "Ich kletter wieder runter.", climbed: false };
  const level = before.memberIds.indexOf(event.player_id);
  if (level < 0) return { place: before, message: null, climbed: false };
  const below = level < before.memberIds.indexOf(ownId);
  return {
    place: { id: before.id, memberIds: before.memberIds.filter((id) => id !== event.player_id) },
    message: below ? "Hoppla, ich rutsch ein Stück runter." : null,
    climbed: false,
  };
}

/**
 * Wie sich der Platz des Jellys `ownId` durch `event` ändert und was es dazu sagt. Nach dem
 * Absteigen und beim Zerfall trägt `stack.changed` nur die ID des Stapels: Wer darauf steht, weiß
 * dann nur `before`. Ohne `before` bleibt so etwas still.
 */
export function stackChange(
  before: StackPlace | null,
  event: ServerEvent,
  ownId: number,
): StackChange {
  const unchanged = { place: before, message: null, climbed: false };
  if (event.type !== "stack.changed") return unchanged;
  const id = Number(event.payload?.id);
  const memberIds = memberIdsOf(event);
  if (memberIds?.includes(ownId)) return afterClimb(event, { id, memberIds }, ownId);
  if (before?.id !== id) return unchanged;
  if (memberIds) return { place: null, message: null, climbed: false };
  return afterLeave(event, before, ownId);
}
