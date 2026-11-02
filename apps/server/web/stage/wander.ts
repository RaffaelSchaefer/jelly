/**
 * Where a jelly stands at a given server time. Everything is a pure function of player ID and time,
 * so all screens show the same path without the server storing positions.
 *
 * @module
 */

import type { StageArea, StagePlayer, StagePoint } from "./types.ts";

const STAGE_SIZE = 100;
/** Same share as `homeMarginPercent` in `internal/rules/areas.go`, so jellies stay in their area. */
const WANDER_SHARE = 0.1;
const SLOW_WEIGHT = 0.6;
const FAST_WEIGHT = 0.4;
const SLOW_PERIOD_MS = { shortest: 40_000, longest: 90_000 };
const FAST_PERIOD_MS = { shortest: 15_000, longest: 30_000 };
const FOLLOW_GAP_PERCENT = 5;
const FULL_CIRCLE = 2 * Math.PI;
const WHOLE_STAGE: StageArea = { id: 0, x: 0, y: 0, width: STAGE_SIZE, height: STAGE_SIZE };

/** Independent random values of one jelly, one per use. */
const SEED_SLOW_PERIOD = 1;
const SEED_FAST_PERIOD = 2;
const SEED_SLOW_PHASE = 3;
const SEED_FAST_PHASE = 4;
/** The second axis uses other random values, otherwise jellies would walk diagonally. */
const SEEDS_PER_AXIS = 10;

/** Large odd numbers that spread neighboring IDs over the whole 32-bit range. */
const HASH_FACTOR_ID = 0x9e3779b1;
const HASH_FACTOR_SEED = 0x85ebca6b;
const HASH_FACTOR_MIX = 0xc2b2ae35;
const HASH_SHIFT = 13;
const HASH_RANGE = 2 ** 32;

/** Returns a stable value from 0 to below 1 for a player and a seed. */
export function calculateRandomValue(playerId: number, seed: number): number {
  let hash = Math.imul(playerId, HASH_FACTOR_ID) ^ Math.imul(seed, HASH_FACTOR_SEED);
  hash = Math.imul(hash ^ (hash >>> HASH_SHIFT), HASH_FACTOR_MIX);
  return ((hash ^ (hash >>> HASH_SHIFT)) >>> 0) / HASH_RANGE;
}

/** Returns a value from -1 to 1 that drifts over time, from two overlapping waves. */
function calculateDrift(playerId: number, seedOffset: number, serverTime: number): number {
  const random = (seed: number) => calculateRandomValue(playerId, seedOffset + seed);
  const wave = (periods: typeof SLOW_PERIOD_MS, periodSeed: number, phaseSeed: number) => {
    const period = periods.shortest + random(periodSeed) * (periods.longest - periods.shortest);
    return Math.sin((serverTime / period + random(phaseSeed)) * FULL_CIRCLE);
  };
  return (
    SLOW_WEIGHT * wave(SLOW_PERIOD_MS, SEED_SLOW_PERIOD, SEED_SLOW_PHASE) +
    FAST_WEIGHT * wave(FAST_PERIOD_MS, SEED_FAST_PERIOD, SEED_FAST_PHASE)
  );
}

/** Returns where a jelly wanders by itself, around its home spot. */
export function calculateWanderPoint(
  player: StagePlayer,
  area: StageArea | undefined,
  serverTime: number,
): StagePoint {
  const bounds = area ?? WHOLE_STAGE;
  return {
    x: player.home_x + bounds.width * WANDER_SHARE * calculateDrift(player.id, 0, serverTime),
    y:
      player.home_y +
      bounds.height * WANDER_SHARE * calculateDrift(player.id, SEEDS_PER_AXIS, serverTime),
  };
}

/** Returns the point beside the followed jelly. The ID decides the side, so screens agree. */
export function calculateFollowPoint(playerId: number, target: StagePoint): StagePoint {
  const side = playerId % 2 === 0 ? -1 : 1;
  const followX = target.x + side * FOLLOW_GAP_PERCENT;
  return { x: Math.min(STAGE_SIZE, Math.max(0, followX)), y: target.y };
}

/** The current jellies and areas by ID. */
export interface StageLookup {
  players: Map<number, StagePlayer>;
  areas: Map<number, StageArea>;
}

/**
 * Returns where a jelly stands. A followed jelly counts with its own wandering, not its own
 * following, so two jellies following each other cannot loop.
 */
export function calculateStagePoint(
  player: StagePlayer,
  lookup: StageLookup,
  serverTime: number,
): StagePoint {
  const wander = (subject: StagePlayer) =>
    calculateWanderPoint(subject, lookup.areas.get(subject.area_id ?? 0), serverTime);
  const target = lookup.players.get(player.follow_player_id ?? 0);
  if (target) {
    return calculateFollowPoint(player.id, wander(target));
  }
  return wander(player);
}
