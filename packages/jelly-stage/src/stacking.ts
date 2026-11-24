/**
 * Jellies stacked to towers, as pure state stepped once per frame: how high each one sits, how it
 * jumps on and off, squashes under the weight, sways with the tower and tumbles off when the tower
 * falls apart. `jellies.ts` applies the poses. Heights count from the floor under a jelly, in scene
 * units, and scale with the jelly height given to {@link createStacking}.
 *
 * @module
 */

import type { StageMove, StageStack } from "./types.ts";
import type { FloorPoint } from "./world.ts";

import { createFling, poseFling, type Fling } from "./fling.ts";
import {
  findWeightSquash,
  kick,
  LAUNCH_GAP,
  measureJump,
  stepLeaper,
  type Leaper,
} from "./leaping.ts";
import { calculateRandomValue } from "./random.ts";
import {
  createTower,
  findTowerBase,
  findWaveSquash,
  measureTower,
  stepTowerSway,
  swayMember,
  type Tower,
} from "./towers.ts";
import { findArrival } from "./walking.ts";

/** One jelly sits this many jelly heights over the one below: on its head, faces stay free. */
export const STACK_STEP = 0.92;
/** Squash stays within this, negative is stretched. */
const SQUASH_RANGE = { min: -0.3, max: 0.42 } as const;
/** A longer pause than this, like a hidden tab, jumps straight to rest. */
const SNAP_SECONDS = 0.25;
/** With reduced motion a jelly glides to its seat this fast per second. */
const GLIDE_RATE = 10;
/** A falling tower throws its jellies up and out, in jelly heights (per second), plus a random share. */
const TUMBLE = { kick: 2.6, kickSpread: 1.6, reach: 0.75, reachSpread: 0.6 } as const;
/** Climbing down is a small hop that clears the tower. */
const HOP = { kick: 2.2, reach: 0.8 } as const;
const SEEDS = { kick: 71, reach: 72, spin: 73, angle: 74 } as const;
/** The shadow of a jelly fades out this many jelly heights over the floor. */
const SHADOW_FADE = 0.8;
/** The shadow of a tower grows with every jelly on it, up to this many. */
const TOWER_SHADOW = 0.08;
const TOWER_SHADOW_LEVELS = 6;
const FULL_TURN = 2 * Math.PI;
const MS = 1000;
/** Below these a jelly counts as at rest on the floor and stops being tracked. */
const REST = { height: 0.001, squash: 0.002, speed: 0.01 } as const;

/** The time of a frame, shared by all towers and jellies. */
export interface StackClock {
  /** Local time in seconds, for the animations. */
  time: number;
  /** Server time in milliseconds, as `ends_at` and the moves count. */
  serverTime: number;
  /** Seconds since the last frame. */
  seconds: number;
  reducedMotion: boolean;
}

/** How a jelly stands in this frame because of stacking. */
export interface PerchPose {
  /** Height of the feet over the floor. */
  rise: number;
  /** Where a throw carries the jelly beyond its move. */
  offsetX: number;
  offsetZ: number;
  /** How far the swaying tower bends the jelly sideways. Its shadow stays under the tower. */
  swayX: number;
  swayZ: number;
  /** Lean of the top of the jelly toward +x and +z, in radians. */
  leanX: number;
  leanZ: number;
  /** Extra turn around the vertical axis and a somersault forward, in radians. */
  spin: number;
  flip: number;
  /** Height of the jelly relative to its rest shape, below 1 when squashed. */
  stretch: number;
  /** Size of its shadow relative to a jelly on the floor. */
  shadow: number;
  /** Which level of a standing tower it sits on, 0 at the bottom. Undefined outside a tower. */
  tier: number | undefined;
}

/** What stacking remembers about one jelly between frames. */
interface Perch extends Leaper {
  /** In a tower and arrived on its level, not on the way there. */
  seated: boolean;
  /** The ID of the last tower it sat in, kept until it has climbed down. */
  towerId: number | null;
  fling: Fling | null;
  /** Created in this frame: a jelly already sitting on a tower appears there without a jump. */
  isNew: boolean;
  pose: PerchPose;
}

/** The pose of a jelly that has nothing to do with a tower. */
export const STANDING: Readonly<PerchPose> = {
  rise: 0,
  offsetX: 0,
  offsetZ: 0,
  swayX: 0,
  swayZ: 0,
  leanX: 0,
  leanZ: 0,
  spin: 0,
  flip: 0,
  stretch: 1,
  shadow: 1,
  tier: undefined,
};

/** All towers and the jellies that take part in one. */
export interface Stacking {
  jellyHeight: number;
  towers: Map<number, Tower>;
  /** Which tower each jelly belongs to in this frame. */
  membership: Map<number, Tower>;
  /** Only jellies on the stage that have to do with a tower have one. */
  perches: Map<number, Perch>;
  clock: StackClock;
}

