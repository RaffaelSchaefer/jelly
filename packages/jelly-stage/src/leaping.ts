/**
 * How a jelly of a tower moves up and down: it jumps onto its seat in an arc, falls when the seat
 * drops away, bounces when it lands hard and squashes like jelly. Pure physics, stepped by
 * `stacking.ts`. Heights in scene units, speeds counted in jelly heights.
 *
 * @module
 */

import { startWave, type Tower } from "./towers.ts";

/** Falling speed gained per second, in jelly heights. */
const GRAVITY = 13;
/** A jump onto a tower peaks this far above its seat, in jelly heights. */
const JUMP_APEX = 0.3;
/** A new seat this far above the feet is a jump, one this far below a fall, in jelly heights. */
export const LAUNCH_GAP = 0.25;
const DROP_GAP = 0.1;
/** Faster than this, in jelly heights per second, a landing bounces back with this share of it. */
const BOUNCE_SPEED = 1.2;
const BOUNCE_KEEP = 0.35;
/** How much a landing at one jelly height per second squashes the jelly that lands. */
const IMPACT_SQUASH = 0.8;
/** The spring that pulls the shape of a jelly back: stiffness and damping per second. */
const SQUASH_SPRING = { stiffness: 300, damping: 9 } as const;
/** A jelly under weight squashes toward this much, the sooner the more jellies stand on it. */
const WEIGHT_SQUASH = 0.2;
const WEIGHT_SCALE = 3;
/** Physics steps at most this long. */
const SUBSTEP_SECONDS = 1 / 120;

/** The moving part of a jelly in a tower. */
export interface Leaper {
  /** Height of the feet over the floor. */
  height: number;
  velocity: number;
  airborne: boolean;
  /** 0 at rest, positive when squashed. */
  squash: number;
  squashVelocity: number;
  /** The level it heads for, where a hard landing starts the wave down the tower. */
  level: number;
  tower: Tower | null;
}

/** Where a jelly is heading in a frame and how long the frame is. */
export interface LeapStep {
  /** Height of the feet on the seat. */
  seat: number;
  /** The squash its load wants. */
  load: number;
  /**
   * The jelly heads for another level than in the last frame. Only then it may jump or fall: on its
   * own seat it rides along with the squash and wave below, even a tall tower's, which a fall would
   * answer with a landing, a new wave and the next fall.
   */
  isNewSeat: boolean;
  jellyHeight: number;
  /** Local time in seconds, for the wave of a landing. */
  time: number;
  seconds: number;
}

/** Returns how long a jump to a seat `rise` above the feet takes, in seconds. */
export function measureJump(rise: number, jellyHeight: number): number {
  const gravity = GRAVITY * jellyHeight;
  const apex = JUMP_APEX * jellyHeight;
  return Math.sqrt((2 * (Math.max(0, rise) + apex)) / gravity) + Math.sqrt((2 * apex) / gravity);
}

/** Returns how much a jelly squashes under `above` jellies standing on it. */
export function findWeightSquash(above: number): number {
  return above > 0 ? WEIGHT_SQUASH * (1 - Math.exp(-above / WEIGHT_SCALE)) : 0;
}

/** Throws a jelly up so it lands on a seat `rise` above its feet. */
function launch(leaper: Leaper, rise: number, jellyHeight: number): void {
  leaper.airborne = true;
  leaper.velocity = Math.sqrt(2 * GRAVITY * jellyHeight * (rise + JUMP_APEX * jellyHeight));
}

/** A jelly comes down on its seat: it squashes, bounces if it was fast and shakes the tower. */
function land(leaper: Leaper, { seat, jellyHeight, time }: LeapStep): void {
  const speed = -leaper.velocity / jellyHeight;
  leaper.height = seat;
  leaper.squashVelocity += IMPACT_SQUASH * speed;
  if (leaper.tower && seat > 0) startWave(leaper.tower, leaper.level, speed, time);
  leaper.airborne = speed > BOUNCE_SPEED;
  leaper.velocity = leaper.airborne ? speed * BOUNCE_KEEP * jellyHeight : 0;
}

/** Moves a jelly through the air for a short step, or keeps it on its seat. */
function stepHeight(leaper: Leaper, leap: LeapStep, seconds: number): void {
  const { seat, jellyHeight, isNewSeat } = leap;
  if (!leaper.airborne) {
    const gap = (seat - leaper.height) / jellyHeight;
    if (isNewSeat && gap > LAUNCH_GAP) launch(leaper, seat - leaper.height, jellyHeight);
    else if (isNewSeat && gap < -DROP_GAP) leaper.airborne = true;
    else leaper.height = seat;
    if (!leaper.airborne) return;
  }
  leaper.velocity -= GRAVITY * jellyHeight * seconds;
  leaper.height += leaper.velocity * seconds;
  if (leaper.velocity > 0 || leaper.height > seat) return;
  // It fell short of a seat that rose meanwhile: it jumps again instead of popping up.
  if (seat - leaper.height > LAUNCH_GAP * jellyHeight)
    launch(leaper, seat - leaper.height, jellyHeight);
  else land(leaper, leap);
}

/** Pulls the shape of a jelly toward the squash its load wants, for a short step. */
function stepSquash(leaper: Leaper, load: number, seconds: number): void {
  const { stiffness, damping } = SQUASH_SPRING;
  const pull = stiffness * (load - leaper.squash) - damping * leaper.squashVelocity;
  leaper.squashVelocity += pull * seconds;
  leaper.squash += leaper.squashVelocity * seconds;
}

/** Throws a jelly straight up at `speed` jelly heights per second. */
export function kick(leaper: Leaper, speed: number, jellyHeight: number): void {
  leaper.velocity = speed * jellyHeight;
  leaper.airborne = true;
}

/** Steps a jelly through a frame in short substeps. */
export function stepLeaper(leaper: Leaper, leap: LeapStep): void {
  const steps = Math.ceil(leap.seconds / SUBSTEP_SECONDS);
  const seconds = leap.seconds / steps;
  for (let step = 0; step < steps; step++) {
    stepHeight(leaper, leap, seconds);
    stepSquash(leaper, leap.load, seconds);
  }
}
