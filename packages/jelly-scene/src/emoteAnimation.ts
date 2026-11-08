/**
 * Kurze Gesten auf der normalen Jelly-Pose. Jede Berechnung beginnt mit der Grundanimation.
 *
 * @module
 */

import { Euler, MathUtils, Quaternion, Vector3 } from "three";

import type { Jelly } from "./jelly.ts";

import { EMOTE_SECONDS, type EmoteFrame, type EmoteKey } from "./emotes.ts";
import { applyExpression, EXPRESSIONS, type Expression } from "./expression.ts";

/** Dauer des weichen Ein- und Ausblendens in Sekunden. */
const FADE_SECONDS = 0.3;

/** Werte für eine Geste in diesem Bild. */
interface Gesture {
  strength: number;
  phase: number;
  moving: number;
}

/** Ziel einer Hand, angegeben für die rechte. Die linke spiegelt Lage und Drehung. */
interface HandPose {
  /** Lage im Jelly. */
  at: [number, number, number];
  /**
   * Drehung als Euler-Winkel (XYZ). Ungedreht zeigen die Finger nach oben, die Handfläche nach vorn
   * und der Daumen zur Körpermitte.
   */
  turn: [number, number, number];
  /** Beugung von Zeigefinger, übrigen Fingern und Daumen, 0 offen, 1 Faust. Ohne Angabe offen. */
  curl?: [number, number, number];
}

/** Ausdrücke einzelner Gesten, abgewandelt aus den allgemeinen in `expression.ts`. */
const CHEERING: Expression = { ...EXPRESSIONS.joy, mouth: "o" };
const DANCING: Expression = { eyes: "happy" };
const LOVING: Expression = { eyes: "happy", blush: 0.9 };
const SHRUGGING: Expression = { ...EXPRESSIONS.skeptic, mouth: "sad" };

/** Wiederverwendet, damit eine Geste pro Bild nichts anlegt. */
const goalAngles = new Euler();
const goal = new Quaternion();
const goalCurl = new Vector3();

/** Holt Hand `index` (0 links, 1 rechts) aus ihrer Grundpose zum Ziel. */
function poseHand(jelly: Jelly, index: number, pose: HandPose, strength: number) {
  const hand = jelly.hands[index]!;
  const side = index === 0 ? -1 : 1;
  const { at, turn, curl = [0, 0, 0] } = pose;
  hand.visible = true;
  hand.position.set(
    MathUtils.lerp(hand.position.x, side * at[0], strength),
    MathUtils.lerp(hand.position.y, at[1], strength),
    MathUtils.lerp(hand.position.z, at[2], strength),
  );
  hand.scale.setScalar(MathUtils.lerp(hand.scale.x, 1, strength));
  // Gespiegelt bleibt die Drehung um x, die um y und z kehrt sich um.
  goal.setFromEuler(goalAngles.set(turn[0], side * turn[1], side * turn[2]));
  hand.quaternion.slerp(goal, strength);
  jelly.curls[index]!.lerp(goalCurl.fromArray(curl), strength);
}

/** Beide Hände, die linke gespiegelt. `pose` bekommt die Seite und darf sie nutzen. */
function poseHands(jelly: Jelly, pose: (side: number) => HandPose, strength: number) {
  poseHand(jelly, 0, pose(-1), strength);
  poseHand(jelly, 1, pose(1), strength);
}

/** Eine Hand winkt neben dem Kopf, die Handfläche nach vorn. */
function wave(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const swing = Math.sin(phase * 10) * moving;
  const pose: HandPose = { at: [1.12 + swing * 0.18, 0.8, 0.35], turn: [0, 0, -0.2 - swing * 0.4] };
  poseHand(jelly, 1, pose, strength);
}

/** Körper und Hände wiegen sich gegeneinander. */
function dance(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const sway = moving ? Math.sin(phase * 7) : 0.45;
  jelly.root.rotation.z += sway * 0.2 * strength;
  poseHands(
    jelly,
    (side) => ({
      at: [1.05, 0.25 + side * sway * 0.3, 0.4],
      turn: [0, 0, -0.5 + side * sway * 0.5],
    }),
    strength,
  );
  applyExpression(jelly.face, DANCING, strength);
}

/** Beide Hände hoch, die Finger zappeln, dazu ein kleiner Hüpfer. */
function cheer(jelly: Jelly, { strength, phase, moving }: Gesture) {
  jelly.root.position.y += Math.abs(Math.sin(phase * Math.PI * 2)) * 0.35 * moving * strength;
  const wiggle = Math.sin(phase * 14) * 0.2 * moving;
  poseHands(jelly, () => ({ at: [0.85, 1, 0.3], turn: [0, 0, -0.45 + wiggle] }), strength);
  applyExpression(jelly.face, CHEERING, strength);
}

/** Lacht mit Bogen-Augen und breitem Grinsen und schüttelt sich dabei. */
function laugh(jelly: Jelly, { strength, phase, moving }: Gesture) {
  applyExpression(jelly.face, EXPRESSIONS.joy, strength);
  jelly.root.rotation.z += Math.sin(phase * 22) * 0.07 * moving * strength;
  jelly.root.scale.y *= 1 - (0.03 + Math.sin(phase * 18) * 0.025 * moving) * strength;
}

