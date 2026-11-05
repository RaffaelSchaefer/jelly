/**
 * Fährt die Kamera weich an die Region, die im Studio offen ist, und danach wieder zurück.
 *
 * @module
 */

import { HAND, HEAD } from "@jelly/scene";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3, type Camera } from "three";

import { CANVAS_OVERSCAN, stageLayout, type StudioFocus } from "../pet";

/** Standort und Blickziel der Kamera. */
type Shot = { position: Vector3; look: Vector3 };

/** Die Grundansicht. Muss zu `camera` in `PetScene.tsx` passen, Fiber blickt dort auf den Ursprung. */
const DEFAULT_SHOT: Shot = { position: new Vector3(0, 0.1, 5.8), look: new Vector3(0, 0, 0) };

/** Die Ansicht je Region. Die Kamera steht meist etwas seitlich, damit es nach Raum aussieht. */
const SHOTS: Record<StudioFocus, Shot> = {
  head: { position: new Vector3(0.35, 0.9, 3.6), look: new Vector3(0, HEAD.y, HEAD.z) },
  face: { position: new Vector3(0.3, 0.7, 3.2), look: new Vector3(0.15, HEAD.y - 0.05, HEAD.z) },
  body: { position: new Vector3(0, -0.2, 6.2), look: new Vector3(0, -0.3, 0) },
  hands: { position: new Vector3(-0.3, 0.2, 5.7), look: new Vector3(0.1, HAND.y + 0.2, HAND.z) },
  aura: { position: new Vector3(-0.5, 0.2, 6.3), look: new Vector3(0.2, -0.1, 0) },
};

/** Breite der Canvas bei 100 %, auf die die Ansichten abgestimmt sind. */
const BASE_WIDTH = stageLayout(100).canvas.width * CANVAS_OVERSCAN;

/** Abstand zur Grundansicht, ab dem die Kamera noch unterwegs ist. */
const AWAY_DISTANCE = 0.01;

/** Ob die Kamera gerade nicht in der Grundansicht steht. */
export function cameraAway(camera: Camera) {
  return camera.position.distanceTo(DEFAULT_SHOT.position) > AWAY_DISTANCE;
}

/** Wiederverwendet, damit die Kamerafahrt je Bild keinen Speicher belegt. */
const goal = new Vector3();

/** Wie schnell die Kamera nachzieht, pro Sekunde. */
const EASE_SPEED = 3;

/** Längster Zeitschritt, damit die Kamera nach einer Pause nicht springt. Reicht für 5 FPS. */
const MAX_DELTA = 0.25;

/**
 * Bewegt die Szenenkamera. Muss in `<Canvas>` vor dem Pet stehen, damit die Anker im selben Bild
 * die neue Kamera sehen. Bei reduzierter Bewegung springt sie, die Uhr steht dann ohnehin.
 */
export default function CameraRig({
  focus,
  reducedMotion,
}: {
  focus: StudioFocus | null;
  reducedMotion: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const look = useRef(DEFAULT_SHOT.look.clone());

  // Ohne laufende Uhr bräuchte der Sprung sonst einen Anstoß von außen.
  useEffect(() => invalidate(), [focus, reducedMotion, invalidate]);

  useFrame(({ camera, size }, delta) => {
    const shot = focus ? SHOTS[focus] : DEFAULT_SHOT;
    const step = reducedMotion ? 1 : 1 - Math.exp(-EASE_SPEED * Math.min(delta, MAX_DELTA));
    goal.copy(shot.position);
    // Ein großes Pet hat eine breitere Canvas. Gleich nah würde der Kopf das Fenster sprengen.
    if (goal.z < DEFAULT_SHOT.position.z) goal.z *= Math.max(1, size.width / BASE_WIDTH);
    camera.position.lerp(goal, step);
    look.current.lerp(shot.look, step);
    camera.lookAt(look.current);
    // Fiber frischt die Matrix erst beim Zeichnen auf, die Anker projizieren aber vorher.
    camera.updateMatrixWorld();
  });

  return null;
}
