/**
 * The marks in the room that follow the jellies: the light on highlighted ones, the rings of choice,
 * the ring under the pointer, the pointer at the own goal, the ring with the time left around every
 * stack, the lighthouse on a highlighted tower, and the garland and the dance floor of a conga line.
 *
 * @module
 */

import type { Scene } from "three";

import type { CongaFrame } from "./congaLines.ts";
import type { StageEffect } from "./effects.ts";
import type { JellySpot } from "./jellies.ts";
import type { StageMove, StagePoint, StageStack } from "./types.ts";
import type { RoomSize } from "./world.ts";
import type { Placement } from "./zones.ts";

import { createBeams, updateBeams, type StageBeams } from "./beams.ts";
import { createChoiceRings, updateChoiceRings, type ChoiceRings } from "./choiceRings.ts";
import { createGarlands, updateGarlands, type Garlands } from "./conga.ts";
import { createCongaFloor, updateCongaFloor, type CongaFloor } from "./congaFloor.ts";
import { createHoverRing, updateHoverRing, type HoverRing } from "./hoverRing.ts";
import { createLighthouses, updateLighthouses, type Lighthouses } from "./lighthouse.ts";
import { createPointer, updatePointer, type StagePointer } from "./pointer.ts";
import { createStackRings, updateStackRings, type StackRings } from "./stackRings.ts";

/** Everything that marks jellies and places in the room. */
export interface RoomMarks {
  beams: StageBeams;
  choiceRings: ChoiceRings;
  congaFloor: CongaFloor;
  garlands: Garlands;
  goalPointer: StagePointer;
  hoverRing: HoverRing;
  lighthouses: Lighthouses;
  stackRings: StackRings;
}

/** What {@link updateRoomMarks} needs for a frame. */
export interface RoomMarksFrame {
  /** Where the jellies are in this frame. */
  spots: JellySpot[];
  effects: StageEffect[];
  /** The newest move of each jelly, by player ID. */
  moves: ReadonlyMap<number, StageMove>;
  /** The running stacks, as fresh as the last `stack.changed`. */
  stacks: StageStack[];
  /** The conga lines that show in this frame: where a garland hangs and who dances. */
  congas: CongaFrame;
  platforms: Placement[];
  room: RoomSize;
  /** The jellies that light up in this frame. */
  lit: ReadonlySet<number>;
  ownId: number | null;
  /** The jelly under the pointer, null for none. */
  hoveredId: number | null;
  /** Where the own jelly is heading, null when it goes nowhere. */
  destination: StagePoint | null;
  /** Seconds since the last frame. */
  seconds: number;
  /** Local time and server time of this frame in milliseconds. */
  now: number;
  serverTime: number;
  reducedMotion: boolean;
}

/** Creates all marks and puts them into the scene. */
export function createRoomMarks(scene: Scene): RoomMarks {
  const marks: RoomMarks = {
    beams: createBeams(),
    choiceRings: createChoiceRings(),
    congaFloor: createCongaFloor(),
    garlands: createGarlands(),
    goalPointer: createPointer(),
    hoverRing: createHoverRing(),
    lighthouses: createLighthouses(),
    stackRings: createStackRings(),
  };
  scene.add(
    marks.beams.root,
    marks.choiceRings.root,
    marks.congaFloor.mesh,
    marks.garlands.root,
    marks.goalPointer.root,
    marks.hoverRing.mesh,
    marks.lighthouses.root,
    marks.stackRings.mesh,
  );
  return marks;
}

/**
 * Moves the light on highlighted jellies and towers, the garlands and the dance floor, all rings
 * and the pointer at the own goal.
 */
export function updateRoomMarks(marks: RoomMarks, frame: RoomMarksFrame): void {
  const { spots, effects, stacks, platforms, room, serverTime, seconds, now, reducedMotion } =
    frame;
  updateBeams(marks.beams, { spots, effects, stacks, platforms, now });
  updateLighthouses(marks.lighthouses, {
    spots,
    effects,
    stacks,
    platforms,
    room,
    now,
    reducedMotion,
  });
  const { links, dancers } = frame.congas;
  updateGarlands(marks.garlands, { spots, links, serverTime, reducedMotion });
  updateCongaFloor(marks.congaFloor, { spots, dancers, platforms, serverTime, reducedMotion });
  updateStackRings(marks.stackRings, {
    stacks,
    platforms,
    room,
    serverTime,
    seconds,
    reducedMotion,
  });
  updateChoiceRings(marks.choiceRings, { spots, lit: frame.lit, seconds, reducedMotion });
  const spot = spots.find((candidate) => candidate.player.id === frame.hoveredId);
  updateHoverRing(marks.hoverRing, { spot, seconds, reducedMotion });
  const own = spots.find((candidate) => candidate.player.id === frame.ownId)?.player;
  updatePointer(marks.goalPointer, {
    destination: own ? frame.destination : null,
    move: own && frame.moves.get(own.id),
    color: own?.color ?? "",
    platforms,
    room,
    serverTime,
    seconds,
    reducedMotion,
  });
}
