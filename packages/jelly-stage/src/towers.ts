/**
 * The towers of stacked jellies: where each level sits, how a tower sways and gets nervous before it
 * ends, and the squash wave a landing sends down through it. Pure state, stepped by `stacking.ts`.
 *
 * @module
 */

import type { StageStack } from "./types.ts";

import { URGENT_SECONDS } from "./stackMarks.ts";

/** How far the top of a tower sways per level, in jelly heights. */
const SWAY_PER_LEVEL = 0.045;
/** Sway of a short tower in radians per second. Taller towers sway slower, like a longer pendulum. */
const SWAY_RATE = 3.4;
const SWAY_SLOWING = 0.35;
/** The sway follows a growing tower this fast per second. */
const SWAY_EASE = 1.5;
/** Toward and away from the camera a tower sways less, and at its own rate. */
const SWAY_DEPTH = 0.45;
const SWAY_DEPTH_RATE = 0.73;
const SWAY_DEPTH_PHASE = 1.3;
/** A bent tower leans each jelly a bit more than the bend alone, so the sway reads from afar. */
const LEAN_GAIN = 1.5;
/** In its last seconds a tower gets nervous, while its ring pulses: it sways wider and faster, and it trembles. */
const NERVE_MS = URGENT_SECONDS * 1000;
const NERVE_SWAY = 1.6;
const NERVE_RATE = 2.5;
const NERVE_TREMBLE = 0.05;
const TREMBLE_RATE = 4.3;
/**
 * The squash wave of a landing: depth, rate and fading per second, delay per level downward and
 * how many seconds after reaching a level it has faded away there.
 */
const WAVE = { squash: 0.22, rate: 17, damping: 4.5, delay: 0.07, until: 1.5 } as const;
/** Landings slower than this, in jelly heights per second, do not shake the tower. */
const WAVE_SPEED = 0.8;
/** A landing at this speed and above shakes the tower fully. */
const WAVE_FULL_SPEED = 3;

/** A running stack as the stage remembers it between frames. */
export interface Tower {
  id: number;
  /** From bottom to top, as the stack lists them. */
  members: number[];
  endsAt: number;
  /** Still listed in this frame. */
  seen: boolean;
  /** Height of the feet at each level over the floor of the tower. */
  bases: number[];
  /** Height of the jelly at each level, below 1 when squashed. Scratch space of {@link measureTower}. */
  stretches: number[];
  /** The highest level a jelly sits on. 0 is a single jelly, not yet a tower. */
  topLevel: number;
  /** Progress of the sway in radians, summed up so its rate can change smoothly. */
  phase: number;
  /** How far the top sways right now. */
  sway: number;
  /** 0 while there is time, 1 when the tower is about to fall. */
  nerve: number;
  /** The last landing on the tower: when, on which level and how hard, 0 to 1. */
  wave: { at: number; level: number; strength: number };
}

/** What a tower reads from one of its jellies. */
export interface TowerSeat {
  /** Sits on its level, not on the way there and not in the air. */
  seated: boolean;
  level: number;
  pose: { stretch: number };
}

/** The sway part of a pose. */
export interface SwayPose {
  swayX: number;
  swayZ: number;
  leanX: number;
  leanZ: number;
}

/** What the sway needs from a frame. */
export interface SwayClock {
  serverTime: number;
  seconds: number;
  reducedMotion: boolean;
}

/** Creates a tower for a stack seen for the first time. */
export function createTower(stack: StageStack): Tower {
  return {
    id: stack.id,
    members: stack.member_ids,
    endsAt: stack.ends_at,
    seen: true,
    bases: [0],
    stretches: [],
    topLevel: 0,
    phase: 0,
    sway: 0,
    nerve: 0,
    wave: { at: 0, level: 0, strength: 0 },
  };
}

/**
 * Finds the highest seated level and where each level sits: on the squashed jellies below it, as
 * they were in the last frame. Levels nobody sits on yet count as unsquashed.
 */
