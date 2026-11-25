/**
 * The props of the room as the news camera sees them: blocks it cannot look through. A desk, a
 * counter alone, a couch alone, a beanbag or the rug hides at most the lower half of a jelly and is
 * looked over. The back of the lounge with its neon sign, the snack bar with its machines, a fridge,
 * plants, a lava lamp and the screens, speakers and pedestal of the stage hide a face. The heights
 * follow the models in `lounge.ts`, `couch.ts`, `plants.ts`, `snackBar.ts`, `snacks.ts`,
 * `stageSet.ts` and `stageScreen.ts`, which bring three and so are not imported here.
 *
 * @module
 */

import type { StageArea } from "./types.ts";
import type { FloorRect, RoomSize } from "./world.ts";

import { isPlatformProp } from "./propNames.ts";
import { shrinkRect } from "./world.ts";
import {
  findFloorHeight,
  findPedestalRect,
  fitFootprint,
  listScreenRects,
  listSpeakerRects,
  placeArea,
  PEDESTAL,
  SPEAKER,
  STAGE_HEIGHT,
  toLocalRect,
  toRoomPoint,
  type Footprint,
  type Placement,
} from "./zones.ts";

/** The back of the lounge: couch and neon sign behind the rug, as `createLounge` lays them out. */
const LOUNGE = { inset: 0.35, depth: 0.1 + 0.95, top: 1.03 + 0.82 };
/** A sign wall alone: the board between its posts, near the back edge of its zone. */
const SIGN_WALL = { half: 1.45, depth: 0.3, top: 1.85 };
/** Small props standing in the middle of their zone: half their width and their top. */
const SMALL: Record<string, { half: number; top: number }> = {
  "lava-lamp": { half: 0.26, top: 0.42 + 0.24 + 0.64 + 0.13 },
  "snake-plant": { half: 0.3, top: 0.4 + 1.25 },
  bush: { half: 0.55, top: 0.42 + 1.02 + 0.23 },
};
/** The counter of a snack bar with the machines on it. A fridge at its end is about as tall. */
const SNACK_TOP = 1.1 + 0.8;
const FRIDGE = { footprint: { width: 0.95, depth: 1.2 }, top: 1.85 };
/** A beamer screen: its frame and picture, standing on legs, and how far that reaches up. */
const SCREEN = { half: 2.1 + 0.12, depth: 0.3, top: 0.55 + 2.3 + 0.12 };
/** A speaker stack with its lights, and the pedestal with the trophy, at their own size. */
const SPEAKER_TOP = 0.95 + 0.62 + 0.28;
const PEDESTAL_TOP = 0.62 + 0.8;

/** A block the camera cannot look through: a turned rectangle on the floor, up to a height. */
export interface NewsBlock {
  place: Placement;
  /** Height of its top over the floor of the hall. */
  top: number;
}

/** A block inside a zone before it is placed: around the middle of the zone, front toward +z. */
interface LocalBlock {
  rect: FloorRect;
  /** How far it reaches up from the floor of its zone. */
  height: number;
}

/** Returns a square block of half width `half` in the middle of a zone. */
function inMiddle(half: number, height: number): LocalBlock[] {
  return [{ rect: { minX: -half, maxX: half, minZ: -half, maxZ: half }, height }];
}

/** Returns the block of a model of a fixed shape, grown or shrunk to fill its zone. */
function fitted(rect: FloorRect, footprint: Footprint, height: number): LocalBlock[] {
  const scale = fitFootprint(rect, footprint);
  const halfX = (footprint.width * scale) / 2;
  const halfZ = (footprint.depth * scale) / 2;
  return [
    { rect: { minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ }, height: height * scale },
  ];
}

/** Returns the blocks of a whole stage: its screens, speakers and pedestal on the platform. */
function listStageBlocks(rect: FloorRect): LocalBlock[] {
  const screens = listScreenRects(rect).map((screen) => ({ rect: screen, height: SCREEN.top }));
  const speakers = listSpeakerRects(rect).map((speaker) => ({
    rect: speaker,
    height: SPEAKER_TOP,
  }));
  const pedestal = { rect: findPedestalRect(rect), height: PEDESTAL_TOP };
  return [...screens, ...speakers, pedestal].map((block) => ({
    ...block,
    height: STAGE_HEIGHT + block.height,
  }));
}

/** The blocks of every prop that can hide a face, inside its zone. */
const SHAPES: Record<string, (rect: FloorRect) => LocalBlock[]> = {
  "lounge-set": (rect) => {
    const rug = shrinkRect(rect, LOUNGE.inset);
    return [
      { rect: { ...rug, maxZ: Math.min(rug.maxZ, rug.minZ + LOUNGE.depth) }, height: LOUNGE.top },
    ];
  },
  "sign-wall": (rect) => [
    {
      rect: {
        minX: -SIGN_WALL.half,
        maxX: SIGN_WALL.half,
        minZ: rect.minZ,
        maxZ: rect.minZ + SIGN_WALL.depth,
      },
      height: SIGN_WALL.top,
    },
  ],
  "snack-bar-set": (rect) => [{ rect, height: SNACK_TOP }],
  fridge: (rect) => fitted(rect, FRIDGE.footprint, FRIDGE.top),
  "stage-set": listStageBlocks,
  screen: () => [
    {
      rect: {
        minX: -SCREEN.half,
        maxX: SCREEN.half,
        minZ: -SCREEN.depth / 2,
        maxZ: SCREEN.depth / 2,
      },
      height: SCREEN.top,
    },
  ],
  speaker: (rect) => fitted(rect, SPEAKER, SPEAKER_TOP),
  pedestal: (rect) => fitted(rect, PEDESTAL, PEDESTAL_TOP),
  ...Object.fromEntries(
    Object.entries(SMALL).map(([prop, { half, top }]) => [prop, () => inMiddle(half, top)]),
  ),
};

/** Places a block of a zone into the room, turned with its zone. */
function placeBlock(block: LocalBlock, zone: Placement, floor: number): NewsBlock {
  const { rect } = block;
  const middle = toRoomPoint(
    { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 },
    zone,
  );
  return {
    place: { middle, width: rect.maxX - rect.minX, depth: rect.maxZ - rect.minZ, turn: zone.turn },
    top: floor + block.height,
  };
}

/** Returns every block of the room the camera cannot look through, from the areas of the server. */
export function listBlocks(
  areas: StageArea[],
  room: RoomSize,
  platforms: Placement[],
): NewsBlock[] {
  return areas.flatMap((area) => {
    const shape = SHAPES[area.prop];
    if (!shape) return [];
    const zone = placeArea(area, room);
    // A platform stands on the hall floor, everything else on whatever platform is there.
    const floor = isPlatformProp(area.prop) ? 0 : findFloorHeight(zone.middle, platforms);
    return shape(toLocalRect(zone)).map((block) => placeBlock(block, zone, floor));
  });
}
