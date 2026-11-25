/**
 * The pictures of the Jelly-News at run time: the signs of the reports, drawn as our own emojis so
 * they look the same on every machine. Decodes a picture when a report first asks for it. Until it
 * is there, and for one that has no file, the report shows the emoji of the system.
 *
 * @module
 */

import type { NewsPicture } from "./newsLines.ts";

import { NEWS_PICTURE_DATA } from "./newsPictureData.ts";

/** The pictures asked for so far. They decode in the background. */
const PICTURES = new Map<NewsPicture, HTMLImageElement>();

/** Returns the picture of a key once the browser has decoded it, null before that or without one. */
export function findNewsPicture(key: NewsPicture | null): HTMLImageElement | null {
  const data = key ? NEWS_PICTURE_DATA[key] : undefined;
  // Outside a browser, as in the tests, there is nothing to decode a picture.
  if (!key || !data || typeof Image === "undefined") return null;
  let picture = PICTURES.get(key);
  if (!picture) {
    picture = new Image();
    picture.src = data;
    PICTURES.set(key, picture);
  }
  return picture.complete && picture.naturalWidth > 0 ? picture : null;
}

/**
 * Returns the box a picture takes when it is fitted whole into a square of `size` around a middle,
 * keeping its shape.
 */
export function fitInside(
  picture: { width: number; height: number },
  center: { x: number; y: number },
  size: number,
): { x: number; y: number; width: number; height: number } {
  const scale = size / Math.max(picture.width, picture.height);
  const width = picture.width * scale;
  const height = picture.height * scale;
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

/** Draws a picture whole into a square of `size` around a middle, as a sign on a card. */
export function drawNewsPicture(
  context: CanvasRenderingContext2D,
  picture: HTMLImageElement,
  center: { x: number; y: number },
  size: number,
): void {
  const natural = { width: picture.naturalWidth, height: picture.naturalHeight };
  const box = fitInside(natural, center, size);
  context.drawImage(picture, box.x, box.y, box.width, box.height);
}
