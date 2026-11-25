/**
 * The texts over the jellies while the news camera films. A jelly outside the picture has none, a
 * jelly right in front of the lens does not get a name the size of a headline, and a jelly behind
 * another one does not write its name onto the body in front. The fitted camera keeps every jelly as
 * it is: its edge hints need those outside the picture.
 *
 * @module
 */

import type { LabelAnchor } from "./labels.ts";
import type { ScreenSize } from "./lens.ts";

import { pickJelly } from "./picking.ts";

/** Texts are sized as if no jelly stood taller on screen than this share of the picture. */
const TALLEST_TEXT_SHARE = 0.15;
/** The name of a jelly goes this share of its height below its feet. */
const NAME_SPOT_SHARE = 0.12;

/** Reports whether the middle of a jelly's body lies in the picture. */
function isInPicture(anchor: LabelAnchor, size: ScreenSize): boolean {
  const x = (anchor.x + anchor.headX) / 2;
  const y = anchor.y - anchor.height / 2;
  return x >= 0 && x <= size.width && y >= 0 && y <= size.height;
}

/** Reports whether a nearer jelly covers the place where the name of a jelly would go. */
function isCovered(anchor: LabelAnchor, nearer: LabelAnchor[]): boolean {
  const spot = { x: anchor.x, y: anchor.y + anchor.height * NAME_SPOT_SHARE };
  return pickJelly(nearer, spot, null) !== null;
}

/**
 * Keeps the jellies in the picture of the news camera, from back to front as they come. Their texts
 * are no larger than a cap, and those a nearer jelly covers are muted.
 */
export function frameAnchors(anchors: LabelAnchor[], size: ScreenSize): LabelAnchor[] {
  const tallest = size.height * TALLEST_TEXT_SHARE;
  const shown = anchors.filter((anchor) => isInPicture(anchor, size));
  return shown.map((anchor, index) => ({
    ...anchor,
    textHeight: Math.min(anchor.height, tallest),
    muted: isCovered(anchor, shown.slice(index + 1)),
  }));
}
