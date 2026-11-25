/**
 * When the parts of the Jelly-News come and go. Every time is read from the report on air or the
 * breaking news and the server time, never from a clock of this screen, so all screens show the
 * same picture, also one that loads late. Durations are shares of the report with a cap, so a short
 * show still has room to read. Without a canvas, so it can be tested by itself.
 *
 * @module
 */

import type { NewsMoment } from "./news.ts";

/** A duration as a share of its report, at most `most` milliseconds. */
interface Span {
  share: number;
  most: number;
}

/**
 * The opening title, at the start of every opening. It lasts long enough for the 3D title of
 * `newsTitle.ts` to land and leave, and leaves the rest of the opening to the greeting.
 */
const BUMPER: Span = { share: 0.4, most: 3200 };
/**
 * Its bands sweep in, follow each other and sweep out this fast, at most these shares of the
 * opening title: a long title holds longer, its wipes stay as quick.
 */
const SWEEPS = {
  in: { share: 0.26, most: 420 },
  delay: { share: 0.06, most: 90 },
  out: { share: 0.22, most: 520 },
} satisfies Record<string, Span>;
/** The bands build up after the opening title and after a breaking news. */
const BUILD: Span = { share: 0.16, most: 650 };
const TEXT_IN: Span = { share: 0.1, most: 450 };
const TEXT_OUT: Span = { share: 0.05, most: 240 };
const CARD_IN: Span = { share: 0.1, most: 500 };
const CARD_OUT: Span = { share: 0.05, most: 260 };
/** The closing fades the whole look before the show ends or starts over. */
const FINALE: Span = { share: 0.22, most: 1000 };
/** Texts come once the bands are this far built. */
const TEXT_AFTER_BUILD = 0.5;
/**
 * The bands start to build this far into the opening title, while its bands sweep off to the right,
 * so the picture never stands empty between the two.
 */
const BUILD_UNDER_BUMPER = 0.8;
/** The card follows the texts this much later, as a share of their way in. */
const CARD_AFTER_TEXT = 0.4;
/** A breaking news: how long its bands build, how long it fades and how long the show under it takes to go. */
const FLASH = { build: 600, fadeOut: 500, cover: 400 };
/** The ticker runs this many milliseconds per character, the same on every screen. */
const TICKER_MS_PER_CHARACTER = 130;
/** Without motion the ticker shows one report at a time, this long each. */
const TICKER_HOLD_MS = 6000;

/** How far each part of a show is in at one frame, each from 0 to 1. */
export interface ShowPhase {
  /** Progress through the opening title, null outside it. */
  bumper: number | null;
  /** How far the bands are built. */
  build: number;
  /** How far the texts of the report are in: rising at its start, falling at its end. */
  texts: number;
  /** How far the card over the shoulder is in. */
  card: number;
  /** Opacity of the whole look. */
  alpha: number;
}

/** How far a breaking news is in at one frame, each from 0 to 1. */
export interface FlashPhase {
  build: number;
  texts: number;
  alpha: number;
  /** How far the show under it has gone. */
  cover: number;
}

/**
 * How the three bands of the opening title sweep, as shares of it. Band `i` sweeps in from
 * `i * delay`, the band of the logo comes last. It is the first to leave, at `leave`, the others
 * follow `delay` apart, and the last one is out when the opening title ends.
 */
export interface TitleSweeps {
  in: number;
  delay: number;
  out: number;
  leave: number;
}

/** A breaking news as the timing sees it: server times it is on air from and until. */
export interface FlashTimes {
  startedAt: number;
  endsAt: number;
}

