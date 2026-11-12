/**
 * The colors of a jelly by the color key of the server, without the rest of the jelly. So texts and
 * hints can be painted, and tested, without loading its models.
 *
 * @module
 */

import { JELLY_COLORS, type JellyPalette } from "@jelly/scene/colors";

/** Returns the colors of a jelly. Unknown colors look like mint. */
export function findPalette(color: string): JellyPalette {
  return Object.entries(JELLY_COLORS).find(([key]) => key === color)?.[1] ?? JELLY_COLORS.mint;
}
