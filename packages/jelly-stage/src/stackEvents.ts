/**
 * Keeps the running stacks up to date between two reads of the state, so a tower grows and falls on
 * screen without waiting for the next read.
 *
 * @module
 */

import type { StageEvent, StageStack } from "./types.ts";

/** The event of a stack that changed or fell apart. */
export const STACK_CHANGED = "stack.changed";

/**
 * Returns the stacks after a `stack.changed`. When a jelly climbs on, the event carries the whole
 * stack, which replaces its older self. Otherwise it carries only the ID: with a player, that jelly
 * climbed down and the rest stands on. Without one, the time of the stack is over and it is gone.
 */
export function applyStackChange(stacks: StageStack[], event: StageEvent): StageStack[] {
  const { id, x, y, ends_at, member_ids } = event.payload;
  const others = stacks.filter((stack) => stack.id !== id);
  if (id !== undefined && x !== undefined && y !== undefined && ends_at && member_ids) {
    return [...others, { id, x, y, ends_at, member_ids }];
  }
  const known = stacks.find((stack) => stack.id === id);
  const left = known?.member_ids.filter((memberId) => memberId !== event.player_id) ?? [];
  // The server names no player with 0 or null.
  if (!known || !event.player_id || left.length === 0) {
    return others;
  }
  return [...others, { ...known, member_ids: left }];
}
