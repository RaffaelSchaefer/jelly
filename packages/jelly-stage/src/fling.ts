/**
 * A jelly thrown out of a tower: it flies out sideways, spins and lands back on its move. The move
 * goes on underneath meanwhile, the throw only adds an offset that it soon catches up with.
 *
 * @module
 */

import type { FloorPoint } from "./world.ts";

/** Out until `out`, held until `hold`, back on its move at `end`, in seconds. */
const FLING_TIME = { out: 0.35, hold: 0.7, end: 1.7 } as const;
/** How long the spin and the somersault take, in seconds. */
const SPIN_SECONDS = 1.1;
const FLIP_SECONDS = 0.75;
/** Once the move has led this far from where the jelly stood, it shows the way. */
const AIM_DISTANCE = 0.02;
/** A move that does not lead away within this time is not waited for. */
const AIM_SECONDS = 0.15;

/** How a throw starts. */
export interface FlingStart {
  startedAt: number;
  /** How far it flies out, in scene units. */
  reach: number;
  /** Extra turn and somersault in radians, whole turns so it ends facing the same way. */
  spin: number;
  flip: number;
  /** The way it flies when its move does not lead away. */
  fallbackAngle: number;
}

/** A running throw. */
export interface Fling extends FlingStart {
  /** Where the jelly stood when it was thrown, known in its first frame. */
  origin: FloorPoint | null;
  dirX: number;
  dirZ: number;
  hasAim: boolean;
}

/** The part of a pose a throw sets. */
export interface FlingPose {
  offsetX: number;
  offsetZ: number;
  spin: number;
  flip: number;
}

/** Starts a throw. */
export function createFling(start: FlingStart): Fling {
  return { ...start, origin: null, dirX: 0, dirZ: 0, hasAim: false };
}

/** Eases out: fast at first, slow at the end. */
function easeOut(share: number): number {
  return 1 - (1 - share) ** 3;
}

/** Eases in and out. */
function easeInOut(share: number): number {
  return share * share * (3 - 2 * share);
}

/** Returns how far out the throw carries the jelly, as a share of its reach. */
export function measureThrow(age: number): number {
  if (age < FLING_TIME.out) return easeOut(age / FLING_TIME.out);
  if (age < FLING_TIME.hold) return 1;
  return 1 - easeInOut(Math.min(1, (age - FLING_TIME.hold) / (FLING_TIME.end - FLING_TIME.hold)));
}

/** Takes the direction of the new move as soon as it leads away, or the fallback after a moment. */
function aim(fling: Fling, origin: FloorPoint, position: FloorPoint, age: number): void {
  const deltaX = position.x - origin.x;
  const deltaZ = position.z - origin.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance > AIM_DISTANCE) {
    Object.assign(fling, { dirX: deltaX / distance, dirZ: deltaZ / distance, hasAim: true });
  } else if (age > AIM_SECONDS) {
    const { fallbackAngle } = fling;
    Object.assign(fling, { dirX: Math.sin(fallbackAngle), dirZ: Math.cos(fallbackAngle) });
    fling.hasAim = true;
  }
}

/**
 * Sets the offset, spin and somersault of a throw for this frame. Returns false once the jelly is
 * back on its move, then the throw is over and the pose is at rest.
 */
export function poseFling(
  fling: Fling,
  position: FloorPoint,
  time: number,
  pose: FlingPose,
): boolean {
  const age = time - fling.startedAt;
  fling.origin ??= position;
  if (!fling.hasAim) aim(fling, fling.origin, position, age);
  const along =
    (position.x - fling.origin.x) * fling.dirX + (position.z - fling.origin.z) * fling.dirZ;
  // The move catches up with the throw: the offset is only what the move has not walked yet.
  const out = fling.hasAim ? Math.max(0, fling.reach * measureThrow(age) - Math.max(0, along)) : 0;
  pose.offsetX = fling.dirX * out;
  pose.offsetZ = fling.dirZ * out;
  pose.spin = fling.spin * easeOut(Math.min(1, age / SPIN_SECONDS));
  pose.flip = fling.flip * easeInOut(Math.min(1, age / FLIP_SECONDS));
  return age < FLING_TIME.end;
}
