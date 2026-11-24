/**
 * The marks in the room that follow the jellies: the light on highlighted ones, the rings of choice,
 * the ring under the pointer and the pointer at the own goal.
 *
 * @module
 */

import type { Scene } from "three";

import type { StageEffect } from "./effects.ts";
import type { JellySpot } from "./jellies.ts";
import type { StageMove, StagePoint, StageStack } from "./types.ts";
import type { RoomSize } from "./world.ts";
import type { Placement } from "./zones.ts";

import { createBeams, updateBeams, type StageBeams } from "./beams.ts";
import { createChoiceRings, updateChoiceRings, type ChoiceRings } from "./choiceRings.ts";
import { createHoverRing, updateHoverRing, type HoverRing } from "./hoverRing.ts";
import { createPointer, updatePointer, type StagePointer } from "./pointer.ts";

/** Everything that marks jellies and places in the room. */
export interface RoomMarks {
  beams: StageBeams;
  choiceRings: ChoiceRings;
  goalPointer: StagePointer;
  hoverRing: HoverRing;
}

/** What {@link updateRoomMarks} needs for a frame. */
export interface RoomMarksFrame {
  /** Where the jellies are in this frame. */
  spots: JellySpot[];
  effects: StageEffect[];
  /** The newest move of each jelly, by player ID. */
  moves: Map<number, StageMove>;
  /** The running stacks, as fresh as the last `stack.changed`. */
  stacks: StageStack[];
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
    goalPointer: createPointer(),
    hoverRing: createHoverRing(),
  };
  scene.add(marks.beams.root, marks.choiceRings.root, marks.goalPointer.root, marks.hoverRing.mesh);
  return marks;
}

/** Moves the light on highlighted jellies, the rings of choice and the pointer at the own goal. */
export function updateRoomMarks(marks: RoomMarks, frame: RoomMarksFrame): void {
  const { spots, effects, platforms, seconds, now, reducedMotion } = frame;
  updateBeams(marks.beams, { spots, effects, platforms, now });
  updateChoiceRings(marks.choiceRings, { spots, lit: frame.lit, seconds, reducedMotion });
  const spot = spots.find((candidate) => candidate.player.id === frame.hoveredId);
  updateHoverRing(marks.hoverRing, { spot, seconds, reducedMotion });
  const own = spots.find((candidate) => candidate.player.id === frame.ownId)?.player;
  updatePointer(marks.goalPointer, {
    destination: own ? frame.destination : null,
    move: own && frame.moves.get(own.id),
    color: own?.color ?? "",
    platforms,
    room: frame.room,
    serverTime: frame.serverTime,
    seconds,
    reducedMotion,
  });
}
