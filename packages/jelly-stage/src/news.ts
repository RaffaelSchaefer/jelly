/**
 * The Jelly-News as a show: which reports it has, how long each runs and which one is on at a
 * server time. All of it follows from the gathering alone, so every screen shows the same report,
 * also one that loads in the middle of the show. Without three, so it can be tested by itself.
 *
 * @module
 */

import type { StageGathering, StageNews, StageScheduleItem } from "./types.ts";

const NEWS = "news";
/** Until the server tells when a gathering began, the show counts as this long (`news_seconds`). */
const USUAL_WINDOW_MS = 90_000;
/**
 * A show repeats only while every report still gets `usual` milliseconds, so a report lasts from
 * `usual` up to twice that, 5.4 to 10.8 seconds, and opening and closing `SHORT_WEIGHT` of it.
 * Below `shortest` the show drops reports instead.
 */
const UNIT_MS = { shortest: 4000, usual: 5400 };
/** Opening and closing are this much shorter than a report. */
const SHORT_WEIGHT = 0.6;
/** A show that is too long drops achievements down to this many, the oldest first. */
const FEWEST_ACHIEVEMENTS = 1;
const SECOND_MS = 1000;

/** One part of the show. */
export type NewsBeat =
  | { kind: "intro" }
  | { kind: "top_xp"; playerId: number; xp: number }
  | { kind: "achievement"; playerId: number; key: string }
  | { kind: "stack"; memberIds: number[] }
  /** The one slot for color: weather, a short report or a voice from the hall. */
  | { kind: "extra" }
  | { kind: "next"; item: StageScheduleItem }
  | { kind: "outro" };

/** The show of one gathering. */
export interface NewsShow {
  /** Tells shows apart, so the effects of a report start once. */
  key: string;
  beats: NewsBeat[];
  /** When each beat starts within one run, and last when the run ends, in milliseconds. */
  marks: number[];
  /** Server time the last run ends at. Runs repeat before it for as long as the gathering lasts. */
  endsAt: number;
  /** The same number on every screen, for all choices that look random. */
  seed: number;
  presenterId: number | null;
}

/** Where a show is at one server time. */
export interface NewsMoment {
  beat: NewsBeat;
  index: number;
  /** How many runs are left, 1 for the last one. */
  run: number;
  /** From 0 to 1 through the beat. */
  progress: number;
  /** Server times the beat starts and ends at. */
  startedAt: number;
  endsAt: number;
}

/** Scrambles a whole number into another one between 0 and 2^32, the same on every screen. */
export function scramble(value: number): number {
  let mixed = value | 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x45d9f3b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

/** Returns the reports of the news in their order, with `kept` achievements. */
function listBeats(news: StageNews, kept: number, hasExtra: boolean): NewsBeat[] {
  const beats: NewsBeat[] = [{ kind: "intro" }];
  if (news.top_xp) {
    beats.push({ kind: "top_xp", playerId: news.top_xp.player_id, xp: news.top_xp.xp });
  }
  for (const { player_id: playerId, key } of news.achievements.slice(0, kept)) {
    beats.push({ kind: "achievement", playerId, key });
  }
  if (news.tallest_stack.length > 0) beats.push({ kind: "stack", memberIds: news.tallest_stack });
  if (hasExtra) beats.push({ kind: "extra" });
  if (news.next_item) beats.push({ kind: "next", item: news.next_item });
  beats.push({ kind: "outro" });
  return beats;
}

/** Returns how long a beat lasts, in reports. */
function weigh(beat: NewsBeat): number {
  return beat.kind === "intro" || beat.kind === "outro" ? SHORT_WEIGHT : 1;
}

/** Returns the length of all beats together, in reports. */
function weighAll(beats: NewsBeat[]): number {
  return beats.reduce((sum, beat) => sum + weigh(beat), 0);
}

/**
 * Returns the beats that fit the time: a show that would rush leaves out the color first, then the
 * oldest achievements.
 */
function fitBeats(news: StageNews, windowMs: number): NewsBeat[] {
  let kept = news.achievements.length;
  let hasExtra = true;
  let beats = listBeats(news, kept, hasExtra);
  while (windowMs / weighAll(beats) < UNIT_MS.shortest) {
    if (hasExtra) hasExtra = false;
    else if (kept > FEWEST_ACHIEVEMENTS) kept -= 1;
    else break;
    beats = listBeats(news, kept, hasExtra);
  }
  return beats;
}

/** Returns how long a gathering lasts. Without a start it counts as the usual length. */
function measureWindow(gathering: StageGathering): number {
  const window = gathering.starts_at === undefined ? 0 : gathering.ends_at - gathering.starts_at;
  return window > 0 ? window : USUAL_WINDOW_MS;
}

/**
 * Plans the show of a gathering, null for anything but news. A long gathering repeats the show, and
 * the length of a report is chosen so the last run ends with the gathering.
 */
export function planShow(gathering: StageGathering | null): NewsShow | null {
  const news = gathering?.kind === NEWS ? gathering.news : null;
  if (!gathering || !news) return null;
  const windowMs = measureWindow(gathering);
  const beats = fitBeats(news, windowMs);
  const weight = weighAll(beats);
  const runs = Math.max(1, Math.floor(windowMs / (weight * UNIT_MS.usual)));
  const unit = windowMs / (runs * weight);
  const marks = [0];
  for (const beat of beats) marks.push((marks.at(-1) ?? 0) + weigh(beat) * unit);
  const presenterId = gathering.presenter_id ?? null;
  return {
    key: `${gathering.ends_at}:${presenterId}`,
    beats,
    marks,
    endsAt: gathering.ends_at,
    seed: scramble(Math.floor(gathering.ends_at / SECOND_MS) ^ scramble(presenterId ?? 0)),
    presenterId,
  };
}

/** Returns what is on at a server time, null once the show is over. */
export function findMoment(show: NewsShow, serverTime: number): NewsMoment | null {
  const left = show.endsAt - serverTime;
  const length = show.marks.at(-1) ?? 0;
  if (left <= 0 || length <= 0) return null;
  // Runs are counted from the end, so the last one always ends with the gathering.
  const into = (length - (left % length)) % length;
  let index = 0;
  while (index < show.beats.length - 1 && (show.marks[index + 1] ?? length) <= into) index += 1;
  const beat = show.beats[index];
  if (!beat) return null;
  const start = show.marks[index] ?? 0;
  const end = show.marks[index + 1] ?? length;
  const startedAt = serverTime - (into - start);
  return {
    beat,
    index,
    run: Math.ceil(left / length),
    progress: (into - start) / (end - start),
    startedAt,
    endsAt: startedAt + (end - start),
  };
}

/** Returns every jelly the show names, so color and interview pick somebody else. */
export function listNamed(show: NewsShow): Set<number> {
  const named = new Set<number>(show.presenterId === null ? [] : [show.presenterId]);
  for (const beat of show.beats) {
    if (beat.kind === "top_xp" || beat.kind === "achievement") named.add(beat.playerId);
    if (beat.kind === "stack") beat.memberIds.forEach((id) => named.add(id));
  }
  return named;
}
