/**
 * Das ganze Jelly als Three.js-Objekt: Körper, Hände, Kopf und Gesicht, dazu die Animation pro
 * Bild.
 *
 * Client (React Three Fiber) und Server-Bühne (reines Three.js) bauen ihr Jelly hier. Innen gibt es
 * nur `Object3D` und keine `Group`: Three.js sortiert die Zeichenreihenfolge nach der nächsten
 * umschließenden `Group`, und die Bühne braucht das, um viele Jellies von hinten nach vorn zu
 * zeichnen.
 *
 * @module
 */

import { Mesh, Object3D, Vector3, type Material } from "three";

import type { JellyPalette } from "./colors.ts";
import type { EmoteFrame } from "./emotes.ts";

import { animateBody, animateFace, animateHands, startFrame, type Motion } from "./animation.ts";
import { createJellyBody, type JellyQuality } from "./body.ts";
import { animateEmote } from "./emoteAnimation.ts";
import { createFace, type Face } from "./face.ts";
import { BOARD_HOLD, type Hold } from "./held.ts";
import { HAND, HEAD } from "./jellyGeometry.ts";
import { animateMouth, type MouthFrame } from "./mouthShapes.ts";
import { animateTouch, type TouchFrame } from "./touch.ts";

/** Linke und rechte Seite als Vorzeichen. Index 0 ist links. */
const SIDES = [-1, 1] as const;

/** Ein Jelly mit allen Teilen, die die Animation bewegt. */
export interface Jelly {
  /** Wurzel. Die Animation setzt ihre Höhe, Neigung und Größe, also nicht von außen bewegen. */
  root: Object3D;
  /** Kopf. Der Körper-Shader folgt seiner Lage. */
  head: Object3D;
  /** Die zwei Hände, links zuerst. Der Shader liest Lage, Drehung und Größe. */
  hands: Object3D[];
  /**
   * Je Hand, wie weit Zeigefinger (x), übrige Finger (y) und Daumen (z) gebeugt sind: 0 offen, 1
   * Faust.
   */
  curls: Vector3[];
  /** Hängt im Kopf, aber in Koordinaten des Jellys. Kopf-Cosmetics gehören hier hinein. */
  faceAnchor: Object3D;
  /** Augen, Wangen und Mund. */
  face: Face;
}

/** Was {@link animateJelly} pro Bild braucht. */
export interface JellyFrameInput {
  /** Zeit der Szenenuhr in Sekunden. */
  time: number;
  /** Zeit seit dem letzten Bild in Sekunden. */
  rawDelta: number;
  /** Zähler, der bei jeder belohnten Aktion steigt. Jede Änderung löst einen Hüpfer aus. */
  pulse: number;
  /** Bewegung auf das Nötigste reduzieren. */
  reducedMotion: boolean;
  /** Hält er gerade etwas? Dann bleiben die Hände draußen. */
  holding: boolean;
  /** Wie er es hält, ohne Angabe wie eine Tafel ({@link BOARD_HOLD}). */
  hold?: Hold;
  /** Aktuelle Geste, mit Laufzeit in Sekunden. Ohne Wert gilt die normale Pose. */
  emote?: EmoteFrame;
  /** Was der Mund gerade formt. Ohne Wert lächelt das Jelly. */
  mouth?: MouthFrame;
  /** Berührungen, nur am eigenen Jelly der App. Ohne Wert bleibt es bei der Grundpose. */
  touch?: TouchFrame;
}

/** Eine Hand, anfangs eingezogen und unsichtbar. */
function createHand(side: number) {
  const hand = new Object3D();
  hand.position.set(side * HAND.x, HAND.y, HAND.z);
  hand.scale.setScalar(0);
  hand.visible = false;
  return hand;
}

/**
 * Baut ein Jelly in den Farben `palette`. Es steht mit der Körpermitte im Ursprung.
 *
 * @param quality - Welchen Körper-Shader es bekommt. Form, Gesicht und Animation bleiben dieselben.
 */
export function createJelly(palette: JellyPalette, quality: JellyQuality = "full"): Jelly {
  const root = new Object3D();
  const hands = SIDES.map(createHand);
  const curls = SIDES.map(() => new Vector3());
  const head = new Object3D();
  head.position.set(HEAD.x, HEAD.y, HEAD.z);
  const faceAnchor = new Object3D();
  faceAnchor.position.set(-HEAD.x, -HEAD.y, -HEAD.z);
  const face = createFace(palette.ink);
  faceAnchor.add(face.root);
  head.add(faceAnchor);
  // Körper, Kopf und Hände müssen Geschwister sein: der Shader liest ihre lokale Lage.
  root.add(createJellyBody(palette, { head, hands, curls }, quality), ...hands, head);
  return { root, head, hands, curls, faceAnchor, face };
}

/** Bewegt das Jelly für ein Bild: Wippen, Hüpfen, Blinzeln, Strahlen und die Hände. */
export function animateJelly(jelly: Jelly, motion: Motion, input: JellyFrameInput): void {
  const frame = startFrame(motion, input);
  animateBody(jelly.root, jelly.head, frame);
  animateFace(jelly.face, motion, frame);
  animateHands(jelly, motion, frame, input.holding ? (input.hold ?? BOARD_HOLD) : null);
  if (input.touch) animateTouch(jelly, motion, input.touch, frame);
  if (input.emote) animateEmote(jelly, input.emote, input.reducedMotion);
  animateMouth(jelly, input.mouth);
}

/** Gibt die Materialien des Jellys frei. Die Geometrien teilen sich alle Jellies und bleiben. */
export function disposeJelly(jelly: Jelly): void {
  jelly.root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) material.dispose();
  });
}
