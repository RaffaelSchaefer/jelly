/**
 * The couch of the lounge: a frame with arms and backrest, soft cushions and two throw pillows in
 * the jelly colors. Jellies standing in front of it look as if they sit on it.
 *
 * @module
 */

import { JELLY_COLORS } from "@jelly/scene/colors";
import { CylinderGeometry, Group } from "three";

import type { FloorPoint } from "./world.ts";

import { createBox, createMatte, createZoneShadow, mergeParts } from "./props.ts";

/** Depth of the couch from its back to the front of the seat, in jelly units. */
export const COUCH_DEPTH = 0.95;
/** Feet narrow to `taper` of their radius at the floor. */
const FOOT = { radius: 0.05, height: 0.08, inset: 0.14, taper: 0.8, segments: 10 };
const BASE = { height: 0.3, rounding: 0.08 };
const ARM = { width: 0.26, height: 0.38, rounding: 0.11 };
const BACKREST = { depth: 0.26, height: 0.6, rounding: 0.1 };
const SEAT = { height: 0.17, gap: 0.04, rounding: 0.07, widest: 1.15 };
const BACK_CUSHION = { height: 0.42, depth: 0.2, lean: -0.18, rounding: 0.08 };
/** Pillows keep `armGap` from the arms. */
const PILLOW = {
  width: 0.38,
  height: 0.36,
  depth: 0.13,
  rounding: 0.06,
  lean: -0.35,
  tilt: 0.28,
  armGap: 0.04,
};

const FRAME_MATERIAL = createMatte("#d79f3c");
const CUSHION_MATERIAL = createMatte("#f0c15c");
const FOOT_MATERIAL = createMatte("#6b4e3a");
const PILLOW_MATERIALS = [JELLY_COLORS.mint.glow, JELLY_COLORS.lilac.glow].map((color) =>
  createMatte(color),
);

/** Builds the frame: feet, base, backrest and arms. */
function createFrame(spot: FloorPoint, width: number): Group {
  const frame = new Group();
  const back = spot.z - COUCH_DEPTH / 2;
  const seatBottom = FOOT.height + BASE.height;
  const feet = [-1, 1].flatMap((sideX) =>
    [-1, 1].map((sideZ) => ({
      geometry: new CylinderGeometry(
        FOOT.radius,
        FOOT.radius * FOOT.taper,
        FOOT.height,
        FOOT.segments,
      ),
      at: {
        x: spot.x + sideX * (width / 2 - FOOT.inset),
        y: FOOT.height / 2,
        z: spot.z + sideZ * (COUCH_DEPTH / 2 - FOOT.inset),
      },
    })),
  );
  const base = { width, height: BASE.height, depth: COUCH_DEPTH, rounding: BASE.rounding };
  const backrest = { width, ...BACKREST };
  frame.add(
    mergeParts(feet, FOOT_MATERIAL),
    createBox(base, FRAME_MATERIAL, spot, FOOT.height),
    createBox(backrest, FRAME_MATERIAL, { x: spot.x, z: back + BACKREST.depth / 2 }, seatBottom),
  );
  for (const side of [-1, 1]) {
    const arm = { ...ARM, depth: COUCH_DEPTH };
    const armSpot = { x: spot.x + side * (width / 2 - ARM.width / 2), z: spot.z };
    frame.add(createBox(arm, FRAME_MATERIAL, armSpot, seatBottom));
  }
  return frame;
}

/** Builds the seat and back cushions between the arms. */
function createCushions(spot: FloorPoint, width: number): Group {
  const cushions = new Group();
  const back = spot.z - COUCH_DEPTH / 2;
  const seatBottom = FOOT.height + BASE.height;
  const inner = width - 2 * ARM.width;
  const count = Math.max(1, Math.round(inner / SEAT.widest));
  const share = inner / count;
  const seatDepth = COUCH_DEPTH - BACKREST.depth;
  for (let index = 0; index < count; index++) {
    const x = spot.x - inner / 2 + (index + 0.5) * share;
    const seat = {
      width: share - SEAT.gap,
      height: SEAT.height,
      depth: seatDepth - SEAT.gap,
      rounding: SEAT.rounding,
    };
    const backCushion = {
      width: share - SEAT.gap,
      height: BACK_CUSHION.height,
      depth: BACK_CUSHION.depth,
      rounding: BACK_CUSHION.rounding,
    };
    const leaning = createBox(
      backCushion,
      CUSHION_MATERIAL,
      { x, z: back + BACKREST.depth + BACK_CUSHION.depth / 2 },
      seatBottom + SEAT.height,
    );
    leaning.rotation.x = BACK_CUSHION.lean;
    cushions.add(
      createBox(
        seat,
        CUSHION_MATERIAL,
        { x, z: back + BACKREST.depth + seatDepth / 2 },
        seatBottom,
      ),
      leaning,
    );
  }
  return cushions;
}

/** Builds the two throw pillows in the corners of the seat. */
function createPillows(spot: FloorPoint, width: number): Group {
  const pillows = new Group();
  const back = spot.z - COUCH_DEPTH / 2;
  const bottom = FOOT.height + BASE.height + SEAT.height;
  PILLOW_MATERIALS.forEach((material, index) => {
    const side = index === 0 ? -1 : 1;
    const pillowSpot = {
      x: spot.x + side * (width / 2 - ARM.width - PILLOW.width / 2 - PILLOW.armGap),
      z: back + BACKREST.depth + BACK_CUSHION.depth + PILLOW.depth,
    };
    const pillow = createBox(PILLOW, material, pillowSpot, bottom);
    pillow.rotation.set(PILLOW.lean, 0, -side * PILLOW.tilt);
    pillows.add(pillow);
  });
  return pillows;
}

/** Builds a couch with its back at the back of `spot` and the given width. */
export function createCouch(spot: FloorPoint, width: number): Group {
  const couch = new Group();
  const footprint = {
    minX: spot.x - width / 2,
    maxX: spot.x + width / 2,
    minZ: spot.z - COUCH_DEPTH / 2,
    maxZ: spot.z + COUCH_DEPTH / 2,
  };
  couch.add(
    createFrame(spot, width),
    createCushions(spot, width),
    createPillows(spot, width),
    createZoneShadow(footprint),
  );
  return couch;
}
