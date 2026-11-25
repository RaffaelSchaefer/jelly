/**
 * The camera of the Jelly-News as numbers: where it stands, where it looks, how wide it sees and how
 * far the picture is shifted up. Shots are composed, blended and shaken here, and points are
 * projected the way three.js does it, so the shot list can be tested without three.
 *
 * @module
 */

import type { FloorPoint, ScenePoint } from "./world.ts";

const DEGREE = Math.PI / 180;
/** A subject never sits farther out than this share of the half width, whatever a shot asks for. */
const WIDEST_ACROSS = 0.95;
/** The camera never turns more than this sine away from its aim, even for an aim right beside it. */
const WIDEST_TURN = 0.95;
/** Below this the camera stands right above its aim and cannot turn toward it. */
const TINY = 1e-6;
/** A shaken camera wanders on a few slow waves at once, in turns per second, so it never repeats. */
const SHAKE_WAVES = [
  { rate: 0.37, phase: 0.4, weight: 0.6 },
  { rate: 0.83, phase: 2.1, weight: 0.3 },
  { rate: 1.71, phase: 4.6, weight: 0.1 },
];

/** A pose of the news camera. It never rolls: up stays up. */
export interface NewsPose {
  position: ScenePoint;
  target: ScenePoint;
  /** Vertical field of view in degrees. */
  fov: number;
  /**
   * How far the picture is pushed up, as a share of its height. `setViewOffset` does the same with
   * its vertical offset, the fitted camera of `scene.ts` uses it to center the room.
   */
  lift: number;
}

/** The picture a pose is seen in. */
export interface NewsView {
  /** Width over height. */
  aspect: number;
  /** The band the page leaves free, as shares of the height from the top. */
  top: number;
  bottom: number;
}

/** Where a point lands in the picture. */
export interface NewsProjection {
  /** From -1 at the left edge to 1 at the right edge, as three.js counts. */
  x: number;
  /** From -1 at the bottom to 1 at the top. */
  y: number;
  /** How far in front of the camera along its view, negative behind it. */
  depth: number;
}

/** How a shot puts its aim into the picture. */
export interface NewsLook {
  /** Vertical field of view in degrees. */
  fov: number;
  /** Where the aim appears sideways, from -1 at the left edge to 1 at the right edge. */
  across: number;
  /** Where the aim appears in the free band, 0 at its top and 1 at its bottom. */
  down: number;
}

/** Returns the tangent of half a field of view in degrees. */
export function measureSpan(fov: number): number {
  return Math.tan((fov * DEGREE) / 2);
}

/** Returns how far away a camera with this field of view sees exactly `height` from top to bottom. */
export function standOff(height: number, fov: number): number {
  return height / (2 * measureSpan(fov));
}

/** A free band never counts as smaller than this share of the picture. */
const LEAST_BAND = 0.25;

/**
 * Returns how far away a camera sees `height` across the band the page leaves free, so a framing
 * looks the same between the buttons of the map as on the whole beamer.
 */
export function standOffInBand(height: number, fov: number, view: NewsView): number {
  return standOff(height / Math.max(LEAST_BAND, view.bottom - view.top), fov);
}

/** Returns the way along the floor from a subject toward a camera at `azimuth` degrees, 0 is +z. */
export function toDirection(azimuth: number): FloorPoint {
  return { x: Math.sin(azimuth * DEGREE), z: Math.cos(azimuth * DEGREE) };
}

/** Returns how far the picture is lifted so the target of a pose shows where `look` wants it. */
function findLift(look: NewsLook, view: NewsView): number {
  return 0.5 - (view.top + look.down * (view.bottom - view.top));
}

/**
 * Returns a pose at `position` that shows `aim` where `look` wants it. The camera turns sideways so
 * the aim lands at `look.across`, and the picture is lifted so it lands at `look.down`.
 */
