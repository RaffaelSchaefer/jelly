/**
 * Where the television look of the Jelly-News sits on the picture: the lower third with its tabs,
 * the ticker with the clock and the card over the shoulder. All of it stays between the bands the
 * page covers. Sizes are shares of the free height with a smallest size in pixels, so the back of a
 * hall can read the beamer and a small map window stays legible. Without a canvas, so it can be
 * tested by itself.
 *
 * @module
 */

import type { StageInsets } from "./insets.ts";
import type { ScreenSize } from "./lens.ts";
import type { FontRange } from "./newsBarFit.ts";

import { keepHalf } from "./insets.ts";

/** A rectangle on the screen, in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the slanted stripes of a surface lie: the distance from one stripe to the next across, in
 * CSS pixels, and the point they start from. Stripes alternate wide and thin, so their pattern
 * repeats every two periods. Surfaces that share a grid share their stripes, as if cut from one sheet.
 */
export interface StripeGrid {
  period: number;
  x: number;
  y: number;
}

/** The place of the card over the shoulder, with the rhythm of the stripes it shares with the bands. */
export interface CardRect extends Rect {
  period: number;
}

/** How large the texts of the lower third are written, in pixels. */
export interface NewsBarFonts {
  /** Channel, rubric and live mark. */
  tag: number;
  headline: { single: FontRange; double: FontRange };
  sub: FontRange;
  ticker: number;
}

/** Where every part of the look goes. */
export interface NewsBarLayout {
  /** What the page leaves free. The opening title covers it. */
  free: Rect;
  /** Channel, rubric and live mark, as tabs on top of the headline. They have no band of their own. */
  tags: Rect;
  headline: Rect;
  sub: Rect;
  /** The strip of the ticker, with the clock at its left end. */
  ticker: Rect;
  clock: Rect;
  /** The card over the shoulder in the upper right corner, null where it does not fit. */
  card: CardRect | null;
  /** Room at the start of a band, before its text. */
  padding: number;
  fonts: NewsBarFonts;
  /** The stripes all parts of the lower third share, starting at the corner of the tabs. */
  stripes: StripeGrid;
}

/** Heights as shares of the basis, see {@link layoutNewsBar}. */
const SHARE = {
  tags: 0.042,
  headline: 0.088,
  sub: 0.044,
  ticker: 0.04,
  gap: 0.014,
  margin: 0.03,
  cardTop: 0.035,
};
/** The smallest heights in pixels. Below them a text would be smaller than a name on the map. */
const LEAST = {
  tags: 22,
  headline: 42,
  sub: 22,
  ticker: 22,
  gap: 5,
  margin: 8,
  cardTop: 8,
};
/**
 * Bands keep this share of the width free at both sides. More than a television would need: the map
 * lets its corners fade into the window, and a beamer may cut its edges.
 */
const SIDE_SHARE = 0.06;
const LEAST_SIDE = 14;
/** A narrow window writes smaller: the basis is at most this share of the width. */
const WIDTH_BASIS = 0.75;
/**
 * The card is this share of the width wide, at least `least` pixels and at most `basis` of the basis,
 * so it grows with the bands also on a wide screen. Its height is `aspect` of its width.
 */
const CARD = { share: 0.16, least: 100, basis: 0.3, aspect: 0.78, leastHeight: 60 };
/** Texts of the bands as shares of their height. */
const FONT_SHARE = { tag: 0.5, sub: 0.5, subSmallest: 0.4, ticker: 0.5 };
/** One line of a headline, from largest to smallest, then two lines, as shares of its band. */
const HEADLINE_SHARE = { single: 0.5, singleSmallest: 0.38, double: 0.36, doubleSmallest: 0.28 };
/** No text is smaller than the names on the map. */
const SMALLEST_TEXT = 11;
const PADDING_SHARE = 0.4;
/** The clock is this many times as wide as the ticker is high: room for `00:00` and padding. */
const CLOCK_SHARE = 2.5;
/**
 * The period of the stripes as a share of the tab height: calmer than on the desk front, which
 * stays the loudest surface. A small window gets a finer rhythm, a beamer a broader one.
 */
