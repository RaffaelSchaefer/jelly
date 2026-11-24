/**
 * The math behind the marks of a stack, without three: how much of its time is left and how urgent
 * that is, how the ring around it comes and goes, and where the lighthouse on its top shines.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { StageStack } from "./types.ts";
import type { FloorPoint, FloorRect } from "./world.ts";

import { FULL_CIRCLE } from "./world.ts";

/** In its last seconds a stack is about to fall: its ring pulses while the tower shakes. */
export const URGENT_SECONDS = 10;
/** How fast a ring comes and goes, per second. */
const GROW_RATE = 6;
/** Below this a ring is gone and forgotten. */
const GONE = 0.01;
/** The pulse of an urgent ring, per second: slow at first, fast in the very end. */
const PULSE_RATE = { calm: 1.2, hectic: 4 };
/** A growing ring starts at this size and bulges a bit on its way, a falling one grows while it fades. */
const RING_SCALE = { start: 0.55, bulge: 0.15, burst: 0.3 };
/** Seconds for one turn of a lighthouse. */
const TURN_SECONDS = 4;
/**
 * How far the middle of a light patch stays inside the walls, about the half length of its bright
 * spot in `lighthouse.ts`, and how short its way can become.
 */
const WALL_MARGIN = 2.5;
const SHORTEST_REACH = 2;

/** What the ring of one stack remembers between frames. */
export interface StackClock {
  /** The stack as last seen. */
  stack: StageStack;
  /** The longest remaining time seen in milliseconds, taken as the whole life of the stack. */
  total: number;
  /** Share of the time left, from 1 to 0. It stays where it was once the stack is over. */
  share: number;
  /** 0 until the last seconds, then rising to 1 at the end. */
  urgency: number;
  /** Turns of the urgent pulse so far. */
  pulsePhase: number;
  /** 0 is gone, 1 is fully there. */
  presence: number;
  isOver: boolean;
}

/** What {@link stepStackClocks} needs for a frame. */
export interface StackClockFrame {
  stacks: StageStack[];
  /** Server time in milliseconds, as `ends_at` counts. */
  serverTime: number;
  seconds: number;
  reducedMotion: boolean;
}

/** A highlight on the top of a stack of at least two jellies. */
export type Lighthouse = Extract<StageEffect, { kind: "spotlight" }>;

/** Returns how urgent a stack is with `remaining` milliseconds left, from 0 to 1. */
export function calculateUrgency(remaining: number): number {
  return Math.min(1, Math.max(0, 1 - remaining / (URGENT_SECONDS * 1000)));
}

/** Returns how bright the pulse of a ring is right now, from 0 to 1. Calm rings do not pulse. */
export function calculatePulse(clock: StackClock): number {
  if (clock.urgency === 0) return 0;
  return 0.5 - 0.5 * Math.cos(clock.pulsePhase * FULL_CIRCLE);
}

/** Starts to remember a stack that runs. */
function createClock(stack: StageStack): StackClock {
  return {
    stack,
    total: 0,
    share: 1,
    urgency: 0,
    pulsePhase: 0,
    presence: 0,
    isOver: false,
  };
}

/** Updates the clock of a stack that still runs. */
function tickClock(clock: StackClock, stack: StageStack, remaining: number): void {
  // ponytail: the stage state does not carry `stack_seconds`, so the longest remaining time seen
  // stands in for the whole life. Ceiling: a page opened mid-stack shows a full ring at first.
  clock.total = Math.max(clock.total, remaining);
  clock.stack = stack;
  clock.share = remaining / clock.total;
  clock.urgency = calculateUrgency(remaining);
}

/**
 * Brings the clocks of all stacks one frame on. A stack that ends, by time or because it fell apart,
 * keeps its clock until its ring has faded, then it is forgotten.
 */
export function stepStackClocks(clocks: Map<number, StackClock>, frame: StackClockFrame): void {
  const running = new Set<number>();
  for (const stack of frame.stacks) {
    const remaining = stack.ends_at - frame.serverTime;
    if (remaining <= 0) continue;
    running.add(stack.id);
    const clock = clocks.get(stack.id) ?? createClock(stack);
    tickClock(clock, stack, remaining);
    clocks.set(stack.id, clock);
  }
  const step = frame.reducedMotion ? 1 : 1 - Math.exp(-GROW_RATE * frame.seconds);
  for (const [id, clock] of clocks) {
    clock.isOver = !running.has(id);
    clock.presence += ((clock.isOver ? 0 : 1) - clock.presence) * step;
    if (!frame.reducedMotion) {
      const rate = PULSE_RATE.calm + (PULSE_RATE.hectic - PULSE_RATE.calm) * clock.urgency;
      clock.pulsePhase += clock.urgency > 0 ? rate * frame.seconds : 0;
    }
    if (clock.isOver && clock.presence < GONE) clocks.delete(id);
  }
}

/** Returns the size of a ring: it pops up with a little bulge and bursts outward when its stack ends. */
export function calculateRingScale(clock: Pick<StackClock, "presence" | "isOver">): number {
  const { presence } = clock;
  if (clock.isOver) return 1 + RING_SCALE.burst * (1 - presence);
  return (
    RING_SCALE.start +
    (1 - RING_SCALE.start) * presence +
    RING_SCALE.bulge * Math.sin(Math.PI * presence)
  );
}

/** Lists the highlights that shine on the top of a stack of at least two jellies. */
export function findLighthouses(effects: StageEffect[], stacks: StageStack[]): Lighthouse[] {
  const tops = new Set(
    stacks.filter((stack) => stack.member_ids.length >= 2).map((stack) => stack.member_ids.at(-1)),
  );
  return effects.filter(
    (effect): effect is Lighthouse => effect.kind === "spotlight" && tops.has(effect.playerId),
  );
}

/**
 * Returns where a lighthouse points at local time `now`, in radians around the vertical axis. Every
 * light starts where its highlight began, so the angle needs no memory.
 */
export function calculateSweepAngle(light: Lighthouse, now: number): number {
  return ((now - light.startedAt) / 1000 / TURN_SECONDS) * FULL_CIRCLE;
}

/** Returns the direction of a sweep angle on the floor, x and z. */
export function toSweepDirection(angle: number): FloorPoint {
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/** Returns how far `from` lies from the edge of `rect` along `direction`, Infinity without an edge. */
function measureToEdge(from: number, direction: number, low: number, high: number): number {
  if (direction > 0) return (high - from) / direction;
  if (direction < 0) return (low - from) / direction;
  return Infinity;
}

/**
 * Returns how far the light of a lighthouse at `from` falls along `angle`: `longest` in the open,
 * shorter in front of a wall, so its patch stays on the floor of the hall.
 */
export function measureReach(
  from: FloorPoint,
  angle: number,
  rect: FloorRect,
  longest: number,
): number {
  const direction = toSweepDirection(angle);
  const toWallX = measureToEdge(from.x, direction.x, rect.minX, rect.maxX);
  const toWallZ = measureToEdge(from.z, direction.z, rect.minZ, rect.maxZ);
  const inside = Math.min(toWallX, toWallZ) - WALL_MARGIN;
  return Math.max(SHORTEST_REACH, Math.min(longest, inside));
}
