/**
 * Stable random values for looks that differ from jelly to jelly, the same on every screen.
 *
 * @module
 */

/** Large odd numbers that spread neighboring IDs over the whole 32-bit range. */
const HASH_FACTOR_ID = 0x9e3779b1;
const HASH_FACTOR_SEED = 0x85ebca6b;
const HASH_FACTOR_MIX = 0xc2b2ae35;
const HASH_SHIFT = 13;
const HASH_RANGE = 2 ** 32;

/** Returns a stable value from 0 to below 1 for a number and a seed. */
export function calculateRandomValue(playerId: number, seed: number): number {
  let hash = Math.imul(playerId, HASH_FACTOR_ID) ^ Math.imul(seed, HASH_FACTOR_SEED);
  hash = Math.imul(hash ^ (hash >>> HASH_SHIFT), HASH_FACTOR_MIX);
  return ((hash ^ (hash >>> HASH_SHIFT)) >>> 0) / HASH_RANGE;
}
