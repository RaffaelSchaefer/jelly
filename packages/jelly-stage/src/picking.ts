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
/**
 * A jelly up in a tower sits on the head of the one below. Its round lower end would reach over the
 * face of that one, so it ends where its belly ends on screen, this share of its height below its
 * feet, seen from the camera of the stage. Below that the visible jelly is the one below.
 */
const PERCHED_BOTTOM_SHARE = 0.28;

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

/**
 * Returns how far a point lies outside a jelly in pixels, 0 or less on it. Perspective and lens
 * tilt it, so its axis can lean. Below a perched jelly the one below is in front, so there it is
 * never near.
 */
function measureGap(anchor: LabelAnchor, point: ScreenPoint): number {
  const feet = { x: anchor.x, y: anchor.y };
  const top = {
    x: anchor.x + (anchor.headX - anchor.x) * AXIS_SHARE,
    y: anchor.y - anchor.height * AXIS_SHARE,
  };
  const radius = Math.max(MIN_RADIUS_PIXELS, anchor.height * BODY_RADIUS_SHARE);
  const isPerched = (anchor.tier ?? 0) > 0;
  if (isPerched && point.y > anchor.y + anchor.height * PERCHED_BOTTOM_SHARE) return Infinity;
  return measureToSegment(point, feet, top) - radius;
}

/**
 * Returns the player of the nearest jelly at a point, or `null`. `anchors` are sorted from back to
 * front. The own jelly never counts, because nobody can stand next to themselves. With `reach`, as
 * for a finger, a point up to that many pixels beside a jelly still hits the closest one, but only
 * when no jelly lies right under it, the own one included.
 */
export function pickJelly(
  anchors: LabelAnchor[],
  point: ScreenPoint,
  ownId: number | null,
  reach = 0,
): number | null {
  let nearest: number | null = null;
  let nearestGap = reach;
  let isOnOwn = false;
  for (let index = anchors.length - 1; index >= 0; index--) {
    const anchor = anchors[index];
    if (!anchor) continue;
    const gap = measureGap(anchor, point);
    const isOwn = anchor.player.id === ownId;
    if (gap <= 0 && !isOwn) return anchor.player.id;
    isOnOwn ||= isOwn && gap <= 0;
    // Front to back: on a tie the front one wins.
    if (!isOwn && gap < nearestGap) {
      nearest = anchor.player.id;
      nearestGap = gap;
    }
  }
  return isOnOwn ? null : nearest;
}
