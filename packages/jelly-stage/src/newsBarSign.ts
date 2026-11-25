/**
 * The signs of the Jelly-News drawn small and sharp: the pictures are 384 pixels square, a tab
 * shows them at 14 to 30. Scaled down in one step they would turn grainy, so each picture is shrunk
 * in halves once per size on screen and then drawn pixel for pixel. Until a picture is there, the
 * emoji of the system stands in the same square, so nothing around it moves when the picture comes.
 *
 * @module
 */

import type { NewsPicture } from "./newsLines.ts";

import { setFont, WEIGHT } from "./newsBarPaint.ts";
import { readScale } from "./newsBarTexture.ts";
import { fitInside, findNewsPicture } from "./newsPictures.ts";

/** Where a sign goes: the middle of its square and its side, in CSS pixels. */
export interface SignSpot {
  x: number;
  y: number;
  size: number;
}

/** A width and a height in screen pixels. */
interface Pixels {
  width: number;
  height: number;
}

/** Sizes kept per picture. A window that keeps resizing starts over. */
const MOST_SIZES = 8;
/** An emoji of the system may be this much wider than the square: some systems draw them wide. */
const EMOJI_ROOM = 1.25;
const shrunk = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

/** Draws a picture into a new canvas of another size, smoothed as well as the browser can. */
function redraw(source: CanvasImageSource, to: Pixels): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = to.width;
  canvas.height = to.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, to.width, to.height);
  return canvas;
}

/** Returns a picture shrunk to a size in screen pixels, made in halves on first use and kept. */
function shrinkPicture(picture: HTMLImageElement, to: Pixels): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${to.width}x${to.height}`;
  let sizes = shrunk.get(picture);
  const known = sizes?.get(key);
  if (known) return known;
  let source: CanvasImageSource = picture;
  let from: Pixels = { width: picture.naturalWidth, height: picture.naturalHeight };
  // Each halving averages four pixels into one, so no detail falls between the samples.
  while (from.width / 2 >= to.width && from.height / 2 >= to.height) {
    const half = { width: Math.round(from.width / 2), height: Math.round(from.height / 2) };
    const step = redraw(source, half);
    if (!step) return null;
    source = step;
    from = half;
  }
  const result = redraw(source, to);
  if (!result) return null;
  if (!sizes || sizes.size >= MOST_SIZES) {
    sizes = new Map();
    shrunk.set(picture, sizes);
  }
  sizes.set(key, result);
  return result;
}

/**
 * Draws a picture whole into a square, sharp also when small: shrunk to its size on screen and
 * placed on whole screen pixels. Draws it directly where the canvas cannot tell its scale.
 */
export function drawSharpPicture(
  context: CanvasRenderingContext2D,
  picture: HTMLImageElement,
  spot: SignSpot,
): void {
  const scale = readScale(context);
  const natural = { width: picture.naturalWidth, height: picture.naturalHeight };
  const box = fitInside(natural, spot, spot.size);
  const to = { width: Math.round(box.width * scale), height: Math.round(box.height * scale) };
  const small = to.width > 0 && to.height > 0 ? shrinkPicture(picture, to) : null;
  if (!small) {
    context.drawImage(picture, box.x, box.y, box.width, box.height);
    return;
  }
  const x = Math.round(box.x * scale) / scale;
  const y = Math.round(box.y * scale) / scale;
  context.drawImage(small, x, y, to.width / scale, to.height / scale);
}

/**
 * Draws the sign of a report into its square: its own picture, or until that is there the emoji of
 * the system at `fontSize`, centered on the same middle.
 */
export function drawNewsSign(
  context: CanvasRenderingContext2D,
  sign: { picture: NewsPicture | null; glyph: string },
  spot: SignSpot,
  fontSize: number,
): void {
  const picture = findNewsPicture(sign.picture);
  if (picture) {
    drawSharpPicture(context, picture, spot);
    return;
  }
  context.save();
  setFont(context, fontSize, WEIGHT.text);
  context.textAlign = "center";
  context.fillText(sign.glyph, spot.x, spot.y, spot.size * EMOJI_ROOM);
  context.restore();
}
