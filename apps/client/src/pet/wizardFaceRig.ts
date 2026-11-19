/**
 * Was das Gesicht des Zauberers lebendig macht, als reine Rechnung: buschige Brauen, die den
 * gezeichneten Brauen des Ausdrucks folgen, ein Schnurrbart, der bei offenen Vokalen zuckt, und ein
 * Blick, der zu Kundschaft, Kugel, Börse, Rolle oder Siegel wandert.
 *
 * Die Szene (`scene/WizardRig.tsx`) liest das jedes Bild. Aus seiner Haltung (`WizardPose`) wird
 * hier auch das Bild für `animateWizard` aus `@jelly/scene/wizard`.
 *
 * @module
 */

import type { MouthShape } from "@jelly/scene";
import type { WizardFrame, WizardGestureFrame } from "@jelly/scene/wizard";

import { isWizardGestureKey } from "@jelly/scene/wizard-timing";

import type { GazeTarget, WizardMood, WizardPose } from "./wizardScripts";

/** So viel weiter als die gezeichnete Braue hebt sich die buschige, und so tief sinkt sie im Schlaf. */
export const BROW_RIG = { lift: 1.3, dozeSink: 0.015 } as const;

/**
 * Lage und Drehung einer buschigen Braue aus der gezeichneten: Sie hebt sich 1,3-mal so weit und
 * sinkt beim Dösen. Die linke liegt in einem gespiegelten Rahmen, ihre Drehung kehrt sich deshalb
 * um.
 *
 * @param lift - Höhe der gezeichneten Braue in ihrem Halter.
 * @param tilt - Drehung der gezeichneten Braue um die Blickachse.
 * @param side - −1 links, 1 rechts.
 * @param doze - 0 wach, 1 eingeschlafen.
 */
export function browRig(lift: number, tilt: number, side: -1 | 1, doze: number) {
  return { y: BROW_RIG.lift * lift - BROW_RIG.dozeSink * doze, rotation: side < 0 ? -tilt : tilt };
}

/** Wie weit der Schnurrbart bei offenen Vokalen zuckt (rad), wie weit er steigt und wie schnell. */
export const MUSTACHE_RIG = { twitch: 0.07, rise: 0.006, rate: 25 } as const;

/** Bei diesen Mundformen ist der Mund offen. */
const OPEN_MOUTHS: ReadonlySet<MouthShape> = new Set(["a", "o", "e", "grin"]);

/** Wohin der Schnurrbart zuckt, wenn der Mund `shape` formt. Ohne Form ruht er. */
export function mustacheTwitch(shape: MouthShape | null | undefined) {
  return shape && OPEN_MOUTHS.has(shape) ? MUSTACHE_RIG.twitch : 0;
}

/** Wie weit die buschigen Brauen in einer Stimmung sinken: halb beim Dösen, ganz im Schlaf. */
export function moodDoze(mood: WizardMood) {
  if (mood === "asleep") return 1;
  return mood === "drowsy" ? 0.5 : 0;
}

/** Wohin ein Blick geht: Versatz der Augen und Neigung des Kopfes (rad). */
export interface GazeAim {
  dx: number;
  dy: number;
  roll: number;
}

/**
 * Jedes Ziel seines Blicks. Die Kundschaft steht rechts, die Rolle liegt unten, die Börse oben
 * rechts. Der Kopf neigt sich hin, dreht sich aber nicht: Hut und Bart sind von vorn gemalt.
 */
export const GAZE_AIMS: Readonly<Record<GazeTarget, GazeAim>> = {
  viewer: { dx: 0, dy: 0, roll: 0 },
  customer: { dx: 0.035, dy: -0.004, roll: -0.05 },
  orb: { dx: 0.03, dy: -0.02, roll: -0.04 },
  purse: { dx: 0.035, dy: 0.02, roll: -0.06 },
  ledger: { dx: 0.01, dy: -0.022, roll: 0 },
  seal: { dx: 0.03, dy: -0.022, roll: -0.03 },
};

/**
 * Wie der Blick folgt: Die Augen springen voraus (Rate 18/s), der Kopf folgt langsamer (5/s) und
 * erst 80 ms später. Ruht der Blick länger als 1,5 s, zucken die Augen alle 0,6 bis 1,4 s um bis zu
 * 0,004.
 */
