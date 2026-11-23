/**
 * Berührungen am Jelly: der Nasenstupser und das Streicheln. Nur die App löst sie aus. Bühne,
 * Karte, Website und Shop geben kein `touch` an, bei ihnen bleibt alles wie zuvor.
 *
 * @module
 */

import { MathUtils } from "three";

import type { Frame, Motion } from "./animation.ts";
import type { Face } from "./face.ts";
import type { Jelly } from "./jelly.ts";

import { applyExpression, EXPRESSIONS, type Expression } from "./expression.ts";
import { EYE_GAZE, placeEyes } from "./face.ts";

/** So lange dauert ein Nasenstupser, in Sekunden. */
export const BOOP_SECONDS = 1.4;

/** Erschrocken: ein kleiner, runder Mund. */
const STARTLED: Expression = { mouth: "o", mouthScale: [0.55, 0.6] };

/** Das Lächeln danach. */
const RELIEVED: Expression = { eyes: "happy", blush: 0.4 };

/** Berührungen in diesem Bild. */
export interface TouchFrame {
  /** Sekunden seit dem letzten Nasenstupser. Ohne Wert gab es noch keinen. */
  boop?: number;
  /** Wie fest gerade gestreichelt wird, 0 bis 1. Das Jelly folgt weich und klingt danach ab. */
  petting?: number;
  /** Wo die streichelnde Hand ist, −1 links bis 1 rechts vom Kopf. */
  lean?: number;
}

/** Steigt ab `from` in `fade` Sekunden auf 1 und sinkt bis `to` wieder auf 0. */
function span(time: number, from: number, to: number, fade: number) {
  return Math.min(
    MathUtils.smoothstep(time, from, from + fade),
    MathUtils.smoothstep(to - time, 0, fade),
  );
}

/** Wie stark die drei Teile des Nasenstupsers nach `elapsed` Sekunden wirken, je 0 bis 1. */
export function boopPhases(elapsed: number) {
  return {
    // Er zuckt zurück und schielt zur Nase.
    flinch: span(elapsed, 0, 0.5, 0.06),
    // Er kneift die Augen zu und kichert.
    giggle: span(elapsed, 0.4, 1, 0.1),
    // Zum Schluss lächelt er.
    smile: span(elapsed, 0.9, BOOP_SECONDS, 0.15),
  };
}

/**
 * Lässt die Augen mit `amount` zur Nase schielen. Die Grundpose setzt ihre Lage nicht zurück, darum
 * holt sie das erste Bild ohne Schielen einmal zurück.
 */
function crossEyes(face: Face, s: Motion, amount: number) {
  if (amount === 0 && !s.crossed) return;
  placeEyes(face, 0, -EYE_GAZE.y * amount, EYE_GAZE.x * amount);
  s.crossed = amount > 0;
}

/** Legt einen Ausdruck nur auf, wenn er wirkt. Sonst würden unsichtbare Wangen gezeichnet. */
function express(face: Face, expression: Expression, strength: number) {
  if (strength > 0) applyExpression(face, expression, strength);
}

/**
 * Der Nasenstupser: Er zuckt zurück und schielt zur Nase, kichert mit zugekniffenen Augen und
 * lächelt zum Schluss. Bei reduzierter Bewegung bleibt nur das Gesicht.
 */
function animateBoop(jelly: Jelly, s: Motion, elapsed: number, { motion }: Frame) {
  const { flinch, giggle, smile } = boopPhases(elapsed);
  jelly.head.position.z -= 0.07 * flinch * motion;
  jelly.head.rotation.x -= 0.2 * flinch * motion;
  jelly.root.rotation.z += Math.sin(elapsed * 38) * 0.03 * giggle * motion;
  jelly.root.scale.y *= 1 - Math.abs(Math.sin(elapsed * 19)) * 0.035 * giggle * motion;
  crossEyes(jelly.face, s, flinch * motion);
  express(jelly.face, STARTLED, flinch);
  express(jelly.face, EXPRESSIONS.booped, giggle);
  express(jelly.face, RELIEVED, smile);
}

/** Führt Stärke und Neigung des Streichelns weich nach: schnell hinein, langsam wieder hinaus. */
function followPetting(s: Motion, { petting = 0, lean = 0 }: TouchFrame, { delta, motion }: Frame) {
  const now = s.petting ?? 0;
  // Bei reduzierter Bewegung steht die Uhr: Das Gesicht wechselt dann gleich.
  s.petting = motion ? MathUtils.damp(now, petting, petting > now ? 6 : 2.5, delta) : petting;
  s.lean = MathUtils.damp(s.lean ?? 0, lean, 5, delta);
  return s.petting;
}

/**
 * Streicheln: Er neigt den Kopf der Hand entgegen und folgt ihr ein wenig, macht zufriedene Bögen
 * statt Augen, wird etwas flacher und wippt dabei. Bei reduzierter Bewegung bleibt nur das
 * Gesicht.
 */
function animatePetting(jelly: Jelly, s: Motion, touch: TouchFrame, frame: Frame) {
  const strength = followPetting(s, touch, frame);
  if (strength < 0.001) return;
  const { time, motion } = frame;
  const lean = (s.lean ?? 0) * strength * motion;
  const bob = Math.sin(time * 6) * 0.025;
  jelly.head.rotation.z -= lean * 0.2;
  jelly.head.position.x += lean * 0.05;
  jelly.root.scale.y *= 1 - (0.07 + bob) * strength * motion;
  jelly.root.scale.x *= 1 + 0.05 * strength * motion;
  jelly.root.scale.z *= 1 + 0.05 * strength * motion;
  express(jelly.face, EXPRESSIONS.petted, strength);
}

/** Legt die Berührungen über die frisch berechnete Grundpose. */
export function animateTouch(jelly: Jelly, s: Motion, touch: TouchFrame, frame: Frame) {
  const { boop = Infinity } = touch;
  if (boop >= 0 && boop < BOOP_SECONDS) animateBoop(jelly, s, boop, frame);
  else crossEyes(jelly.face, s, 0);
  animatePetting(jelly, s, touch, frame);
}
