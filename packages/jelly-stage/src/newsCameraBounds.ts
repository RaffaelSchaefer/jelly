/**
 * Where the texts of the jellies may go while the news camera films: inside what the page leaves
 * free, never under the lower third or the card over the shoulder, which the news look paints over
 * them. A name half under the lower third reads worse than none. Without a canvas.
 *
 * @module
 */

import type { StageInsets } from "./insets.ts";
import type { ScreenSize } from "./lens.ts";

import { keepHalf } from "./insets.ts";
import { layoutNewsBar, type Rect } from "./newsBarLayout.ts";

/** Where texts may go. */
export interface TextBounds {
  /** What the page leaves free between its bands. */
  free: Rect;
  /** What the news look covers: the lower third and the card over the shoulder. */
  covered: Rect[];
}

/** Returns where texts may go on a picture of this size, with the news look laid out on it. */
export function findTextBounds(size: ScreenSize, insets: StageInsets): TextBounds {
  const layout = layoutNewsBar(size, insets);
  if (!layout) {
    const { top, bottom } = keepHalf(size, insets);
    const free = { x: 0, y: top, width: size.width, height: size.height - top - bottom };
    return { free, covered: [] };
  }
  const { tags, ticker, card } = layout;
  const third = {
    x: tags.x,
    y: tags.y,
    width: tags.width,
    height: ticker.y + ticker.height - tags.y,
  };
  return { free: layout.free, covered: card ? [third, card] : [third] };
}

/** Reports whether two rectangles overlap. Touching edges do not count. */
function overlaps(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

/** Reports whether a text box lies inside the free part and clear of everything covered. */
export function fitsBounds(box: Rect, bounds: TextBounds | null): boolean {
  if (!bounds) return true;
  const { free } = bounds;
  const isInside =
    box.x >= free.x &&
    box.y >= free.y &&
    box.x + box.width <= free.x + free.width &&
    box.y + box.height <= free.y + free.height;
  return isInside && bounds.covered.every((rect) => !overlaps(box, rect));
}
