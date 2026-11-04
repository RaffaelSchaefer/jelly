/**
 * Short animations triggered by events: bubbles, floating texts and motions. Lasting changes such
 * as signs or levels come from reloading the state instead.
 *
 * @module
 */

import {
  EMOTE_GLYPHS,
  EMOTE_SECONDS,
  isEmoteKey,
  type EmoteFrame,
  type EmoteKey,
} from "@jelly/scene/emotes";

import type { EventPayload, StageCatalog, StageEvent } from "./types.ts";

import { FULL_CIRCLE } from "./world.ts";

const BUBBLE_MS = EMOTE_SECONDS * 1000;
const TOAST_MS = 5000;
const XP_TOAST_MS = 1800;
const MOTION_MS = 2400;
/** A snack run: there, a short wait at the counter and back. */
const VISIT_MS = 14_000;
/** XP for these reports sends the jelly on a snack run. */
const SNACK_SOURCES = new Set(["food", "drink"]);
/** Events older than this are replays after a lost connection and not worth animating. */
const FRESH_EVENT_MS = 10_000;
/** A flood of events drops the oldest effects instead of slowing the stage down. */
const MAX_EFFECTS = 200;
const HOP_HEIGHT = 0.45;
const HOPS_PER_MOTION = 3;
const WIGGLE_ANGLE = 0.3;
const WIGGLES_PER_MOTION = 6;
const SECRET_ACHIEVEMENT_TITLE = "Geheimes Achievement";
/** Events that reward a jelly. It bounces and beams like the jelly in the app after a poke. */
const PULSE_EVENTS = new Set(["xp.gained", "level.up", "achievement.earned", "award.given"]);
const RESTING_POSE: MotionPose = { lift: 0, turn: 0, tilt: 0 };

/** Motions that need no extra art. The keys match the partner emotes of the server. */
export type MotionKey = "hop" | "spin" | "wiggle";

/** How a motion changes a jelly at one moment. */
export interface MotionPose {
  /** Lift in jelly heights. */
  lift: number;
  /** Turn around the vertical axis in radians. */
  turn: number;
  /** Sideways tilt in radians. */
  tilt: number;
}

/** A running animation of one jelly. */
export type StageEffect = { playerId: number; startedAt: number; endsAt: number } & (
  | { kind: "bubble"; glyph: string }
  | { kind: "toast"; text: string }
  | { kind: "motion"; motion: MotionKey }
  | { kind: "emote"; key: EmoteKey }
  | { kind: "visit" }
);

/** Reports whether an event rewards its jelly, which then bounces. */
export function isPulseEvent(event: StageEvent): boolean {
  return PULSE_EVENTS.has(event.type);
}

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
  const { key, level, title, partner_id: partnerId } = event.payload;
  switch (event.type) {
    case "emote":
      return createEmoteEffects(playerId, key ?? "", now);
    case "partner.emote":
      return createPartnerEffects([playerId, partnerId ?? playerId], key ?? "", now);
    case "xp.gained":
      return createXPEffects(start, event.payload);
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

/** XP rises as a short text. Food and drink also send the jelly on a snack run. */
function createXPEffects(
  start: { playerId: number; startedAt: number },
  payload: EventPayload,
): StageEffect[] {
  const toast: StageEffect = {
    ...start,
    endsAt: start.startedAt + XP_TOAST_MS,
    kind: "toast",
    text: `+${payload.amount ?? 0} XP`,
  };
  if (!SNACK_SOURCES.has(payload.source ?? "")) {
    return [toast];
  }
  return [toast, { ...start, endsAt: start.startedAt + VISIT_MS, kind: "visit" }];
}

/** Secret achievements are not in the catalog, the stage only says that one was found. */
function findTitle(catalog: StageCatalog, key: string | undefined): string {
  const achievement = catalog.achievements.find((entry) => entry.key === key);
  return achievement?.title ?? SECRET_ACHIEVEMENT_TITLE;
}

/** An emote shows its bubble and plays the shared jelly gesture. */
function createEmoteEffects(playerId: number, key: string, now: number): StageEffect[] {
  if (!isEmoteKey(key)) return [];
  const timing = { playerId, startedAt: now, endsAt: now + BUBBLE_MS };
  return [
    { ...timing, kind: "bubble", glyph: EMOTE_GLYPHS[key] },
    { ...timing, kind: "emote", key },
  ];
}

/** The latest gesture replaces a previous one; elapsed seconds use the effect clock. */
export function findEmote(
  effects: StageEffect[],
  playerId: number,
  now: number,
): EmoteFrame | undefined {
  let effect: StageEffect | undefined;
  for (const item of effects) {
    if (item.kind === "emote" && item.playerId === playerId) effect = item;
  }
  if (effect?.kind !== "emote" || now < effect.startedAt || now >= effect.endsAt) return;
  return { key: effect.key, elapsed: (now - effect.startedAt) / 1000 };
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
        ...RESTING_POSE,
        lift: HOP_HEIGHT * Math.abs(Math.sin(progress * Math.PI * HOPS_PER_MOTION)),
      };
    case "spin":
      return { ...RESTING_POSE, turn: progress * FULL_CIRCLE };
    case "wiggle":
      return {
        ...RESTING_POSE,
        tilt: WIGGLE_ANGLE * Math.sin(progress * Math.PI * WIGGLES_PER_MOTION),
      };
  }
}

/** Returns the jellies that are on a snack run right now. */
export function findVisitors(effects: StageEffect[], now: number): Set<number> {
  const visitors = effects.filter(
    (effect) => effect.kind === "visit" && effect.startedAt <= now && effect.endsAt > now,
  );
  return new Set(visitors.map((effect) => effect.playerId));
}

/** Returns the current motion of a jelly, or the resting pose. */
export function findMotionPose(effects: StageEffect[], playerId: number, now: number): MotionPose {
  for (const effect of effects) {
    if (effect.kind === "motion" && effect.playerId === playerId) {
      const progress = (now - effect.startedAt) / (effect.endsAt - effect.startedAt);
      return calculateMotionPose(effect.motion, Math.min(1, Math.max(0, progress)));
    }
  }
  return RESTING_POSE;
}
