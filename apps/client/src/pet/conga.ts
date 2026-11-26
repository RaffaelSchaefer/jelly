/**
 * Was das Pet von seiner Polonaise mitbekommt: ob das eigene Jelly in einer steht, was es dazu sagt
 * und welche Musik dazu läuft. Eine Polonaise sind mindestens drei Jellies, die einander folgen
 * (Erfolg `conga`). Gebildet wird sie auf der Karte mit „Dazustellen“, wer dazugehört, rechnet
 * `findCongaLines` aus `@jelly/stage` wie für die Bühne.
 *
 * @module
 */

import { findCongaLines, type CongaPlayer } from "@jelly/stage/conga";

import { loopSegments, type SoundLoop, type SoundSegment } from "./newsBed";

/** Die Polonaise, in der das eigene Jelly steht. */
export interface CongaPlace {
  /** Alle darin von vorn nach hinten. */
  memberIds: number[];
  /** Platz des eigenen Jellys, 0 ganz vorn. */
  rank: number;
  /** Wann das letzte Dazustellen darin von selbst endet, als Server-Zeit. Danach ist sie vorbei. */
  endsAt: number;
}

/** Was eine Änderung an der eigenen Polonaise für das Jelly bedeutet. */
export interface CongaChange {
  /** Was das Jelly sagt, `null`, wenn es nichts Neues für es ist. */
  message: string | null;
  /** Ob es dabei hüpft: wenn es neu in einer Polonaise steht. */
  hops: boolean;
}

/** Wie das Jelly eine Polonaise aus so vielen zählt. Darüber nennt es die Zahl. */
const CROWDS: Readonly<Record<number, string>> = {
  3: "zu dritt",
  4: "zu viert",
  5: "zu fünft",
  6: "zu sechst",
  7: "zu siebt",
  8: "zu acht",
  9: "zu neunt",
  10: "zu zehnt",
};

const TEXT_OVER = "Die Polonaise ist vorbei. Schön war’s!";

/** „zu dritt“, „zu viert“, ab elf „11 Jellies“. */
function crowd(count: number) {
  return CROWDS[count] ?? `${count} Jellies`;
}

/**
 * Die Polonaise des Jellys `ownId` unter `players` zur Server-Zeit `serverTime`, `null` ohne. Ein
 * abgelaufenes Dazustellen zählt nicht mehr.
 */
export function ownConga(
  players: CongaPlayer[],
  ownId: number,
  serverTime: number,
): CongaPlace | null {
  const lines = findCongaLines(players, serverTime);
  const line = lines.find((candidate) => candidate.memberIds.includes(ownId));
  if (!line) return null;
  const followers = new Set(line.follows.map((follow) => follow.followerId));
  const ends = players
    .filter((player) => followers.has(player.id))
    .map((player) => player.follow?.ends_at ?? 0);
  return {
    memberIds: line.memberIds,
    rank: line.memberIds.indexOf(ownId),
    endsAt: Math.max(...ends),
  };
}

/** Wer wem folgt und wann, laut Bühne. */
export interface CongaReading {
  players: CongaPlayer[];
  serverTime: number;
}

/**
 * Die Polonaise des Jellys `ownId` nach einem Lesen der Bühne, `undefined`, wenn sie bleibt, wie
 * sie war. Ohne `reading` ist das Lesen gescheitert: Dann bleibt `before` stehen, ein leerer Stand
 * hieße fälschlich „vorbei“. Nur wenn ihr letztes `ends_at` schon um ist, endet sie auch ohne
 * Antwort.
 *
 * @param clock - Die Uhr des Servers, wie das Pet sie kennt. Es gilt die spätere beider Uhren: Was
 *   nach der eigenen schon abgelaufen ist, zählt nicht mehr, auch wenn die Antwort der Bühne eine
 *   Spur früher gestempelt ist.
 */
export function congaAfterRead(
  reading: CongaReading | null,
  before: CongaPlace | null,
  ownId: number,
  clock: number,
): CongaPlace | null | undefined {
  if (reading) return ownConga(reading.players, ownId, Math.max(reading.serverTime, clock));
  return before && before.endsAt <= clock ? null : undefined;
}

