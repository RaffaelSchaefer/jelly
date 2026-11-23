/**
 * Projiziert die Trefferzonen am Kopf auf den Bildschirm, sobald ein Zeiger danach fragt. Kamera,
 * Pet-Größe und Wippen stimmen so von selbst. Entschieden wird in `pet/headZones.ts`.
 *
 * @module
 */

import type { Jelly } from "@jelly/scene";
import type { Object3D } from "three";

import { HEAD, headSurface } from "@jelly/scene/geometry";
import { useThree } from "@react-three/fiber";
import { useEffect, type RefObject } from "react";
import { Vector3 } from "three";

import { NOSE, type HeadProbe } from "../pet";

/** Wiederverwendet, damit das Projizieren nichts anlegt. */
const point = new Vector3();

/**
 * Muss in `<Canvas>` stehen. Legt in `probe` eine Abfrage ab, solange die Szene läuft.
 *
 * @param jelly - Das Jelly, an dessen Kopf die Zonen hängen.
 */
export default function TouchZones({
  jelly,
  probe,
}: {
  jelly: Jelly;
  probe: RefObject<HeadProbe | null>;
}) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    probe.current = () => {
      const rect = canvas.getBoundingClientRect();
      // Die Canvas ragt über den Knopf hinaus, ihre eigene Lage zählt.
      const onScreen = (part: Object3D, at: readonly [number, number, number]) => {
        part.localToWorld(point.set(...at)).project(camera);
        return {
          x: rect.left + ((point.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - point.y) / 2) * rect.height,
        };
      };
      const center = onScreen(jelly.head, [0, 0, 0]);
      const side = onScreen(jelly.head, [HEAD.radius, 0, 0]);
      return {
        center,
        // Wie die Teile des Gesichts in `face.ts`: im Halter des Gesichts, in Koordinaten des Jellys.
        nose: onScreen(jelly.faceAnchor, headSurface(NOSE.x, NOSE.y)),
        radius: Math.hypot(side.x - center.x, side.y - center.y),
      };
    };
    return () => {
      probe.current = null;
    };
  }, [jelly, camera, canvas, probe]);
  return null;
}
