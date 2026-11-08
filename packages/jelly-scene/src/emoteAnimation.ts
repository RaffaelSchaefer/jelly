/**
 * Kurze Gesten auf der normalen Jelly-Pose. Jede Berechnung beginnt mit der Grundanimation.
 *
 * @module
 */

import { Euler, MathUtils, Quaternion, Vector3, type MeshBasicMaterial } from "three";

import type { Jelly } from "./jelly.ts";

import { EMOTE_SECONDS, type EmoteFrame, type EmoteKey } from "./emotes.ts";

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
}

/** Beide Hände hoch, die Finger zappeln, dazu ein kleiner Hüpfer. */
function cheer(jelly: Jelly, { strength, phase, moving }: Gesture) {
  jelly.root.position.y += Math.abs(Math.sin(phase * Math.PI * 2)) * 0.35 * moving * strength;
  const wiggle = Math.sin(phase * 14) * 0.2 * moving;
  poseHands(jelly, () => ({ at: [0.85, 1, 0.3], turn: [0, 0, -0.45 + wiggle] }), strength);
}

/** Kneift die Augen zu und lässt den Mund lächeln. */
function smile(jelly: Jelly, strength: number) {
  for (const eye of jelly.face.eyes) eye.scale.y *= 1 - strength * 0.9;
  jelly.face.mouth.scale.x += strength * 0.35;
  jelly.face.mouth.scale.y += strength * 0.3;
}

/** Lacht mit geschlossenen Augen und leichtem Schütteln. */
function laugh(jelly: Jelly, { strength, phase, moving }: Gesture) {
  smile(jelly, strength);
  jelly.root.rotation.z += Math.sin(phase * 22) * 0.07 * moving * strength;
  jelly.root.scale.y *= 1 - (0.03 + Math.sin(phase * 18) * 0.025 * moving) * strength;
}

/** Senkt den Kopf und schließt für einen Moment die Augen. */
function sleep(jelly: Jelly, { strength }: Gesture) {
  jelly.head.position.y -= 0.12 * strength;
  jelly.head.rotation.z += 0.16 * strength;
  for (const eye of jelly.face.eyes) eye.scale.y *= 1 - strength * 0.94;
  jelly.face.mouth.scale.x *= 1 - strength * 0.4;
}

/**
 * Formt mit beiden Händen vor dem Körper ein Herz und errötet: Die Finger treffen sich oben, die
 * Daumen unten.
 */
function love(jelly: Jelly, { strength }: Gesture) {
  poseHands(jelly, () => ({ at: [0.2, -0.08, 0.7], turn: [0, 0, 0.6] }), strength);
  smile(jelly, strength * 0.5);
  for (const cheek of jelly.face.cheeks) {
    cheek.visible = true;
    const material = cheek.material as MeshBasicMaterial;
    material.opacity = Math.max(material.opacity, strength * 0.65);
  }
}

/** Zuckt im Takt mit den Schultern, die Handflächen nach oben. Kopf schief, ein Auge skeptisch. */
function shrug(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const lift = Math.max(0, Math.sin(phase * 5)) * 0.1 * moving;
  poseHands(jelly, () => ({ at: [0.95, 0.02 + lift, 0.4], turn: [-0.8, 0, -1.35] }), strength);
  jelly.root.position.y += lift * 0.4 * strength;
  jelly.head.rotation.z += 0.14 * strength;
  jelly.face.eyes[0]!.scale.y *= 1 - 0.3 * strength;
  jelly.face.mouth.scale.x *= 1 - 0.45 * strength;
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

/** Grübelt mit dem Zeigefinger am Kinn, lehnt den Kopf hinein und kneift die Augen schmal. */
function think(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const tap = Math.sin(phase * 6) * 0.02 * moving;
  const pose: HandPose = { at: [0.3, 0.06 + tap, 0.72], turn: [0, 0, 0.45], curl: [0, 0.9, 0.5] };
  poseHand(jelly, 1, pose, strength);
  jelly.head.rotation.z -= 0.12 * strength;
  for (const eye of jelly.face.eyes) eye.scale.y *= 1 - 0.3 * strength;
  jelly.face.mouth.scale.x *= 1 - 0.4 * strength;
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
