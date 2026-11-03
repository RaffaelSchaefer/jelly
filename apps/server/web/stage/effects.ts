/**
 * Short animations triggered by events: bubbles, floating texts and motions. Lasting changes such
 * as signs or levels come from reloading the state instead.
 *
 * @module
 */

import type { StageCatalog, StageEvent } from "./types.ts";

const BUBBLE_MS = 3000;
const TOAST_MS = 5000;
const XP_TOAST_MS = 1800;
const MOTION_MS = 2400;
/** Events older than this are replays after a lost connection and not worth animating. */
const FRESH_EVENT_MS = 10_000;
/** A flood of events drops the oldest effects instead of slowing the stage down. */
const MAX_EFFECTS = 200;
const FULL_CIRCLE = 2 * Math.PI;
const HOP_HEIGHT = 0.45;
const HOPS_PER_MOTION = 3;
const WIGGLE_ANGLE = 0.3;
const WIGGLES_PER_MOTION = 6;
const SECRET_ACHIEVEMENT_TITLE = "Geheimes Achievement";

const EMOTE_GLYPHS: Record<string, string> = {
  wave: "👋",
  dance: "💃",
  cheer: "🎉",
  laugh: "😂",
  sleep: "💤",
  love: "❤️",
};

const EMOTE_MOTIONS: Record<string, MotionKey> = { dance: "wiggle", cheer: "hop" };

/** Motions that need no extra art. The keys match the partner emotes of the server. */
export type MotionKey = "hop" | "spin" | "wiggle";

/** How a motion changes a jelly at one moment. */
export interface MotionPose {
  /** Lift in jelly heights. */
  lift: number;
  /** Rotation in radians. */
  angle: number;
}

/** A running animation of one jelly. */
export type StageEffect = { playerId: number; startedAt: number; endsAt: number } & (
  | { kind: "bubble"; glyph: string }
  | { kind: "toast"; text: string }
  | { kind: "motion"; motion: MotionKey }
);

/** Reports whether an event happened recently enough to animate. */
export function isFreshEvent(event: StageEvent, serverTime: number): boolean {
  return serverTime - event.created_at <= FRESH_EVENT_MS;
}

/** Translates an event into the effects it triggers. Unknown or lasting events trigger none. */
export function createEffects(
  event: StageEvent,
  catalog: StageCatalog,
  now: number,
): StageEffect[] {
  const playerId = event.player_id;
  if (playerId === null) {
    return [];
  }
  const start = { playerId, startedAt: now };
  const { key, amount, level, title, partner_id: partnerId } = event.payload;
  switch (event.type) {
    case "emote":
      return createEmoteEffects(playerId, key ?? "", now);
    case "partner.emote":
      return createPartnerEffects([playerId, partnerId ?? playerId], key ?? "", now);
    case "xp.gained":
      return [{ ...start, endsAt: now + XP_TOAST_MS, kind: "toast", text: `+${amount} XP` }];
    case "level.up":
      return [{ ...start, endsAt: now + TOAST_MS, kind: "toast", text: `Level ${level}!` }];
    case "achievement.earned":
      return [{ ...start, endsAt: now + TOAST_MS, kind: "toast", text: findTitle(catalog, key) }];
    case "award.given":
      return [{ ...start, endsAt: now + TOAST_MS, kind: "toast", text: title ?? "" }];
    default:
      return [];
  }
}

/** Secret achievements are not in the catalog, the stage only says that one was found. */
function findTitle(catalog: StageCatalog, key: string | undefined): string {
  const achievement = catalog.achievements.find((entry) => entry.key === key);
  return achievement?.title ?? SECRET_ACHIEVEMENT_TITLE;
}

/** An emote shows a bubble, and some emotes also move the jelly. */
function createEmoteEffects(playerId: number, key: string, now: number): StageEffect[] {
  const glyph = EMOTE_GLYPHS[key];
  if (!glyph) {
    return [];
  }
  const start = { playerId, startedAt: now };
  const bubble: StageEffect = { ...start, endsAt: now + BUBBLE_MS, kind: "bubble", glyph };
  const motion = EMOTE_MOTIONS[key];
  if (!motion) {
    return [bubble];
  }
  return [bubble, { ...start, endsAt: now + MOTION_MS, kind: "motion", motion }];
}

/** Both partners do the same motion at the same time. */
function createPartnerEffects(playerIds: number[], key: string, now: number): StageEffect[] {
  if (key !== "hop" && key !== "spin" && key !== "wiggle") {
    return [];
  }
  return playerIds.map((playerId) => ({
    playerId,
    startedAt: now,
    endsAt: now + MOTION_MS,
    kind: "motion",
    motion: key,
  }));
}

/** Adds new effects, drops finished ones and keeps the list bounded. */
export function updateEffects(
  effects: StageEffect[],
  added: StageEffect[],
  now: number,
): StageEffect[] {
  return [...effects, ...added].filter((effect) => effect.endsAt > now).slice(-MAX_EFFECTS);
}

/** Calculates a motion at `progress` from 0 to 1. It starts and ends in the resting pose. */
export function calculateMotionPose(motion: MotionKey, progress: number): MotionPose {
  switch (motion) {
    case "hop":
      return {
        lift: HOP_HEIGHT * Math.abs(Math.sin(progress * Math.PI * HOPS_PER_MOTION)),
        angle: 0,
      };
    case "spin":
      return { lift: 0, angle: progress * FULL_CIRCLE };
    case "wiggle":
      return {
        lift: 0,
        angle: WIGGLE_ANGLE * Math.sin(progress * Math.PI * WIGGLES_PER_MOTION),
      };
  }
}