export const GAZE_TIMING = {
  eyeRate: 18,
  headRate: 5,
  headDelay: 0.08,
  restless: 1.5,
  saccadeEvery: [0.6, 1.4],
  saccade: 0.004,
} as const;

/** Der Blick zwischen zwei Bildern. Zeiten in Sekunden. */
export interface GazeState {
  target: GazeTarget;
  /** Seit wann er auf `target` schaut. */
  since: number;
  dx: number;
  dy: number;
  roll: number;
  /** Das kleine Zucken der Augen. */
  jitter: { dx: number; dy: number };
  /** Wann die Augen das nächste Mal zucken. */
  nextJitter: number;
}

/** Ein Blick nach vorn. */
export function createGaze(now: number): GazeState {
  return {
    target: "viewer",
    since: now,
    dx: 0,
    dy: 0,
    roll: 0,
    jitter: { dx: 0, dy: 0 },
    nextJitter: 0,
  };
}

/** Ein Schritt eines Federwegs mit Rate `rate` pro Sekunde, wie `MathUtils.damp`. */
function damp(from: number, to: number, rate: number, delta: number) {
  return from + (to - from) * (1 - Math.exp(-rate * delta));
}

/** Was {@link stepGaze} pro Bild braucht. */
export interface GazeStep {
  now: number;
  delta: number;
  /** Reduzierte Bewegung: Er schaut ruhig nach vorn. */
  calm: boolean;
  /** Zufall von 0 bis unter 1, für das Zucken. */
  random: () => number;
}

/** Das Zucken der Augen, wenn er lange auf dasselbe schaut. */
function restlessEyes(state: GazeState, { now, random }: GazeStep) {
  if (now - state.since < GAZE_TIMING.restless) return { jitter: { dx: 0, dy: 0 }, nextJitter: 0 };
  if (now < state.nextJitter) return { jitter: state.jitter, nextJitter: state.nextJitter };
  const [shortest, longest] = GAZE_TIMING.saccadeEvery;
  const size = GAZE_TIMING.saccade;
  return {
    jitter: { dx: (random() * 2 - 1) * size, dy: (random() * 2 - 1) * size },
    nextJitter: now + shortest + random() * (longest - shortest),
  };
}

/** Der Blick im nächsten Bild, wenn er auf `target` schauen will. */
export function stepGaze(state: GazeState, target: GazeTarget, step: GazeStep): GazeState {
  if (step.calm) return createGaze(step.now);
  const turned = target !== state.target;
  const since = turned ? step.now : state.since;
  const held = { ...state, target, since, nextJitter: turned ? 0 : state.nextJitter };
  const { jitter, nextJitter } = restlessEyes(held, step);
  const aim = GAZE_AIMS[target];
  const headGoal = step.now - since >= GAZE_TIMING.headDelay ? aim.roll : state.roll;
  return {
    target,
    since,
    dx: damp(state.dx, aim.dx + jitter.dx, GAZE_TIMING.eyeRate, step.delta),
    dy: damp(state.dy, aim.dy + jitter.dy, GAZE_TIMING.eyeRate, step.delta),
    roll: damp(state.roll, headGoal, GAZE_TIMING.headRate, step.delta),
    jitter,
    nextJitter,
  };
}

/** Seine eigene Geste im Bild, geteilte wie das Zeigen spielt die Szene als Emote. */
function gestureFrame(gesture: WizardPose["gesture"], now: number): WizardGestureFrame | null {
  if (!gesture) return null;
  const { key, startedAt, seconds, releaseAt } = gesture;
  if (!isWizardGestureKey(key)) return null;
  const elapsed = (now - startedAt) / 1000;
  return releaseAt === undefined ? { key, elapsed, seconds } : { key, elapsed, seconds, releaseAt };
}

/**
 * Das Bild für `animateWizard` aus seiner Haltung.
 *
 * @param now - Uhr von `performance.now()`, auf der die Haltung ihre Zeiten führt.
 * @param time - Zeit der Szenenuhr in Sekunden.
 */
export function wizardFrame(pose: WizardPose, now: number, time: number): WizardFrame {
  const { gesture, mood, speaking, asleepSince } = pose;
  const asleepFor = asleepSince === null ? null : (now - asleepSince) / 1000;
  return { time, mood, speaking, asleepFor, gesture: gestureFrame(gesture, now) };
}