/**
 * Was das Jelly dazu sagt, dass seine Polonaise jetzt `after` ist statt `before`. Neu in einer
 * hüpft es. Wer nur den Platz wechselt oder wessen Polonaise sich bloß verlängert, schweigt.
 */
export function congaChange(before: CongaPlace | null, after: CongaPlace | null): CongaChange {
  if (!after) return { message: before ? TEXT_OVER : null, hops: false };
  const count = after.memberIds.length;
  if (!before) return { message: `Polonaise! Wir sind ${crowd(count)}.`, hops: true };
  const was = before.memberIds.length;
  if (count > was) {
    return { message: `Die Polonaise wächst, wir sind ${crowd(count)}!`, hops: false };
  }
  if (count < was) {
    return { message: `Schade, da geht wer. Wir sind noch ${crowd(count)}.`, hops: false };
  }
  return { message: null, hops: false };
}

/** Ob zwei Polonaisen dieselbe sind: dieselben Jellies in derselben Reihe, mit demselben Ende. */
export function sameConga(first: CongaPlace | null, second: CongaPlace | null) {
  if (!first || !second) return first === second;
  return (
    first.rank === second.rank &&
    first.endsAt === second.endsAt &&
    first.memberIds.join() === second.memberIds.join()
  );
}

/**
 * Die Schleife der Musik zur Polonaise in `sounds/conga/bed.mp3`: 64 Schläge des Stücks, also 16
 * Takte bei gut 130 Schlägen je Minute. `CONGA_BEAT_MS` in `@jelly/stage` ist derselbe Schlag, so
 * passt der Tanz zum Tempo. Die Überblendung ist kurz und liegt in der Pause vor dem ersten Schlag:
 * Beide Stellen laufen im selben Takt, über einen Schlag hinweg höbe sie ihn an.
 */
export const CONGA_BED = {
  loopStart: 0.26,
  loopEnd: 29.76,
  crossfade: 0.23,
  fadeIn: 1.5,
  fadeOut: 1.5,
} as const satisfies SoundLoop;

/**
 * So lange läuft die Musik höchstens am Stück, in Sekunden. Sie endet sonst mit der Polonaise.
 * ponytail: feste Obergrenze statt endlosem Nachplanen, nach einer Stunde am Stück bleibt es still,
 * bis die Polonaise neu beginnt.
 */
const CONGA_BED_SECONDS = 3600;

/** Die Abschnitte der Musik zur Polonaise ab ihrem Einsatz, gespielt in `uiBed.ts`. */
export function congaBedSegments(): SoundSegment[] {
  return loopSegments(CONGA_BED, CONGA_BED_SECONDS);
}

/** So lange tanzt die Polonaise der Vorschau (`/#conga`), in Millisekunden. */
export const PREVIEW_CONGA_MS = 40_000;

/** Wann sich in der Vorschau etwas an der Polonaise ändert, in Millisekunden ab ihrem Beginn. */
export const PREVIEW_CONGA_STEPS_MS = [0, 15_000, 28_000] as const;

/**
 * Wer in der Vorschau wem folgt, `now - startedAt` Millisekunden nach dem Beginn: Das eigene Jelly
 * `ownId` und ein zweites stellen sich zu Mo, nach 15 Sekunden kommt ein viertes hinter das eigene
 * und geht nach 28 wieder. Nach {@link PREVIEW_CONGA_MS} läuft alles ab, ohne dass jemand es
 * meldet: So zeigt die Vorschau auch das Ende über die Uhr.
 */
export function previewCongaPlayers(ownId: number, startedAt: number, now: number): CongaPlayer[] {
  const [, joins, leaves] = PREVIEW_CONGA_STEPS_MS;
  const ends_at = startedAt + PREVIEW_CONGA_MS;
  const late = now >= startedAt + joins && now < startedAt + leaves;
  return [
    { id: 7, follow: null },
    { id: ownId, follow: { player_id: 7, ends_at } },
    { id: 8, follow: { player_id: 7, ends_at } },
    { id: 9, follow: late ? { player_id: ownId, ends_at: startedAt + leaves } : null },
  ];
}