/** Senkt den Kopf und schließt für einen Moment die Augen. */
function sleep(jelly: Jelly, { strength }: Gesture) {
  jelly.head.position.y -= 0.12 * strength;
  jelly.head.rotation.z += 0.16 * strength;
  applyExpression(jelly.face, EXPRESSIONS.sleepy, strength);
}

/**
 * Formt mit beiden Händen vor dem Körper ein Herz und errötet: Die Finger treffen sich oben, die
 * Daumen unten.
 */
function love(jelly: Jelly, { strength }: Gesture) {
  poseHands(jelly, () => ({ at: [0.2, -0.08, 0.7], turn: [0, 0, 0.6] }), strength);
  applyExpression(jelly.face, LOVING, strength);
}

/** Zuckt im Takt mit den Schultern, die Handflächen nach oben. Kopf schief, eine Braue skeptisch. */
function shrug(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const lift = Math.max(0, Math.sin(phase * 5)) * 0.1 * moving;
  poseHands(jelly, () => ({ at: [0.95, 0.02 + lift, 0.4], turn: [-0.8, 0, -1.35] }), strength);
  jelly.root.position.y += lift * 0.4 * strength;
  jelly.head.rotation.z += 0.14 * strength;
  applyExpression(jelly.face, SHRUGGING, strength);
}

/** Zeigt mit dem Zeigefinger der rechten Hand zur Seite, die übrigen Finger zur Faust. */
function point(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const jab = Math.max(0, Math.sin(phase * 8)) * 0.08 * moving;
  const pose: HandPose = {
    at: [1.05 + jab, 0.3, 0.5 + jab * 0.3],
    turn: [0, -0.3, -1.4],
    curl: [0, 1, 0.6],
  };
  poseHand(jelly, 1, pose, strength);
  jelly.head.rotation.z -= 0.1 * strength;
}

/** Grübelt mit dem Zeigefinger am Kinn, lehnt den Kopf hinein und hebt skeptisch eine Braue. */
function think(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const tap = Math.sin(phase * 6) * 0.02 * moving;
  const pose: HandPose = { at: [0.3, 0.06 + tap, 0.72], turn: [0, 0, 0.45], curl: [0, 0.9, 0.5] };
  poseHand(jelly, 1, pose, strength);
  jelly.head.rotation.z -= 0.12 * strength;
  applyExpression(jelly.face, EXPRESSIONS.skeptic, strength);
}

/** Ballt die Fäuste, stampft und zittert vor Wut, am Ende schimpft er mit zugekniffenen Augen. */
function angry(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const tremble = Math.sin(phase * 40) * 0.012 * moving;
  const fist: HandPose = {
    at: [0.98 + tremble, -0.15, 0.45],
    turn: [0, 0, -0.25],
    curl: [1, 1, 1],
  };
  poseHands(jelly, () => fist, strength);
  jelly.root.position.y += Math.abs(Math.sin(phase * Math.PI * 1.4)) * 0.08 * moving * strength;
  jelly.head.rotation.z += Math.sin(phase * 30) * 0.03 * moving * strength;
  applyExpression(jelly.face, phase < 1.5 ? EXPRESSIONS.angry : EXPRESSIONS.shout, strength);
}

/** Lässt den Kopf hängen, die Zeigefinger tippen vor dem Bauch zaghaft aneinander. */
function sad(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const fidget = Math.max(0, Math.sin(phase * 6)) * 0.035 * moving;
  poseHands(
    jelly,
    () => ({
      at: [0.28 + fidget, -0.32, 0.82],
      turn: [0, Math.PI, -Math.PI / 2],
      curl: [0, 1, 0.3],
    }),
    strength,
  );
  jelly.head.position.y -= 0.07 * strength;
  jelly.head.rotation.z += 0.06 * strength;
  jelly.root.scale.y *= 1 - 0.04 * strength;
  applyExpression(jelly.face, EXPRESSIONS.sad, strength);
}

/** Hält die Hände verlegen an die Wangen, errötet und wiegt sich ein wenig. */
function shy(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const sway = Math.sin(phase * 4) * moving;
  const cheek: HandPose = { at: [0.34, 0.24, 0.74], turn: [0, 0, 0.5], curl: [0.5, 0.5, 0.3] };
  poseHands(jelly, () => cheek, strength);
  jelly.root.rotation.z += sway * 0.05 * strength;
  jelly.head.rotation.z += (0.12 + sway * 0.04) * strength;
  applyExpression(jelly.face, EXPRESSIONS.shy, strength);
}

/** Jede bekannte Geste hat genau eine Darstellung. */
const GESTURES: Record<EmoteKey, (jelly: Jelly, gesture: Gesture) => void> = {
  wave,
  dance,
  cheer,
  laugh,
  sleep,
  love,
  shrug,
  point,
  think,
  angry,
  sad,
  shy,
};

/** Legt eine zeitlich begrenzte Geste über die frisch berechnete Grundpose. */
export function animateEmote(jelly: Jelly, emote: EmoteFrame, reducedMotion: boolean) {
  const { key, elapsed } = emote;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= EMOTE_SECONDS) return;
  const edge = Math.min(elapsed, EMOTE_SECONDS - elapsed);
  const strength = reducedMotion ? 1 : MathUtils.smoothstep(edge, 0, FADE_SECONDS);
  if (strength === 0) return;
  GESTURES[key](jelly, {
    strength,
    phase: reducedMotion ? 0 : elapsed,
    moving: reducedMotion ? 0 : 1,
  });
}