export function measureTower(
  tower: Tower,
  seats: ReadonlyMap<number, TowerSeat>,
  step: number,
): void {
  const { members, stretches, bases } = tower;
  stretches.length = members.length;
  stretches.fill(1);
  let topLevel = 0;
  for (const playerId of members) {
    const seat = seats.get(playerId);
    if (!seat?.seated || seat.level >= members.length) continue;
    stretches[seat.level] = seat.pose.stretch;
    topLevel = Math.max(topLevel, seat.level);
  }
  tower.topLevel = topLevel;
  bases.length = members.length + 1;
  bases[0] = 0;
  stretches.forEach((stretch, level) => {
    bases[level + 1] = (bases[level] ?? 0) + step * stretch;
  });
}

/** Returns how high the feet of a jelly on `level` sit. Without a tower every step is unsquashed. */
export function findTowerBase(tower: Tower | null, level: number, step: number): number {
  const known = tower ? Math.min(level, tower.bases.length - 1) : 0;
  const base = tower?.bases[known] ?? 0;
  return base + (level - known) * step;
}

/** Moves the sway of a tower one frame on. It grows with the tower and with its nerves. */
export function stepTowerSway(tower: Tower, clock: SwayClock, jellyHeight: number): void {
  const left = (tower.endsAt - clock.serverTime) / NERVE_MS;
  tower.nerve = Math.min(1, Math.max(0, 1 - left));
  if (clock.reducedMotion) {
    tower.sway = 0;
    return;
  }
  const slowing = Math.sqrt(1 + SWAY_SLOWING * tower.topLevel);
  tower.phase += ((SWAY_RATE * (1 + NERVE_RATE * tower.nerve)) / slowing) * clock.seconds;
  const wanted = SWAY_PER_LEVEL * jellyHeight * tower.topLevel * (1 + NERVE_SWAY * tower.nerve);
  tower.sway += (wanted - tower.sway) * (1 - Math.exp(-SWAY_EASE * clock.seconds));
}

/**
 * Bends a jelly whose feet stand `height` over the tower floor: the tower sways like a rod fixed at
 * the bottom, so higher jellies move further and lean along the bend.
 */
export function swayMember(tower: Tower, height: number, pose: SwayPose, jellyHeight: number) {
  const top = (tower.bases[tower.topLevel] ?? 0) + jellyHeight;
  const share = Math.max(0, height) / top;
  const swing = Math.sin(tower.phase);
  const depthSwing = Math.sin(tower.phase * SWAY_DEPTH_RATE + SWAY_DEPTH_PHASE);
  const tremble = NERVE_TREMBLE * jellyHeight * tower.nerve * Math.sin(tower.phase * TREMBLE_RATE);
  const bend = tower.sway * share * share;
  pose.swayX = bend * swing + tremble * share;
  pose.swayZ = bend * SWAY_DEPTH * depthSwing;
  // The slope of the bend, as an angle: twice the bend per height.
  const slope = (LEAN_GAIN * 2 * tower.sway * share) / top;
  pose.leanX = slope * swing;
  pose.leanZ = slope * SWAY_DEPTH * depthSwing;
}

/** A jelly landed on `level` at `speed` jelly heights per second: the tower squashes from the top. */
export function startWave(tower: Tower, level: number, speed: number, time: number): void {
  if (speed < WAVE_SPEED) return;
  tower.wave = { at: time, level, strength: Math.min(1, speed / WAVE_FULL_SPEED) };
}

/** Returns how much the landing wave squashes the jelly on `level` right now, 0 when it is past. */
export function findWaveSquash(tower: Tower, level: number, time: number): number {
  const { wave } = tower;
  if (level >= wave.level) return 0;
  const since = time - wave.at - (wave.level - 1 - level) * WAVE.delay;
  if (since <= 0 || since > WAVE.until) return 0;
  const fading = Math.exp(-WAVE.damping * since);
  return wave.strength * WAVE.squash * fading * Math.sin(WAVE.rate * since);
}
