/**
 * Das Gesicht des Zauberers: schwere Lider über den Augen, seine Stimmungen und der Schlaf.
 *
 * Läuft nach der Grundanimation und nach seinen Gesten (`wizardGestures.ts`), die beide Augen,
 * Brauen und Mund jedes Bild neu setzen. Offene Augen werden hier zu Augen unter dem Lid
 * (`lidded`), die Stimmung weitet oder senkt das Lid über `scale.y`. Was eine Geste schon
 * gezeichnet hat, etwa Bogen-Augen, bleibt.
 *
 * @module
 */

import { MathUtils } from "three";

import type { Jelly } from "./jelly.ts";

import { applyExpression, type Expression } from "./expression.ts";

/** Seine Stimmungen. Sie färben Lider, Brauen, Wangen und Mund. */
export const WIZARD_MOODS = [
  "neutral",
  "attentive",
  "focused",
  "delighted",
  "drowsy",
  "asleep",
  "startled",
  "sheepish",
  "indignant",
  "hurt",
] as const;

/** Eine seiner Stimmungen. */
export type WizardMood = (typeof WIZARD_MOODS)[number];

/** Wie eine Stimmung aussieht: Öffnung des Lids und ein Ausdruck darüber. */
interface MoodFace {
  /** Höhe des Auges unter dem Lid, 1 wie gezeichnet. */
  lid: number;
  face?: Expression;
}

/**
 * Jede Stimmung. Die Brauen zeigt er nicht selbst: Der Shop liest die Brauen des Ausdrucks und hebt
 * damit seine buschigen Brauen.
 */
const MOOD_FACES: Readonly<Record<WizardMood, MoodFace>> = {
  neutral: { lid: 1 },
  attentive: { lid: 1.15, face: { brows: { lift: 0.02, tilt: 0.05 } } },
  focused: { lid: 0.85, face: { brows: { lift: -0.02, tilt: -0.3 }, mouth: "flat" } },
  delighted: { lid: 1, face: { eyes: "happy", blush: 0.5, brows: { lift: 0.02, tilt: 0.1 } } },
  drowsy: { lid: 0.6, face: { brows: { lift: -0.015, tilt: 0.12 } } },
  asleep: { lid: 1, face: { brows: { lift: 0.005, tilt: 0.1 }, mouth: "m" } },
  startled: { lid: 1.3, face: { brows: { lift: 0.05, tilt: 0.15 }, mouth: "o" } },
  sheepish: { lid: 0.8, face: { blush: 0.4, brows: { lift: 0.015, tilt: 0.35 } } },
  // Empört: weite Augen unter zornigen Brauen. Gekränkt: die Lider sinken, der Mund hängt.
  indignant: { lid: 1.2, face: { brows: { lift: -0.02, tilt: -0.45 }, mouth: "flat" } },
  hurt: { lid: 0.7, face: { brows: { lift: 0.02, tilt: 0.45 }, mouth: "sad" } },
};

/** Schläfrig fallen ihm alle 3,5 s die Augen schwer zu, für 0,45 s. */
const HEAVY_BLINK = { every: 3.5, seconds: 0.45, depth: 0.95 } as const;

/** Wie weit ein Auge beim Blinzeln im Schlaf aufgeht. */
const PEEK_LID = 0.45;

/** So lange sinkt der Kopf beim Einschlafen, in Sekunden. */
const SINK_SECONDS = 1.2;

/** Was der Mund darf und wie die Uhr steht. */
export interface FaceContext {
  /** Darf ein Ausdruck den Mund formen? Beim Sprechen gewinnt die Stimme. */
  mouthFree: boolean;
  /** Zeit der Szenenuhr in Sekunden. */
  time: number;
  reducedMotion: boolean;
}

/** Legt einen Ausdruck über das Gesicht. Spricht er, bleibt der Mund der Stimme überlassen. */
export function express(jelly: Jelly, face: Expression, strength: number, ctx: FaceContext) {
  if (strength <= 0) return;
  const shown = ctx.mouthFree ? face : { ...face, mouth: undefined, mouthScale: undefined };
  applyExpression(jelly.face, shown, strength);
}

/** Wie weit das schwere Blinzeln das Lid gerade schließt, 1 offen. */
function heavyBlink(time: number) {
  const phase = MathUtils.euclideanModulo(time, HEAVY_BLINK.every) / HEAVY_BLINK.seconds;
  return phase < 1 ? 1 - HEAVY_BLINK.depth * Math.sin(phase * Math.PI) : 1;
}

/** Legt die Stimmung über das Gesicht und liefert, wie weit sein Lid offen steht. */
export function applyMood(jelly: Jelly, mood: WizardMood, ctx: FaceContext) {
  const { lid, face } = MOOD_FACES[mood];
  if (face) express(jelly, face, 1, ctx);
  const blink = mood === "drowsy" && !ctx.reducedMotion ? heavyBlink(ctx.time) : 1;
  return lid * blink;
}

/** Wie die Augen in diesem Bild stehen. */
export interface EyeLook {
  /** Höhe unter dem Lid. */
  lid: number;
  /** Beide Augen zu, etwa im Schlaf. */
  closed: boolean;
  /** Wie weit das rechte Auge im Schlaf kurz aufgeht, 0 bis 1. */
  peek: number;
}

/**
 * Macht die Augen alt: offene Augen hinter das schwere Lid, das rechte gespiegelt, damit das Lid
 * außen hängt. Geschlossen zeigt er den flachen Bogen, ein blinzelndes Auge öffnet sich halb.
 */
export function shapeEyes({ face }: Jelly, { lid, closed, peek }: EyeLook) {
  face.eyes.forEach((eye, index) => {
    const peeking = index === 1 && peek > 0.15;
    if (closed && !peeking) {
      eye.geometry = face.eyeShapes.closed;
      eye.scale.y = 1;
      return;
    }
    if (peeking) {
      eye.geometry = face.eyeShapes.lidded;
      eye.scale.set(-Math.abs(eye.scale.x), PEEK_LID * peek, 1);
      return;
    }
    if (eye.geometry !== face.eyeShapes.open) return;
    eye.geometry = face.eyeShapes.lidded;
    if (index === 1) eye.scale.x *= -1;
    eye.scale.y *= lid;
  });
}

/** Wie tief er schon eingeschlafen ist, 0 wach, 1 ganz. Der Kopf sinkt über 1,2 s. */
export function sleepDepth(mood: WizardMood, asleepFor: number | null | undefined, calm: boolean) {
  if (mood !== "asleep") return 0;
  if (calm || asleepFor === null || asleepFor === undefined) return 1;
  return MathUtils.smoothstep(asleepFor, 0, SINK_SECONDS);
}
