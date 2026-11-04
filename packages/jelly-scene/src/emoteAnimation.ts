/**
 * Kurze Gesten auf der normalen Jelly-Pose. Jede Berechnung beginnt mit der Grundanimation.
 *
 * @module
 */

import { MathUtils, type MeshBasicMaterial, type Object3D } from "three";

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

/** Holt eine Hand aus ihrer Grundpose zum Ziel. */
function poseHand(hand: Object3D, target: [number, number, number], strength: number) {
  hand.visible = true;
  hand.position.set(
    MathUtils.lerp(hand.position.x, target[0], strength),
    MathUtils.lerp(hand.position.y, target[1], strength),
    MathUtils.lerp(hand.position.z, target[2], strength),
  );
  hand.scale.setScalar(MathUtils.lerp(hand.scale.x, 1, strength));
}

/** Eine Hand winkt seitlich neben dem Kopf. */
function wave(jelly: Jelly, { strength, phase, moving }: Gesture) {
  poseHand(jelly.hands[1]!, [1.05 + Math.sin(phase * 10) * 0.18 * moving, 0.8, 0.35], strength);
}

/** Körper und Hände wiegen sich gegeneinander. */
function dance(jelly: Jelly, { strength, phase, moving }: Gesture) {
  const sway = moving ? Math.sin(phase * 7) : 0.45;
  jelly.root.rotation.z += sway * 0.2 * strength;
  jelly.hands.forEach((hand, index) => {
    const side = index === 0 ? -1 : 1;
    poseHand(hand, [side * 1.05, 0.25 + side * sway * 0.3, 0.4], strength);
  });
}

/** Beide Hände hoch und ein kleiner Hüpfer. */
function cheer(jelly: Jelly, { strength, phase, moving }: Gesture) {
  jelly.root.position.y += Math.abs(Math.sin(phase * Math.PI * 2)) * 0.35 * moving * strength;
  jelly.hands.forEach((hand, index) => {
    poseHand(hand, [index === 0 ? -0.85 : 0.85, 1, 0.3], strength);
  });
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

/** Führt beide Hände vor dem Körper zusammen und errötet. */
function love(jelly: Jelly, { strength }: Gesture) {
  jelly.hands.forEach((hand, index) => {
    poseHand(hand, [index === 0 ? -0.15 : 0.15, 0.1, 0.68], strength);
  });
  smile(jelly, strength * 0.5);
  for (const cheek of jelly.face.cheeks) {
    cheek.visible = true;
    const material = cheek.material as MeshBasicMaterial;
    material.opacity = Math.max(material.opacity, strength * 0.65);
  }
}

/** Jede bekannte Geste hat genau eine Darstellung. */
const GESTURES: Record<EmoteKey, (jelly: Jelly, gesture: Gesture) => void> = {
  wave,
  dance,
  cheer,
  laugh,
  sleep,
  love,
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