/** Creates stacking for jellies of this height, without towers. */
export function createStacking(jellyHeight: number): Stacking {
  return {
    jellyHeight,
    towers: new Map(),
    membership: new Map(),
    perches: new Map(),
    clock: { time: 0, serverTime: 0, seconds: 0, reducedMotion: false },
  };
}

/** Returns the perch of a jelly, created when it has none yet. */
function findPerch(stacking: Stacking, playerId: number): Perch {
  let perch = stacking.perches.get(playerId);
  if (!perch) {
    perch = {
      height: 0,
      velocity: 0,
      airborne: false,
      squash: 0,
      squashVelocity: 0,
      level: 0,
      tower: null,
      seated: false,
      towerId: null,
      fling: null,
      isNew: true,
      pose: { ...STANDING },
    };
    stacking.perches.set(playerId, perch);
  }
  return perch;
}

/** Forgets a jelly that left the stage. */
export function forgetPerch(stacking: Stacking, playerId: number): void {
  stacking.perches.delete(playerId);
}

/** Throws a jelly up and out of its tower: far and spinning when it falls apart, else a hop. */
function throwOut(stacking: Stacking, perch: Perch, playerId: number, isTumble: boolean): void {
  const share = (seed: number) => calculateRandomValue(playerId, seed);
  const { jellyHeight } = stacking;
  const turn = share(SEEDS.spin) < 0.5 ? -FULL_TURN : FULL_TURN;
  const tumble = isTumble ? 1 : 0;
  const speed = isTumble ? TUMBLE.kick + TUMBLE.kickSpread * share(SEEDS.kick) : HOP.kick;
  const reach = isTumble ? TUMBLE.reach + TUMBLE.reachSpread * share(SEEDS.reach) : HOP.reach;
  kick(perch, speed, jellyHeight);
  perch.fling = createFling({
    startedAt: stacking.clock.time,
    reach: reach * jellyHeight,
    spin: turn * tumble,
    flip: FULL_TURN * tumble,
    fallbackAngle: share(SEEDS.angle) * FULL_TURN,
  });
}

/** A tower fell apart: its jellies fly off, the bottom one only pops back into shape. */
function breakTower(stacking: Stacking, tower: Tower): void {
  stacking.towers.delete(tower.id);
  const isTower = tower.topLevel > 0 && !stacking.clock.reducedMotion;
  tower.members.forEach((playerId, rank) => {
    const perch = stacking.perches.get(playerId);
    // A jelly that already stands in another tower keeps its place there.
    if (!perch || stacking.membership.has(playerId)) return;
    perch.towerId = null;
    perch.seated = false;
    if (isTower && rank > 0) throwOut(stacking, perch, playerId, true);
  });
}

/** Takes over a listed stack and tells its jellies where they belong. */
function seatTower(stacking: Stacking, stack: StageStack): void {
  let tower = stacking.towers.get(stack.id);
  if (!tower) {
    tower = createTower(stack);
    stacking.towers.set(stack.id, tower);
  }
  Object.assign(tower, { members: stack.member_ids, endsAt: stack.ends_at, seen: true });
  for (const playerId of stack.member_ids) stacking.membership.set(playerId, tower);
}

/**
 * Starts a frame: takes over the running stacks, measures each tower and lets the towers that are
 * gone fall apart. Call it once per frame before {@link stepPerch}.
 */
export function beginStacking(stacking: Stacking, stacks: StageStack[], clock: StackClock): void {
  Object.assign(stacking.clock, clock);
  stacking.membership.clear();
  for (const tower of stacking.towers.values()) tower.seen = false;
  for (const stack of stacks) seatTower(stacking, stack);
  const step = STACK_STEP * stacking.jellyHeight;
  for (const tower of stacking.towers.values()) {
    if (!tower.seen) {
      breakTower(stacking, tower);
      continue;
    }
    measureTower(tower, stacking.perches, step);
    stepTowerSway(tower, stacking.clock, stacking.jellyHeight);
  }
}

/**
 * Returns the level a jelly heads for. On the way to a tower that is 0, until the jelly is so close
 * that a jump lands it on top just when its move arrives.
 */
function chooseLevel(stacking: Stacking, perch: Perch, move: StageMove | undefined): number {
  const { serverTime, reducedMotion } = stacking.clock;
  // The server plans every move a moment ahead. Until it starts, a jelly of the tower keeps its level.
  if (move && perch.tower && serverTime < move.start_at) return perch.level;
  if (!move || move.stack_level === 0) return 0;
  const arrival = findArrival(move);
  if (serverTime >= arrival) return move.stack_level;
  if (reducedMotion) return 0;
  const step = STACK_STEP * stacking.jellyHeight;
  const seat = findTowerBase(perch.tower, move.stack_level, step);
  const jump = measureJump(seat - perch.height, stacking.jellyHeight);
  return (arrival - serverTime) / MS <= jump ? move.stack_level : 0;
}