export function aimFrom(
  position: ScenePoint,
  aim: ScenePoint,
  look: NewsLook,
  view: NewsView,
): NewsPose {
  const offset = { x: aim.x - position.x, y: aim.y - position.y, z: aim.z - position.z };
  const flat = Math.max(TINY, Math.hypot(offset.x, offset.z));
  const across = Math.max(-WIDEST_ACROSS, Math.min(WIDEST_ACROSS, look.across));
  const reach = across * view.aspect * measureSpan(look.fov);
  // Turned by `turn`, the aim lies `flat * sin(turn)` beside the view and `|offset|` ahead of it.
  const sine = (reach * Math.hypot(flat, offset.y)) / (flat * Math.hypot(1, reach));
  const turn = Math.asin(Math.max(-WIDEST_TURN, Math.min(WIDEST_TURN, sine)));
  const yaw = Math.atan2(-offset.x, -offset.z) + turn;
  const pitch = Math.atan2(offset.y, flat * Math.cos(turn));
  const distance = Math.hypot(flat, offset.y);
  const target = {
    x: position.x - Math.sin(yaw) * Math.cos(pitch) * distance,
    y: position.y + Math.sin(pitch) * distance,
    z: position.z - Math.cos(yaw) * Math.cos(pitch) * distance,
  };
  return { position: { ...position }, target, fov: look.fov, lift: findLift(look, view) };
}

/** Returns the unit vectors of a pose: forward, right and up, as three.js builds them for `lookAt`. */
function findAxes(pose: NewsPose) {
  const { position, target } = pose;
  const ahead = { x: target.x - position.x, y: target.y - position.y, z: target.z - position.z };
  const length = Math.max(TINY, Math.hypot(ahead.x, ahead.y, ahead.z));
  const forward = { x: ahead.x / length, y: ahead.y / length, z: ahead.z / length };
  const side = Math.max(TINY, Math.hypot(forward.x, forward.z));
  const right = { x: -forward.z / side, y: 0, z: forward.x / side };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  return { forward, right, up };
}

/** Projects a point of the scene into the picture of a pose, as three.js and its view offset do. */
export function projectNews(pose: NewsPose, point: ScenePoint, aspect: number): NewsProjection {
  const { forward, right, up } = findAxes(pose);
  const offset = {
    x: point.x - pose.position.x,
    y: point.y - pose.position.y,
    z: point.z - pose.position.z,
  };
  const dot = (axis: ScenePoint) => offset.x * axis.x + offset.y * axis.y + offset.z * axis.z;
  const depth = dot(forward);
  const span = measureSpan(pose.fov);
  return {
    x: dot(right) / (depth * span * aspect),
    y: dot(up) / (depth * span) + 2 * pose.lift,
    depth,
  };
}

/** Slow at both ends, with no jolt where it starts or stops. */
export function easeInOut(share: number): number {
  const clamped = Math.max(0, Math.min(1, share));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

/** Returns the point `share` of the way from one point to another. */
function mixPoints(from: ScenePoint, to: ScenePoint, share: number): ScenePoint {
  return {
    x: from.x + (to.x - from.x) * share,
    y: from.y + (to.y - from.y) * share,
    z: from.z + (to.z - from.z) * share,
  };
}

/**
 * Returns the pose `share` of the way from one pose to another, like a crane between the two. At
 * either end it is exactly that pose, so a crane lands where the normal camera stands.
 */
export function blendPoses(from: NewsPose, to: NewsPose, share: number): NewsPose {
  if (share <= 0) return from;
  if (share >= 1) return to;
  return {
    position: mixPoints(from.position, to.position, share),
    target: mixPoints(from.target, to.target, share),
    fov: from.fov + (to.fov - from.fov) * share,
    lift: from.lift + (to.lift - from.lift) * share,
  };
}

/** Returns a slow, uneven wobble between -1 and 1 per axis, the same on every screen. */
function wobble(seconds: number, seed: number): number {
  return SHAKE_WAVES.reduce(
    (sum, wave) =>
      sum + wave.weight * Math.sin(2 * Math.PI * wave.rate * seconds + wave.phase * seed),
    0,
  );
}

/** Shakes a pose like a camera on the shoulder: position and target wander by up to these lengths. */
export function shakePose(
  pose: NewsPose,
  seconds: number,
  reach: { position: number; target: number },
): NewsPose {
  const along = (seed: number) => wobble(seconds, seed);
  return {
    ...pose,
    position: {
      x: pose.position.x + along(1) * reach.position,
      y: pose.position.y + along(2) * reach.position,
      z: pose.position.z + along(3) * reach.position,
    },
    target: {
      x: pose.target.x + along(4) * reach.target,
      y: pose.target.y + along(5) * reach.target,
      z: pose.target.z + along(6) * reach.target,
    },
  };
}
