/**
 * Keeps the news camera clear of the room: it never stands in the box a jelly is drawn in, never
 * right above a head and never in a prop, and it looks over the jellies and props between it and
 * its subject. Everything here is smooth in the positions, so a jelly or a subject that walks past
 * moves the camera without a jump. Without three.
 *
 * @module
 */

import type { NewsBlock } from "./newsCameraProps.ts";
import type { FloorPoint, ScenePoint } from "./world.ts";

import { toLocalPoint } from "./zones.ts";

/** Nearer than this along the way to the camera, a jelly stands beside the subject, not in front. */
const BESIDE = 0.8;
/** Sight lines pass this high over the heads in the way, for hats and ears, and over props. */
const ROOM_OVER = { head: 0.4, prop: 0.25 };
/** The camera keeps this far from the box of a jelly, from a head and from a prop: its near plane. */
const NEAR = 1;
/** Over this much more distance the camera may come down from above a head to its own height. */
const FALLOFF = 1.2;
/** Something this far beside a sight line still counts a little, so it fades in and out. */
const SOFT = 0.6;
/**
 * A prop fades in over a wider way: it asks for far more height than a head, and the camera should
 * crane up over it, not jump, when a subject walks behind it.
 */
const PROP_SOFT = 1.5;
/** How many points of a sight line are tested against the props. */
const PROP_SAMPLES = 24;

/** A jelly at one moment, as something the camera has to look over or stay away from. */
export interface NewsPillar {
  spot: FloorPoint;
  /** Height of its head over the floor of the hall. */
  top: number;
  /** Half the width of its body, for sight lines. */
  half: number;
  /** How far the box it is drawn in reaches from its middle. */
  reach: number;
}

/** What stands in the room at one moment, besides the subjects of a shot. */
export interface NewsRoom {
  pillars: NewsPillar[];
  blocks: NewsBlock[];
}

/** A sight line from a subject toward the camera. */
export interface NewsSight {
  from: FloorPoint;
  /** The lowest height of the subject that has to show over the heads in front. */
  base: number;
  /** The lowest height that has to show over props in front: furniture may hide the belly. */
  over: number;
  /** The way along the floor toward the camera, of length 1. */
  direction: FloorPoint;
  /** How far the camera stands along it. */
  distance: number;
  /** Half the width of what has to stay in view. */
  half: number;
}

/** Smooth step from 1 at `inner` down to 0 at `inner + width`. */
function fade(distance: number, inner: number, width: number): number {
  const share = Math.max(0, Math.min(1, (inner + width - distance) / width));
  return share * share * (3 - 2 * share);
}

/** Returns how far a point is from a turned rectangle on the floor, 0 inside it. */
function measureGap(point: FloorPoint, block: NewsBlock): number {
  const local = toLocalPoint(point, block.place);
  const outX = Math.max(0, Math.abs(local.x) - block.place.width / 2);
  const outZ = Math.max(0, Math.abs(local.z) - block.place.depth / 2);
  return Math.hypot(outX, outZ);
}

/** Returns how much a jelly in front of the subject asks the camera to rise, per unit of distance. */
function measurePillar(sight: NewsSight, pillar: NewsPillar): number {
  const deltaX = pillar.spot.x - sight.from.x;
  const deltaZ = pillar.spot.z - sight.from.z;
  const along = deltaX * sight.direction.x + deltaZ * sight.direction.z;
  const beside = Math.abs(deltaX * sight.direction.z - deltaZ * sight.direction.x);
  const end = sight.distance + NEAR;
  const weight =
    fade(beside, sight.half + pillar.half, SOFT) *
    (1 - fade(along, BESIDE - SOFT, SOFT)) *
    fade(along, end, SOFT);
  if (weight <= 0) return 0;
  return (weight * (pillar.top + ROOM_OVER.head - sight.base)) / along;
}

/** Returns how much a prop in front of the subject asks the camera to rise, per unit of distance. */
function measureBlock(sight: NewsSight, block: NewsBlock): number {
  const { middle, width, depth } = block.place;
  const length = sight.distance + NEAR;
  const center = {
    x: sight.from.x + (sight.direction.x * length) / 2,
    z: sight.from.z + (sight.direction.z * length) / 2,
  };
  const reach = Math.hypot(width, depth) / 2 + sight.half + PROP_SOFT + length / 2;
  if (Math.hypot(middle.x - center.x, middle.z - center.z) > reach) return 0;
  let slope = 0;
  for (let index = 0; index < PROP_SAMPLES; index++) {
    const along = BESIDE + ((length - BESIDE) * index) / (PROP_SAMPLES - 1);
    const point = {
      x: sight.from.x + sight.direction.x * along,
      z: sight.from.z + sight.direction.z * along,
    };
    const weight = fade(measureGap(point, block), sight.half, PROP_SOFT);
    if (weight > 0)
      slope = Math.max(slope, (weight * (block.top + ROOM_OVER.prop - sight.over)) / along);
  }
  return slope;
}

/** Returns how high the camera has to stand so the subject shows over everything in the way. */
export function findSightHeight(sight: NewsSight, room: NewsRoom): number {
  let heads = 0;
  for (const pillar of room.pillars) heads = Math.max(heads, measurePillar(sight, pillar));
  let props = 0;
  for (const block of room.blocks) props = Math.max(props, measureBlock(sight, block));
  return Math.max(sight.base + heads * sight.distance, sight.over + props * sight.distance);
}

/**
 * Raises the camera over what stands around it, where it stands now: never in the box a jelly is
 * drawn in, never right above a head and never in a prop. It rises smoothly as it comes near.
 */
export function liftOverCrowd(position: ScenePoint, room: NewsRoom): ScenePoint {
  let height = position.y;
  for (const pillar of room.pillars) {
    const distance = Math.hypot(position.x - pillar.spot.x, position.z - pillar.spot.z);
    const weight = fade(distance, pillar.reach + NEAR, FALLOFF);
    if (weight > 0) height = Math.max(height, (pillar.top + NEAR) * weight);
  }
  for (const block of room.blocks) {
    const weight = fade(measureGap(position, block), NEAR, FALLOFF);
    if (weight > 0) height = Math.max(height, (block.top + NEAR) * weight);
  }
  return { ...position, y: height };
}