/** Climbing down from a tower that still stands is a hop out of it. */
function hopOff(stacking: Stacking, perch: Perch, playerId: number): void {
  if (perch.tower) {
    perch.towerId = perch.tower.id;
    return;
  }
  // Until its new move comes, the jelly still stands on its old level.
  if (perch.level > 0 || perch.towerId === null) return;
  const isStanding = stacking.towers.has(perch.towerId);
  perch.towerId = null;
  const isHigh = perch.height > LAUNCH_GAP * stacking.jellyHeight;
  if (isStanding && isHigh && !stacking.clock.reducedMotion) {
    throwOut(stacking, perch, playerId, false);
  }
}

/** Moves the height and shape of a jelly one frame on. */
function movePerchedJelly(stacking: Stacking, perch: Perch, seat: number, isNewSeat: boolean) {
  const { seconds, time, reducedMotion } = stacking.clock;
  const { tower } = perch;
  const load = perch.seated && tower ? findWeightSquash(tower.topLevel - perch.level) : 0;
  if (reducedMotion) {
    perch.height += (seat - perch.height) * (1 - Math.exp(-GLIDE_RATE * seconds));
    Object.assign(perch, {
      velocity: 0,
      airborne: false,
      fling: null,
      squash: 0,
      squashVelocity: 0,
    });
  } else if (seconds > SNAP_SECONDS || perch.isNew) {
    Object.assign(perch, { height: seat, velocity: 0, airborne: false, fling: null });
    Object.assign(perch, { squash: load, squashVelocity: 0 });
  } else {
    const { jellyHeight } = stacking;
    stepLeaper(perch, { seat, load, isNewSeat, jellyHeight, time, seconds });
  }
}

/** Sets the sway, throw, squash and shadow of the pose. */
function posePerch(stacking: Stacking, perch: Perch, position: FloorPoint): void {
  const { pose, tower } = perch;
  const { time, reducedMotion } = stacking.clock;
  const { jellyHeight } = stacking;
  const isStanding = tower !== null && perch.seated && tower.topLevel > 0;
  pose.tier = isStanding ? perch.level : undefined;
  pose.rise = perch.height;
  Object.assign(pose, { swayX: 0, swayZ: 0, leanX: 0, leanZ: 0 });
  if (isStanding && !reducedMotion) swayMember(tower, perch.height, pose, jellyHeight);
  if (!perch.fling || !poseFling(perch.fling, position, time, pose)) {
    perch.fling = null;
    Object.assign(pose, { offsetX: 0, offsetZ: 0, spin: 0, flip: 0 });
  }
  const wave = tower && !reducedMotion ? findWaveSquash(tower, perch.level, time) : 0;
  const squash = Math.min(SQUASH_RANGE.max, Math.max(SQUASH_RANGE.min, perch.squash + wave));
  pose.stretch = 1 - squash;
  const fade = Math.max(0, 1 - perch.height / (SHADOW_FADE * jellyHeight));
  const levels = isStanding && perch.level === 0 ? tower.topLevel : 0;
  pose.shadow = fade * (1 + TOWER_SHADOW * Math.min(TOWER_SHADOW_LEVELS, levels));
}

/** Reports whether a jelly is back on the floor with nothing going on, so it needs no perch. */
function isAtRest(perch: Perch): boolean {
  const isAlone = perch.tower === null && perch.towerId === null && perch.level === 0;
  const isStill = !perch.airborne && perch.fling === null && perch.height < REST.height;
  const isShaped =
    Math.abs(perch.squash) < REST.squash && Math.abs(perch.squashVelocity) < REST.speed;
  return isAlone && isStill && isShaped;
}

/**
 * Moves a jelly one frame on and returns how it stands because of stacking. Returns null for a
 * jelly that has nothing to do with a tower: it simply stands on its floor.
 */
export function stepPerch(
  stacking: Stacking,
  playerId: number,
  move: StageMove | undefined,
  position: FloorPoint,
): PerchPose | null {
  const tower = stacking.membership.get(playerId) ?? null;
  if (!tower && !stacking.perches.has(playerId) && !move?.stack_level) return null;
  const perch = findPerch(stacking, playerId);
  const hasArrived = !move || stacking.clock.serverTime >= findArrival(move);
  const wasTower = perch.tower;
  perch.tower = tower;
  const level = chooseLevel(stacking, perch, move);
  const isNewSeat = level !== perch.level || tower !== wasTower;
  perch.level = level;
  hopOff(stacking, perch, playerId);
  const step = STACK_STEP * stacking.jellyHeight;
  const seat = perch.tower ? findTowerBase(perch.tower, perch.level, step) : perch.level * step;
  // A jelly that appears where it already sits on a tower does not jump there first.
  perch.isNew &&= hasArrived;
  movePerchedJelly(stacking, perch, seat, isNewSeat);
  perch.isNew = false;
  // Bouncing on its seat it still sits there, so its name does not jump around.
  perch.seated = perch.tower !== null && hasArrived;
  posePerch(stacking, perch, position);
  if (isAtRest(perch)) stacking.perches.delete(playerId);
  return perch.pose;
}
