/**
 * The material of the Jelly-News: what makes the flat colors of the look feel lit, like lacquer or
 * glass, without making them busier. Each color comes in two neighboring tones instead of one, top
 * edges catch a fine highlight, and the secondary bands carry soft slanted `///` stripes that only
 * show on a second look, alternately wide and thin, rising at the same slant as on the desk front.
 *
 * The stripes are painted in a band's own color over its deeper neighbor. So they add no hue, and
 * where the band keeps its own color they vanish: a band whose tone deepens toward one end lets its
 * stripes appear there and dissolve toward the text. Under light letters every tone is the old color
 * or deeper, under dark letters the old color or lighter, so no text loses contrast. Highlights only
 * touch top edges, above the letters. The desk front stays the loudest surface of the studio.
 *
 * The stripes come from a small tile, made at run time once per color and size, never on import.
 * Without a page, as in the tests, no stripes are painted.
 *
 * @module
 */

import type { Rect, StripeGrid } from "./newsBarLayout.ts";

/** A color as red, green and blue from 0 to 255. */
type Channels = [number, number, number];

/** Which letters stand on a surface: lighter or darker than the surface itself. */
export type TextTone = "light" | "dark";

/** How deep the neighboring tone of a surface is, as a share toward black. */
export const NEIGHBOR = {
  /** The sub band toward its end: the stripes show there with a few percent of lightness. */
  band: 0.18,
  /** The ground of the ticker behind the clock: nearly black, so it needs more for the same. */
  strip: 0.45,
  /** Tabs, clock and live mark from their top to their bottom edge. */
  lacquer: 0.12,
  /** Lighter tone at the top of a surface with dark letters, as a share toward white. */
  sheen: 0.16,
};
/** The highlight along a top edge: how bright and how high, as a share of the surface height. */
const HIGHLIGHT = { alpha: 0.2, share: 0.05 };
/** A tile is drawn with at most this many pixels across. Soft stripes scale without loss. */
const LARGEST_TILE = 256;
/** Tiles of different colors and sizes kept at once. A window that keeps resizing starts over. */
const MOST_TILES = 32;
/**
 * The two stripes of a tile, which spans two periods across: a wide and a thin one, each a middle,
 * a half width and the softness of its edges, all as shares of the tile.
 */
const STRIPES = [
  { middle: 0.25, half: 0.15, soft: 0.07 },
  { middle: 0.72, half: 0.04, soft: 0.025 },
];

const tiles = new Map<string, HTMLCanvasElement>();
const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>();

