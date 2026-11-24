/**
 * Keeps the running stacks up to date between two reads of the state. A `stack.changed` carries the
 * whole stack, so a tower grows and falls on screen without waiting for the next read.
 *
 * @module
 */

import type { EventPayload, StageStack } from "./types.ts";

/** The event of a stack that changed or fell apart. */
export const STACK_CHANGED = "stack.changed";

/**
 * Returns the stacks after a `stack.changed`. The changed stack replaces its older self. A payload
 * with only an ID means the stack fell apart, so it goes away.
 */
export function applyStackChange(stacks: StageStack[], payload: EventPayload): StageStack[] {
  const { id, x, y, ends_at, member_ids } = payload;
  const others = stacks.filter((stack) => stack.id !== id);
  if (id === undefined || x === undefined || y === undefined || !ends_at || !member_ids) {
    return others;
  }
  return [...others, { id, x, y, ends_at, member_ids }];
}
