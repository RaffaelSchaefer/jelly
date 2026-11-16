/**
 * Flights of the stage camera: from one view to another in a set time, eased at both ends. A long
 * way zooms out on the way like a map app, so the goal shows up before the camera arrives.
 *
 * @module
 */

import { MathUtils } from "three";

import type { FloorPoint } from "./world.ts";

import { ZOOM_RANGE } from "./zoom.ts";

/** Seconds of the shortest and the longest flight. */
const DURATION = { shortest: 0.55, longest: 1.5, perView: 0.3, perZoom: 0.12 };
/** How far a flight zooms out halfway, per view of way beyond the first half, and at most. */
const LIFT = { offset: 0.5, highest: 1.5 };

/** A view of the camera: how close it is and which floor point is in the middle. */
export interface CameraPose {
  factor: number;
  focus: FloorPoint;
}

/** A flight between two views. The goal may move, the camera keeps up with it. */
export interface Flight {
  from: CameraPose;
  to: CameraPose;
  /** Seconds since the start, below 0 while it waits. */
  time: number;
  seconds: number;
  /** How far it zooms out halfway, 0 not at all. */
  lift: number;
}

/**
 * Plans a flight. `roomWidth` is the floor the whole room shows, so the way can be measured in
 * views. `wait` holds the first view that many seconds.
 */
export function planFlight(from: CameraPose, to: CameraPose, roomWidth: number, wait = 0): Flight {
  const view = roomWidth / Math.min(from.factor, to.factor);
  const way = Math.hypot(to.focus.x - from.focus.x, to.focus.z - from.focus.z) / view;
  const zoomWay = Math.abs(Math.log2(to.factor / from.factor));
  const seconds = MathUtils.clamp(
    DURATION.shortest + DURATION.perView * Math.log2(1 + way) + DURATION.perZoom * zoomWay,
    DURATION.shortest,
    DURATION.longest,
  );
  const lift = MathUtils.clamp(way - LIFT.offset, 0, LIFT.highest);
  return { from, to, time: -wait, seconds, lift };
}

/** Slow at both ends, fast in the middle. */
function easeInOut(share: number): number {
  return share < 0.5 ? 4 * share ** 3 : 1 - (2 - 2 * share) ** 3 / 2;
}

/** Returns the view of a flight at its time. */
export function poseAt(flight: Flight): CameraPose {
  const share = MathUtils.clamp(flight.time / flight.seconds, 0, 1);
  const { from, to } = flight;
  // A landed flight hands over exactly the view it was asked for.
  if (share === 1) {
    return { factor: Math.max(ZOOM_RANGE.lowest, to.factor), focus: { ...to.focus } };
  }
  const eased = easeInOut(share);
  const factor =
    (from.factor * (to.factor / from.factor) ** eased) /
    (1 + flight.lift * Math.sin(Math.PI * share));
  return {
    factor: Math.max(ZOOM_RANGE.lowest, factor),
    focus: {
      x: MathUtils.lerp(from.focus.x, to.focus.x, eased),
      z: MathUtils.lerp(from.focus.z, to.focus.z, eased),
    },
  };
}

/** Reports whether a flight has arrived. */
export function hasLanded(flight: Flight): boolean {
  return flight.time >= flight.seconds;
}
