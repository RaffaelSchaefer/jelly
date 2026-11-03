/**
 * Potted plants for the venue: a tall snake plant with pointed leaves, a round bush and a little
 * cactus in bloom.
 *
 * @module
 */

import { CapsuleGeometry, ConeGeometry, CylinderGeometry, Group, SphereGeometry } from "three";

import type { FloorPoint } from "./world.ts";

import { createMatte, mergeParts, placeMesh, type PropPart } from "./props.ts";

const SNAKE_POT = { top: 0.2, bottom: 0.16, height: 0.4 };
/** Leaves of the snake plant: height, turn around the pot and how far they lean out. */
const BLADES: [number, number, number][] = [
  [1.25, 0, 0.05],
  [1.05, 0.9, 0.2],
  [0.95, 1.8, 0.24],
  [1.15, 2.7, 0.16],
  [0.85, 3.6, 0.28],
  [1.0, 4.5, 0.2],
  [0.8, 5.4, 0.3],
];
const BLADE = { radius: 0.075, flatness: 0.35, spread: 0.06 };
const BUSH_POT = { top: 0.24, bottom: 0.19, height: 0.42 };
/** Leaf balls of the bush: x, height and z from the middle of the pot, and radius. */
const LEAF_BALLS: [number, number, number, number][] = [
  [0, 0.78, 0, 0.36],
  [-0.22, 0.64, 0.1, 0.25],
  [0.23, 0.67, 0.06, 0.27],
  [0.04, 1.02, -0.04, 0.23],
];

const CACTUS_POT = { top: 0.1, bottom: 0.08, height: 0.13 };
const CACTUS_STEM = { radius: 0.07, length: 0.2 };
/** Arms of the cactus: side, height on the stem, length. */
const CACTUS_ARMS: [number, number, number][] = [
  [-1, 0.12, 0.08],
  [1, 0.2, 0.06],
];
const CACTUS_ARM = { radius: 0.035, reach: 0.09 };
const BLOSSOM_RADIUS = 0.035;

const CERAMIC_MATERIAL = createMatte("#f4efe6");
const CLAY_MATERIAL = createMatte("#d9875f");
const DARK_LEAF_MATERIAL = createMatte("#4f9d6b");
const LIGHT_LEAF_MATERIAL = createMatte("#7cc690");
const CACTUS_MATERIAL = createMatte("#5fb37a");
const BLOSSOM_MATERIAL = createMatte("#ff8fc8");

/** Builds a snake plant in a white pot. */
export function createSnakePlant(spot: FloorPoint): Group {
  const plant = new Group();
  const pot = new CylinderGeometry(SNAKE_POT.top, SNAKE_POT.bottom, SNAKE_POT.height, 20);
  plant.add(placeMesh(pot, CERAMIC_MATERIAL, { ...spot, y: SNAKE_POT.height / 2 }));
  const dark: PropPart[] = [];
  const light: PropPart[] = [];
  BLADES.forEach(([height, turn, lean], index) => {
    const blade = new ConeGeometry(BLADE.radius, height, 4).scale(1, 1, BLADE.flatness);
    const reach = BLADE.spread + (height / 2) * Math.sin(lean);
    const part = {
      geometry: blade,
      at: {
        x: spot.x + Math.cos(turn) * reach,
        y: SNAKE_POT.height + (height / 2) * Math.cos(lean),
        z: spot.z + Math.sin(turn) * reach,
      },
      // The leaf leans toward x first, then turns around the pot, so it tips away from the middle.
      turn: { x: 0, y: -turn, z: -lean },
    };
    (index % 2 === 0 ? dark : light).push(part);
  });
  plant.add(mergeParts(dark, DARK_LEAF_MATERIAL), mergeParts(light, LIGHT_LEAF_MATERIAL));
  return plant;
}

/** Builds a round bush in a clay pot. */
export function createBush(spot: FloorPoint): Group {
  const plant = new Group();
  const pot = new CylinderGeometry(BUSH_POT.top, BUSH_POT.bottom, BUSH_POT.height, 20);
  plant.add(placeMesh(pot, CLAY_MATERIAL, { ...spot, y: BUSH_POT.height / 2 }));
  const balls = LEAF_BALLS.map(([x, y, z, radius]) => ({
    geometry: new SphereGeometry(radius, 16, 12),
    at: { x: spot.x + x, y, z: spot.z + z },
  }));
  plant.add(
    mergeParts(
      balls.filter((_, index) => index % 2 === 0),
      DARK_LEAF_MATERIAL,
    ),
    mergeParts(
      balls.filter((_, index) => index % 2 === 1),
      LIGHT_LEAF_MATERIAL,
    ),
  );
  return plant;
}

/** Builds a small cactus with two arms and a blossom, standing on `bottom`. */
export function createCactus(spot: FloorPoint, bottom: number): Group {
  const plant = new Group();
  const pot = new CylinderGeometry(CACTUS_POT.top, CACTUS_POT.bottom, CACTUS_POT.height, 16);
  plant.add(placeMesh(pot, CLAY_MATERIAL, { ...spot, y: bottom + CACTUS_POT.height / 2 }));
  const stemBottom = bottom + CACTUS_POT.height;
  const stemMiddle = stemBottom + CACTUS_STEM.length / 2 + CACTUS_STEM.radius;
  const parts: PropPart[] = [
    {
      geometry: new CapsuleGeometry(CACTUS_STEM.radius, CACTUS_STEM.length, 4, 12),
      at: { ...spot, y: stemMiddle },
    },
  ];
  for (const [side, height, length] of CACTUS_ARMS) {
    parts.push({
      geometry: new CapsuleGeometry(CACTUS_ARM.radius, length, 4, 10),
      at: { x: spot.x + side * CACTUS_ARM.reach, y: stemBottom + height + length / 2, z: spot.z },
    });
  }
  const top = stemMiddle + CACTUS_STEM.length / 2 + CACTUS_STEM.radius;
  const blossom = new SphereGeometry(BLOSSOM_RADIUS, 10, 8);
  plant.add(
    mergeParts(parts, CACTUS_MATERIAL),
    placeMesh(blossom, BLOSSOM_MATERIAL, { ...spot, y: top }),
  );
  return plant;
}
