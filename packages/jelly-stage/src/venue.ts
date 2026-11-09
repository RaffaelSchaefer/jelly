/**
 * What stands in the hall: every zone with a `prop` gets its model, built around its own middle
 * and then turned and placed. Unknown props show bare floor. Desks and cables are not here, they
 * merge into a few meshes in `furniture.ts`.
 *
 * @module
 */

import { Group, type Object3D } from "three";

import type { StageArea } from "./types.ts";
import type { FloorRect, RoomSize } from "./world.ts";

import {
  createBeanbag,
  createLavaLamp,
  createLounge,
  createRug,
  createSignWall,
  createStringLights,
} from "./lounge.ts";
import { createCouch } from "./couch.ts";
import { createBush, createCactus, createSnakePlant } from "./plants.ts";
import { createZoneShadow, findMiddle, VENUE_TIME } from "./props.ts";
import { createCounter, createFridge, createMarquee, createSnackBar } from "./snackBar.ts";
import { listSnacks } from "./snacks.ts";
import {
  createParLight,
  createPedestal,
  createScreen,
  createSockets,
  createSpeakerStack,
  createStage,
  createStagePlatform,
  createTrophy,
} from "./stageSet.ts";
import { findFloorHeight, listPlatforms, placeArea, toLocalRect, type Placement } from "./zones.ts";
import { isPlatformProp } from "./propNames.ts";

/** A couch alone is at most this wide, like the one of the lounge. */
const LONGEST_COUCH = 3.4;
/** A PAR light alone stands straight and takes the first glow color. */
const PAR_ALONE = { side: 0, color: 0 };

/** Builds a model in the rectangle of its zone, around the origin, the front toward +z. */
type PropBuilder = (rect: FloorRect, area: StageArea) => Object3D;

/** Builds a part that stands in the middle of its zone and keeps its own size. */
function standing(build: (spot: { x: number; z: number }) => Object3D): PropBuilder {
  return (rect) => build(findMiddle(rect));
}

/** The snacks stand on the floor when they are placed alone. */
const SNACK_BUILDERS = Object.fromEntries(
  listSnacks().map((snack) => [snack.key, standing((spot) => snack.build(spot, 0))]),
);

/** The model of every prop the server lists. */
const BUILDERS: Record<string, PropBuilder> = {
  "stage-set": createStage,
  "stage-platform": createStagePlatform,
  screen: (rect, area) => createScreen(rect, area.id),
  speaker: (rect) => createSpeakerStack(rect, PAR_ALONE.side),
  pedestal: createPedestal,
  trophy: standing((spot) => createTrophy(spot, 0)),
  "par-light": standing((spot) => createParLight(spot, 0, PAR_ALONE.side, PAR_ALONE.color)),
  sockets: (rect) => new Group().add(...createSockets(rect, [])),
  "lounge-set": createLounge,
  rug: createRug,
  "sign-wall": createSignWall,
  "lava-lamp": standing(createLavaLamp),
  beanbag: (rect, area) => createBeanbag(findMiddle(rect), 1, area.id),
  couch: (rect) => createCouch(findMiddle(rect), Math.min(LONGEST_COUCH, rect.maxX - rect.minX)),
  "snake-plant": standing(createSnakePlant),
  bush: standing(createBush),
  cactus: standing((spot) => createCactus(spot, 0)),
  "string-lights": createStringLights,
  "snack-bar-set": createSnackBar,
  counter: (rect) => new Group().add(createCounter(rect), createZoneShadow(rect)),
  marquee: createMarquee,
  fridge: createFridge,
  ...SNACK_BUILDERS,
};

/** Turns a model and puts it where its zone stands, on the floor that is there. */
function placeProp(model: Object3D, placement: Placement, floor: number): Object3D {
  model.position.set(placement.middle.x, floor, placement.middle.z);
  model.rotation.y = placement.turn;
  return model;
}

/** Builds the model of one zone in a room, or null for bare floor. */
export function createProp(
  area: StageArea,
  platforms: Placement[],
  room: RoomSize,
): Object3D | null {
  const build = BUILDERS[area.prop];
  if (!build) return null;
  const placement = placeArea(area, room);
  // A platform stands on the hall floor, everything else on whatever platform is there.
  const floor = isPlatformProp(area.prop) ? 0 : findFloorHeight(placement.middle, platforms);
  return placeProp(build(toLocalRect(placement), area), placement, floor);
}

/** Builds everything that stands in a room, except desks and cables. */
export function createVenue(areas: StageArea[], room: RoomSize): Group {
  const venue = new Group();
  const platforms = listPlatforms(areas, room);
  for (const area of areas) {
    if (area.prop === "desk" || area.prop === "cable") continue;
    const model = createProp(area, platforms, room);
    if (model) venue.add(model);
  }
  return venue;
}

/** Moves the screens, lights, speakers and machines on. */
export function updateVenue(time: number): void {
  VENUE_TIME.value = time;
}
