/**
 * The bands at the top and the bottom of a personal screen that the page covers with its own
 * buttons. The room fits between them, and the middle of the view is the middle of what is left.
 *
 * @module
 */

import type { ScreenPoint, ScreenSize } from "./lens.ts";

/** Bands at the top and the bottom of the screen that the page covers, in CSS pixels. */
export interface StageInsets {
  top: number;
  bottom: number;
}

/** No band covered, as on the big stage. */
export const NO_INSETS: StageInsets = { top: 0, bottom: 0 };

/** Shrinks bands that would cover more than half of the screen. */
export function keepHalf(size: ScreenSize, insets: StageInsets): StageInsets {
  const covered = insets.top + insets.bottom;
  const scale = covered > size.height / 2 ? size.height / 2 / covered : 1;
  return { top: insets.top * scale, bottom: insets.bottom * scale };
}

/** Returns the middle of what the page leaves free. A small window keeps at least half its height. */
export function findViewCenter(size: ScreenSize, insets: StageInsets): ScreenPoint {
  const { top, bottom } = keepHalf(size, insets);
  return { x: size.width / 2, y: (top + size.height - bottom) / 2 };
}