const STRIPE_SHARE = 1.3;
/** Below this the look leaves the picture alone. */
const LEAST_SCREEN = { width: 200, height: 160 };

/** Returns a range from a share of a height down to a smaller one, never below the smallest text. */
function rangeOf(height: number, largest: number, smallest: number): FontRange {
  const top = Math.max(SMALLEST_TEXT, height * largest);
  return { largest: top, smallest: Math.min(top, Math.max(SMALLEST_TEXT, height * smallest)) };
}

/** Returns how large the texts of the bands are. */
function measureFonts(headline: number, sub: number, tags: number, ticker: number): NewsBarFonts {
  const { single, singleSmallest, double, doubleSmallest } = HEADLINE_SHARE;
  return {
    tag: Math.max(SMALLEST_TEXT, tags * FONT_SHARE.tag),
    headline: {
      single: rangeOf(headline, single, singleSmallest),
      double: rangeOf(headline, double, doubleSmallest),
    },
    sub: rangeOf(sub, FONT_SHARE.sub, FONT_SHARE.subSmallest),
    ticker: Math.max(SMALLEST_TEXT, ticker * FONT_SHARE.ticker),
  };
}

/**
 * Places the card in the upper right corner, between `room.top` and the tabs at `room.bottom`, smaller
 * where room is short.
 */
function placeCard(
  size: ScreenSize,
  room: { top: number; bottom: number },
  side: number,
  basis: number,
): Rect | null {
  const { top, bottom } = room;
  const width = Math.max(CARD.least, Math.min(size.width * CARD.share, basis * CARD.basis));
  const height = Math.floor(Math.min(width * CARD.aspect, bottom - top));
  if (height < CARD.leastHeight) return null;
  const fitted = Math.round(height / CARD.aspect);
  return { x: Math.round(size.width - side - fitted), y: top, width: fitted, height };
}

/**
 * Lays the look out on a screen. Heights grow with the free height, but never past three quarters
 * of the width, so a narrow window does not get letters its width cannot hold. Null for a picture
 * too small to show any of it.
 */
export function layoutNewsBar(size: ScreenSize, insets: StageInsets): NewsBarLayout | null {
  const { top, bottom } = keepHalf(size, insets);
  const free = { x: 0, y: top, width: size.width, height: size.height - top - bottom };
  if (size.width < LEAST_SCREEN.width || free.height < LEAST_SCREEN.height) return null;
  const basis = Math.min(free.height, size.width * WIDTH_BASIS);
  const share = (part: keyof typeof SHARE) =>
    Math.round(Math.max(LEAST[part], basis * SHARE[part]));
  const side = Math.round(Math.max(LEAST_SIDE, size.width * SIDE_SHARE));
  const width = size.width - 2 * side;
  const band = (y: number, height: number): Rect => ({ x: side, y, width, height });
  const ticker = band(free.y + free.height - share("margin") - share("ticker"), share("ticker"));
  const sub = band(ticker.y - share("gap") - share("sub"), share("sub"));
  const headline = band(sub.y - share("headline"), share("headline"));
  const tags = band(headline.y - share("tags"), share("tags"));
  const clockWidth = Math.round(ticker.height * CLOCK_SHARE);
  const period = tags.height * STRIPE_SHARE;
  const room = { top: free.y + share("cardTop"), bottom: tags.y - share("gap") };
  const card = placeCard(size, room, side, basis);
  return {
    free,
    tags,
    headline,
    sub,
    ticker,
    clock: { ...ticker, width: clockWidth },
    card: card && { ...card, period },
    padding: Math.round(sub.height * PADDING_SHARE),
    fonts: measureFonts(headline.height, sub.height, tags.height, ticker.height),
    stripes: { period, x: tags.x, y: tags.y },
  };
}