/** Keeps a share between 0 and 1. */
function clampShare(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Returns how long a span lasts in a report of `length` milliseconds. */
function measureSpan(span: Span, length: number): number {
  return Math.min(span.most, span.share * length);
}

/** Returns how far something that starts at `from` and takes `duration` has come. */
function rise(serverTime: number, from: number, duration: number): number {
  return duration > 0 ? clampShare((serverTime - from) / duration) : 1;
}

/** Returns how long the opening title of a report lasts, 0 for all but the opening. */
export function measureBumper(moment: NewsMoment): number {
  if (moment.beat.kind !== "intro") return 0;
  return measureSpan(BUMPER, moment.endsAt - moment.startedAt);
}

/** Returns how the bands of an opening title `length` milliseconds long sweep. */
export function measureSweeps(length: number): TitleSweeps {
  const share = (span: Span) => (length > 0 ? Math.min(span.share, span.most / length) : 0);
  const sweeps = { in: share(SWEEPS.in), delay: share(SWEEPS.delay), out: share(SWEEPS.out) };
  return { ...sweeps, leave: 1 - sweeps.out - 2 * sweeps.delay };
}

/**
 * Returns the server time the bands start to build: as the opening title leaves, or when a breaking
 * news has given the picture back. All other reports find them built.
 */
function findBuildStart(moment: NewsMoment, returnAt: number | null): number {
  const bumper = measureBumper(moment);
  const afterBumper = bumper > 0 ? moment.startedAt + bumper * BUILD_UNDER_BUMPER : -Infinity;
  return Math.max(afterBumper, returnAt ?? -Infinity);
}

/**
 * Returns how far each part of a show is in. `returnAt` is the server time a breaking news ended
 * during this report, null without one.
 */
export function findShowPhase(
  moment: NewsMoment,
  serverTime: number,
  returnAt: number | null,
): ShowPhase {
  const length = moment.endsAt - moment.startedAt;
  const left = moment.endsAt - serverTime;
  const bumper = measureBumper(moment);
  const elapsed = serverTime - moment.startedAt;
  const buildAt = findBuildStart(moment, returnAt);
  const buildMs = measureSpan(BUILD, length);
  const textAt = Math.max(moment.startedAt, buildAt + buildMs * TEXT_AFTER_BUILD);
  const textInMs = measureSpan(TEXT_IN, length);
  const isOutro = moment.beat.kind === "outro";
  // The closing has no way out of its own: the whole look fades instead.
  const textsOut = isOutro ? 1 : rise(left, 0, measureSpan(TEXT_OUT, length));
  const cardAt = textAt + textInMs * CARD_AFTER_TEXT;
  return {
    bumper: elapsed < bumper ? clampShare(elapsed / bumper) : null,
    build: rise(serverTime, buildAt, buildMs),
    texts: Math.min(rise(serverTime, textAt, textInMs), textsOut),
    card: Math.min(
      rise(serverTime, cardAt, measureSpan(CARD_IN, length)),
      rise(left, 0, measureSpan(CARD_OUT, length)),
    ),
    alpha: isOutro ? rise(left, 0, measureSpan(FINALE, length)) : 1,
  };
}

/** Returns how far a breaking news is in, null while it is not on air. */
export function findFlashPhase(flash: FlashTimes, serverTime: number): FlashPhase | null {
  if (serverTime < flash.startedAt || serverTime >= flash.endsAt) return null;
  return {
    build: rise(serverTime, flash.startedAt, FLASH.build),
    texts: rise(serverTime, flash.startedAt + FLASH.build * TEXT_AFTER_BUILD, TEXT_IN.most),
    alpha: rise(flash.endsAt - serverTime, 0, FLASH.fadeOut),
    cover: rise(serverTime, flash.startedAt, FLASH.cover),
  };
}

/**
 * Returns how far the ticker has run through its loop, from 0 to 1. Its speed follows the number of
 * characters, not pixels, so screens with other sizes or fonts show the same words at the same time.
 */
export function findTickerPhase(characters: number, serverTime: number): number {
  const loopMs = Math.max(1, Math.round(characters * TICKER_MS_PER_CHARACTER));
  return (((Math.round(serverTime) % loopMs) + loopMs) % loopMs) / loopMs;
}

/** Returns which of `count` reports a ticker without motion shows, the same on every screen. */
export function findTickerItem(count: number, serverTime: number): number {
  return count > 0 ? Math.floor(serverTime / TICKER_HOLD_MS) % count : 0;
}

/** Returns a slow pulse from 0 to 1 and back, once per `periodMs`, the same on every screen. */
export function pulse(serverTime: number, periodMs: number): number {
  return 0.5 - 0.5 * Math.cos(((serverTime % periodMs) / periodMs) * 2 * Math.PI);
}
