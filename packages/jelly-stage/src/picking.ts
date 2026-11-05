/**
 * Which jelly is under a point on the screen, for hovering and clicking.
 *
 * @module
 */

import type { LabelAnchor } from "./labels.ts";
import type { ScreenPoint } from "./lens.ts";

/** How far a jelly reaches sideways, as a share of its height on screen. */
const BODY_RADIUS_SHARE = 0.5;
/** The round top of the shape ends at the head, so its axis stops this share of the way up. */
const AXIS_SHARE = 0.5;
/** Jellies at the back of a small window stay hittable. */
const MIN_RADIUS_PIXELS = 8;

/** Returns how far a point is from the line between two others. */
function measureToSegment(point: ScreenPoint, start: ScreenPoint, end: ScreenPoint): number {
  const alongX = end.x - start.x;
  const alongY = end.y - start.y;
  const lengthSquared = alongX * alongX + alongY * alongY;
  const raw =
    lengthSquared === 0
      ? 0
      : ((point.x - start.x) * alongX + (point.y - start.y) * alongY) / lengthSquared;
  const share = Math.min(1, Math.max(0, raw));
  return Math.hypot(point.x - (start.x + share * alongX), point.y - (start.y + share * alongY));
}

/** Reports whether a point lies on a jelly. Perspective and lens tilt it, so its axis can lean. */
function isOnJelly(anchor: LabelAnchor, point: ScreenPoint): boolean {
  const feet = { x: anchor.x, y: anchor.y };
  const top = {
    x: anchor.x + (anchor.headX - anchor.x) * AXIS_SHARE,
    y: anchor.y - anchor.height * AXIS_SHARE,
  };
  const radius = Math.max(MIN_RADIUS_PIXELS, anchor.height * BODY_RADIUS_SHARE);
  return measureToSegment(point, feet, top) <= radius;
}

/**
 * Returns the player of the nearest jelly at a point, or `null`. `anchors` are sorted from back to
 * front. The own jelly never counts, because nobody can stand next to themselves.
 */
export function pickJelly(
  anchors: LabelAnchor[],
  point: ScreenPoint,
  ownId: number | null,
): number | null {
  for (let index = anchors.length - 1; index >= 0; index--) {
    const anchor = anchors[index];
    if (anchor && anchor.player.id !== ownId && isOnJelly(anchor, point)) {
      return anchor.player.id;
    }
  }
  return null;
}
