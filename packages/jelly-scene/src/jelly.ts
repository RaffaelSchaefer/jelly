/**
 * Das ganze Jelly als Three.js-Objekt: Körper, Hände, Kopf und Gesicht, dazu die Animation pro
 * Bild.
 *
 * Client (React Three Fiber) und Server-Bühne (reines Three.js) bauen ihr Jelly hier. Innen gibt es
 * nur `Object3D` und keine `Group`: Three.js sortiert die Zeichenreihenfolge nach der nächsten
 * umschließenden `Group`, und die Bühne braucht das, um viele Jellies von hinten nach vorn zu zeichnen.
 *
 * @module
 */

import { Mesh, Object3D, type Material } from "three";

import type { JellyPalette } from "./colors.ts";

import { animateBody, animateFace, animateHands, startFrame, type Motion } from "./animation.ts";
import { createJellyBody } from "./body.ts";
import { createFace, type Face } from "./face.ts";
import { HAND, HEAD } from "./jellyGeometry.ts";

/** Linke und rechte Seite als Vorzeichen. Index 0 ist links. */
const SIDES = [-1, 1] as const;

/** Ein Jelly mit allen Teilen, die die Animation bewegt. */
export interface Jelly {
  /** Wurzel. Die Animation setzt ihre Höhe, Neigung und Größe, also nicht von außen bewegen. */
  root: Object3D;
  /** Kopf. Der Körper-Shader folgt seiner Lage. */
  head: Object3D;
  /** Die zwei Kugel-Hände, links zuerst. */
  hands: Object3D[];
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
}

/** Eine Hand, anfangs eingezogen und unsichtbar. */
function createHand(side: number) {
  const hand = new Object3D();
  hand.position.set(side * HAND.x, HAND.y, HAND.z);
  hand.scale.setScalar(0);
  hand.visible = false;
  return hand;
}

/** Baut ein Jelly in den Farben `palette`. Es steht mit der Körpermitte im Ursprung. */
export function createJelly(palette: JellyPalette): Jelly {
  const root = new Object3D();
  const hands = SIDES.map(createHand);
  const head = new Object3D();
  head.position.set(HEAD.x, HEAD.y, HEAD.z);
  const faceAnchor = new Object3D();
  faceAnchor.position.set(-HEAD.x, -HEAD.y, -HEAD.z);
  const face = createFace(palette.ink);
  faceAnchor.add(face.root);
  head.add(faceAnchor);
  // Körper, Kopf und Hände müssen Geschwister sein: der Shader liest ihre lokale Lage.
  root.add(createJellyBody(palette, { head, hands }), ...hands, head);
  return { root, head, hands, faceAnchor, face };
}

/** Bewegt das Jelly für ein Bild: Wippen, Hüpfen, Blinzeln, Strahlen und die Hände. */
export function animateJelly(jelly: Jelly, motion: Motion, input: JellyFrameInput): void {
  const frame = startFrame(motion, input);
  animateBody(jelly.root, jelly.head, frame);
  animateFace(jelly.face, motion, frame);
  animateHands(jelly.hands, motion, frame, input.holding);
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
