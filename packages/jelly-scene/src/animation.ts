/**
 * Die Bewegungsrechnung pro Bild: Wippen, Hüpfen, Blinzeln, Strahlen und die Hände.
 *
 * Reine Funktionen ohne React. `animateJelly` in `jelly.ts` ruft sie pro Bild auf und reicht die
 * Three.js-Objekte herein. Der Zustand zwischen zwei Bildern liegt in {@link Motion}.
 *
 * @module
 */

import { MathUtils, type Mesh, type MeshBasicMaterial, type Object3D } from "three";

import { HAND, HEAD } from "./jellyGeometry.ts";

/** Wie lange die Hände nach einem Stupser oder einer Aktion draußen bleiben, in Sekunden. */
const HANDS_OUT_SECONDS = 1.6;

/** Zustand der Animation zwischen zwei Bildern. Zeiten in Sekunden der Szenenuhr. */
export interface Motion {
  /** Zuletzt gesehener `pulse`-Wert. Ändert er sich, wurde gestupst. */
  pulse: number;
  /** 1 direkt nach einem Stupser, klingt dann auf 0 ab. */
  bounce: number;
  /** Zeitpunkt des letzten Stupsers. */
  pokedAt: number;
  /** Wie weit die Hände draußen sind: 0 = versteckt, 1 = ganz draußen, kurz darüber beim Federn. */
  hands: number;
  /** Geschwindigkeit der Hand-Feder. */
  handsSpeed: number;
  /** Beginn des letzten Blinzelns. */
  blinkAt: number;
  /** Wann das nächste Blinzeln beginnt. */
  nextBlink: number;
}

/** Was jedes Teil der Animation in diesem Bild braucht. */
export interface Frame {
  /** Zeit der Szenenuhr in Sekunden. */
  time: number;
  /** Zeit seit dem letzten Bild, gedeckelt, damit ein verborgenes Fenster keinen Sprung macht. */
  delta: number;
  /** 0 bei reduzierter Bewegung, sonst 1. Skaliert alle Bewegungen. */
  motion: number;
  /** Hüpfer nach einem Stupser, mit `motion` skaliert. */
  bounce: number;
  /** Freude nach einem Stupser, auch bei reduzierter Bewegung (Gesicht statt Hüpfen). */
  happy: number;
}

/** Die Gesichtsteile, die {@link animateFace} bewegt. */
export interface FaceParts {
  eyes: Object3D[];
  cheeks: Mesh[];
  mouth: Mesh;
}

/** Startzustand. Das erste Blinzeln kommt nach 2 s. */
export function createMotion(pulse: number): Motion {
  return { pulse, bounce: 0, pokedAt: -10, hands: 0, handsSpeed: 0, blinkAt: -1, nextBlink: 2 };
}

/** Erkennt einen neuen Stupser, lässt den Hüpfer abklingen und baut den {@link Frame}. */
export function startFrame(
  s: Motion,
  input: { time: number; rawDelta: number; pulse: number; reducedMotion: boolean },
): Frame {
  const delta = Math.min(input.rawDelta, 0.1);
  if (s.pulse !== input.pulse) {
    s.pulse = input.pulse;
    s.bounce = 1;
    s.pokedAt = input.time;
  }
  s.bounce = MathUtils.damp(s.bounce, 0, 5, delta);
  const motion = input.reducedMotion ? 0 : 1;
  return { time: input.time, delta, motion, bounce: s.bounce * motion, happy: s.bounce };
}

/** Körper: sanftes Wippen und Schwanken, beim Stupsen Stauchen und Hüpfen. Der Kopf folgt verzögert. */
export function animateBody(root: Object3D, head: Object3D, { time, motion, bounce }: Frame) {
  const breathe = Math.sin(time * 1.9) * 0.015 * motion;
  root.position.y = (Math.sin(time * 1.9) * 0.04 + bounce * 0.28) * motion;
  root.rotation.z = Math.sin(time * 1.3) * 0.03 * motion;
  root.scale.set(
    1 + bounce * 0.1 - breathe,
    1 - bounce * 0.13 + breathe,
    1 + bounce * 0.1 - breathe,
  );
  // Der Kopf wippt einen Takt hinter dem Körper und neigt sich ein wenig.
  head.position.set(
    HEAD.x,
    HEAD.y + (Math.sin(time * 1.9 - 0.6) * 0.018 + bounce * 0.05) * motion,
    HEAD.z,
  );
  head.rotation.set(0, 0, Math.sin(time * 0.9) * 0.04 * motion);
}

/** Ab und zu blinzeln. Nach einem Stupser glücklich zukneifen, strahlen und erröten. */
export function animateFace({ eyes, cheeks, mouth }: FaceParts, s: Motion, { time, happy }: Frame) {
  if (time > s.nextBlink) {
    s.blinkAt = time;
    s.nextBlink = time + 2.4 + Math.random() * 3.5;
  }
  // Ein Blinzeln dauert 0,16 s: Sinusbogen von offen über zu wieder auf.
  const phase = (time - s.blinkAt) / 0.16;
  const blink = phase >= 0 && phase <= 1 ? Math.sin(phase * Math.PI) : 0;
  for (const eye of eyes) {
    eye.scale.set(1 + happy * 0.05, Math.max(0.08, 1 - blink * 0.92 - happy * 0.35), 1);
  }
  for (const cheek of cheeks) {
    (cheek.material as MeshBasicMaterial).opacity = 0.5 * happy;
    // Unsichtbare Wangen werden gar nicht erst gezeichnet.
    cheek.visible = happy > 0.01;
  }
  mouth.scale.set(1 + happy * 0.35, 0.65 + happy * 0.4, 1);
}

/** Feder für die Hände: schnell und federnd heraus, zügig wieder weg. */
function springHands(s: Motion, wanted: number, { delta, motion }: Frame) {
  if (motion === 0) {
    s.hands = wanted;
    s.handsSpeed = 0;
    return;
  }
  s.handsSpeed += (wanted - s.hands) * 190 * delta;
  s.handsSpeed *= Math.exp(-(wanted ? 13 : 20) * delta);
  s.hands += s.handsSpeed * delta;
}

/**
 * Die Kugel-Hände kommen nur heraus, wenn er sie braucht: als Reaktion auf einen Stupser oder eine
 * Aktion, oder wenn er etwas hält (`holding`).
 */
export function animateHands(hands: Object3D[], s: Motion, frame: Frame, holding: boolean) {
  const wanted = holding || frame.time - s.pokedAt < HANDS_OUT_SECONDS ? 1 : 0;
  springHands(s, wanted, frame);
  const out = Math.max(0, s.hands);
  hands.forEach((hand, index) => {
    hand.visible = out > 0.02;
    // Auch versteckte Hände zurücksetzen: Eine Emote-Geste kann sie gleich wieder hervorholen.
    const side = index === 0 ? -1 : 1;
    const float = Math.sin(frame.time * 2.2 + index * 1.7) * 0.045 * frame.motion;
    // Sie kommen seitlich aus dem Körper und fliegen beim Stupsen jubelnd nach oben.
    hand.position.set(
      side * (MathUtils.lerp(0.6, HAND.x, Math.min(out, 1.2)) + frame.bounce * 0.14),
      HAND.y + (float + frame.bounce * 0.55) * Math.min(out, 1),
      HAND.z,
    );
    hand.scale.setScalar(out);
  });
}
