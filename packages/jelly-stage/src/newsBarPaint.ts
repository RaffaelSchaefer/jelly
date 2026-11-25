/**
 * What all parts of the Jelly-News look share: the colors of the channel and of an urgent report,
 * the fonts, the easing of every motion and the logo. Painting functions take the canvas as a
 * parameter, so the module can be imported without a page.
 *
 * @module
 */

import type { MeasureText } from "./newsBarFit.ts";
import type { Rect } from "./newsBarLayout.ts";

import { paintLacquer, type TextTone } from "./newsBarTexture.ts";

/** The colors of one look. */
export interface NewsColors {
  /** Dark ground: the line under the headline, the opening title. */
  deep: string;
  /** The color of the channel: tabs and the clock. */
  brand: string;
  /** Bright marks: the second half of the logo, the gaps of the ticker. */
  accent: string;
  /** The headline band, from its top to its bottom. */
  paper: string;
  paperShade: string;
  /** Text on the headline band. */
  ink: string;
  /** The bar at the start of the headline. */
  stripe: string;
  /** The ground of the ticker. */
  strip: string;
}

/** The channel blue. */
export const CHANNEL_COLORS: NewsColors = {
  deep: "#0c2257",
  brand: "#1f5fe0",
  accent: "#3cc8f5",
  paper: "#ffffff",
  paperShade: "#e4ebf7",
  ink: "#0b1838",
  stripe: "#1f5fe0",
  strip: "#07132e",
};

/** Red for urgent reports of the show. */
const URGENT_COLORS: NewsColors = {
  deep: "#5c0b0b",
  brand: "#d7261e",
  accent: "#ffc23d",
  paper: "#ffffff",
  paperShade: "#f7e6e3",
  ink: "#2b0707",
  stripe: "#d7261e",
  strip: "#2e0505",
};

/** A breaking news turns the headline band itself red, so nobody takes it for a usual report. */
export const FLASH_COLORS: NewsColors = {
  ...URGENT_COLORS,
  paper: "#d9271f",
  paperShade: "#ad140e",
  ink: "#ffffff",
  stripe: "#ffc23d",
};

/** White text on colored ground. */
export const ON_COLOR = "#ffffff";
/** The live mark is red on every look. */
export const LIVE_COLOR = "#e5132b";
/** The weights of the look: logo, tabs and clock, headline, the rest. */
export const WEIGHT = { logo: 900, tag: 800, headline: 700, text: 600 };
const FAMILY = "system-ui, sans-serif";
const CHANNEL_WORDS = ["JELLY", "NEWS"];
/** Room around the words of the logo, as a share of its height. */
const LOGO_PADDING = 0.42;
/** Height of the letters of the logo as a share of its height. */
const LOGO_FONT = 0.52;

/** Returns the colors of a report. */
export function pickColors(isUrgent: boolean): NewsColors {
  return isUrgent ? URGENT_COLORS : CHANNEL_COLORS;
}

/** Sets the font of the look. Texts are placed by the middle of their line. */
export function setFont(context: CanvasRenderingContext2D, size: number, weight: number): void {
  context.font = `${weight} ${size}px ${FAMILY}`;
  context.textBaseline = "middle";
  context.textAlign = "left";
}

/** Returns a measure for the fitting functions, in one weight of the look. */
export function measureWith(context: CanvasRenderingContext2D, weight: number): MeasureText {
  return (text, size) => {
    setFont(context, size, weight);
    return context.measureText(text).width;
  };
}

/** Starts fast and settles, like a graphic that lands in its place. */
export function easeOut(share: number): number {
  return 1 - (1 - Math.min(1, Math.max(0, share))) ** 3;
}

/**
 * Returns how far part `index` of `count` is, when all of them follow one progress one after the
 * other with some overlap.
 */
export function stagger(progress: number, index: number, count: number): number {
  const delay = 0.18;
  const start = index * delay;
  const length = 1 - (count - 1) * delay;
  return Math.min(1, Math.max(0, (progress - start) / length));
}

/** Clips everything that follows to a rectangle, until the next restore. */
export function clipTo(context: CanvasRenderingContext2D, rect: Rect): void {
  context.beginPath();
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.clip();
}

/** Returns how wide the logo is at a height. */
export function measureLogo(context: CanvasRenderingContext2D, height: number): number {
  const measure = measureWith(context, WEIGHT.logo);
  const size = height * LOGO_FONT;
  const words = CHANNEL_WORDS.map((word) => measure(word, size));
  return words.reduce((sum, width) => sum + width + 2 * height * LOGO_PADDING, 0);
}

/** The two halves of the logo: navy with light letters, cyan with navy letters. */
const LOGO_HALVES: { ground: string; ink: string; text: TextTone }[] = [
  { ground: CHANNEL_COLORS.deep, ink: ON_COLOR, text: "light" },
  { ground: CHANNEL_COLORS.accent, ink: CHANNEL_COLORS.deep, text: "dark" },
];

/**
 * Paints the logo of the channel at the top left corner of a box `height` high. It keeps the colors
 * of the channel also on an urgent report: the alarm is in the bands, not in the name. Lacquered,
 * its halves catch light like the tabs of the lower third.
 */
export function drawLogo(
  context: CanvasRenderingContext2D,
  corner: { x: number; y: number },
  height: number,
  isLacquered = false,
): void {
  const size = height * LOGO_FONT;
  const padding = height * LOGO_PADDING;
  let x = corner.x;
  for (const [index, word] of CHANNEL_WORDS.entries()) {
    const half = LOGO_HALVES[index] ?? LOGO_HALVES[0];
    if (!half) continue;
    setFont(context, size, WEIGHT.logo);
    const box = { x, y: corner.y, width: context.measureText(word).width + 2 * padding, height };
    if (isLacquered) {
      paintLacquer(context, box, half.ground, half.text);
    } else {
      context.fillStyle = half.ground;
      context.fillRect(box.x, box.y, box.width, box.height);
    }
    context.fillStyle = half.ink;
    context.fillText(word, x + padding, corner.y + height / 2);
    x += box.width;
  }
}