/** Reads a color written as `#rrggbb`. */
function parse(color: string): Channels {
  const value = Number.parseInt(color.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Writes a color as `#rrggbb`, rounding each channel with `round`. */
function format(channels: Channels, round: (value: number) => number): string {
  return `#${channels.map((value) => round(value).toString(16).padStart(2, "0")).join("")}`;
}

/** Mixes two colors the way the canvas does, channel by channel. */
function mix(first: Channels, second: Channels, share: number): Channels {
  return first.map((value, index) => value + ((second[index] ?? 0) - value) * share) as Channels;
}

/** Returns the deeper neighbor of a color, `share` of the way to black, never lighter. */
export function deepen(color: string, share: number): string {
  return format(mix(parse(color), [0, 0, 0], share), Math.floor);
}

/** Returns the lighter neighbor of a color, `share` of the way to white, never darker. */
export function lighten(color: string, share: number): string {
  return format(mix(parse(color), [255, 255, 255], share), Math.ceil);
}

/** Returns the relative luminance of a color, as contrast ratios count it. */
export function measureLuminance(color: string): number {
  const [red, green, blue] = parse(color).map((value) => {
    const share = value / 255;
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
  }) as Channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Returns the contrast ratio of two colors, from 1 to 21. */
export function measureContrast(first: string, second: string): number {
  const [light, dark] = [measureLuminance(first), measureLuminance(second)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/**
 * Returns the two tones of a surface from its top to its bottom: under light letters its color and
 * a deeper one, under dark letters a lighter one and its color.
 */
export function findLacquer(color: string, text: TextTone): [string, string] {
  return text === "light"
    ? [color, deepen(color, NEIGHBOR.lacquer)]
    : [lighten(color, NEIGHBOR.sheen), color];
}

/** Returns how many screen pixels one CSS pixel of the canvas has, 0 where it cannot tell. */
export function readScale(context: CanvasRenderingContext2D): number {
  const matrix = typeof context.getTransform === "function" ? context.getTransform() : null;
  return matrix ? Math.hypot(matrix.a, matrix.b) : 0;
}

/** Returns how much of a stripe covers a point `along` the tile, from 0 to 1, with soft edges. */
export function coverStripes(along: number): number {
  return Math.max(
    ...STRIPES.map(({ middle, half, soft }) => {
      const step = Math.min(1, Math.max(0, (Math.abs(along - middle) - half + soft) / (2 * soft)));
      return 1 - step * step * (3 - 2 * step);
    }),
  );
}

/**
 * Makes a tile `side` pixels square with the two stripes across it, rising to the right. Each pixel
 * is computed, so the soft edges need no smoothing and the tiles join without a seam.
 */
function makeTile(color: string, side: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const tile = document.createElement("canvas");
  tile.width = side;
  tile.height = side;
  const context = tile.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(side, side);
  const [red, green, blue] = parse(color);
  // Lines of equal `x + y` rise to the right, measured at the middle of each pixel. A pixel's cover
  // depends only on its line, so it is computed once per line, not once per pixel.
  const covers = Array.from({ length: side }, (_, line) =>
    Math.round(255 * coverStripes(((line + 1) % side) / side)),
  );
  const { data } = image;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const index = 4 * (y * side + x);
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
      data[index + 3] = covers[(x + y) % side] ?? 0;
    }
  }
  context.putImageData(image, 0, 0);
  return tile;
}

/** Returns the pattern of stripes of one color and tile size for a canvas, made on first use. */
function findPattern(
  context: CanvasRenderingContext2D,
  color: string,
  side: number,
): CanvasPattern | null {
  const key = `${color}@${side}`;
  let known = patterns.get(context);
  const found = known?.get(key);
  if (found) return found;
  if (typeof DOMMatrix !== "function") return null;
  if (tiles.size >= MOST_TILES) tiles.clear();
  const tile = tiles.get(key) ?? makeTile(color, side);
  if (!tile) return null;
  tiles.set(key, tile);
  const pattern = context.createPattern(tile, "repeat");
  if (!pattern) return null;
  if (!known || known.size >= MOST_TILES) {
    known = new Map();
    patterns.set(context, known);
  }
  known.set(key, pattern);
  return pattern;
}

/**
 * Paints soft stripes of one color over a rectangle, on a grid that starts on a whole screen pixel,
 * so they stay sharp and still. Two periods make one tile, at most {@link LARGEST_TILE} pixels.
 */
export function paintStripes(
  context: CanvasRenderingContext2D,
  rect: Rect,
  stripes: { color: string; alpha: number },
  grid: StripeGrid,
): void {
  const scale = readScale(context);
  if (stripes.alpha <= 0 || rect.width <= 0 || rect.height <= 0 || scale <= 0) return;
  const span = 2 * grid.period;
  const side = Math.max(2, Math.min(LARGEST_TILE, Math.round(span * scale)));
  const pattern = findPattern(context, stripes.color, side);
  if (!pattern) return;
  const step = span / side;
  const x = Math.round(grid.x * scale) / scale;
  const y = Math.round(grid.y * scale) / scale;
  pattern.setTransform(new DOMMatrix([step, 0, 0, step, x, y]));
  context.save();
  context.globalAlpha *= stripes.alpha;
  context.fillStyle = pattern;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

/** Paints the highlight along the top edge of a surface, above any letters on it. */
export function paintHighlight(context: CanvasRenderingContext2D, rect: Rect): void {
  const scale = readScale(context) || 1;
  const height = Math.max(1 / scale, rect.height * HIGHLIGHT.share);
  context.save();
  context.globalAlpha *= HIGHLIGHT.alpha;
  context.fillStyle = "#ffffff";
  context.fillRect(rect.x, rect.y, rect.width, height);
  context.restore();
}

/** Paints a lacquered surface: two neighboring tones from top to bottom and a highlight on top. */
export function paintLacquer(
  context: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  text: TextTone,
): void {
  const [top, bottom] = findLacquer(color, text);
  const ground = context.createLinearGradient(0, rect.y, 0, rect.y + rect.height);
  ground.addColorStop(0, top);
  ground.addColorStop(1, bottom);
  context.fillStyle = ground;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  paintHighlight(context, rect);
}

/**
 * Paints a band whose tone deepens between two points along it, given as shares of its width, with
 * stripes in its own color: they vanish where it keeps its color and show where it is deeper.
 */
export function paintStripedBand(
  context: CanvasRenderingContext2D,
  rect: Rect,
  band: { color: string; depth: number; from: number; to: number },
  grid: StripeGrid,
): void {
  const start = rect.x + rect.width * band.from;
  const ground = context.createLinearGradient(start, 0, rect.x + rect.width * band.to, 0);
  ground.addColorStop(0, band.color);
  ground.addColorStop(1, deepen(band.color, band.depth));
  context.fillStyle = ground;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  paintStripes(context, rect, { color: band.color, alpha: 1 }, grid);
}
