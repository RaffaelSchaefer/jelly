/**
 * Hält die Blobs des Studios und den Emote-Tropfen am Jelly: Projiziert Punkte auf dem Jelly je
 * Bild auf die Bühne und schreibt sie als CSS-Variablen dorthin. `studio.css` und `emotes.css`
 * lesen sie. Das läuft bewusst an React vorbei, sonst gäbe es 30 Renderdurchläufe pro Sekunde.
 *
 * @module
 */

import { BODY_BOTTOM, HAND, HEAD, type Jelly } from "@jelly/scene";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Vector3 } from "three";

import { CANVAS_OVERSCAN, projectToStage, type StudioRegionId } from "../pet";

/** Ein Punkt auf dem Jelly, relativ zu seinem Kopf oder zu seiner Wurzel. */
interface Anchor {
  of: "head" | "root";
  at: [number, number, number];
}

/** Wo die Blobs und das Namensschild sitzen, in Einheiten des Jellys. */
const ANCHORS: Record<StudioRegionId | "name" | "emote", Anchor> = {
  emote: { of: "root", at: [1.4, 0.4, 0.3] },
  kopf: { of: "head", at: [0, HEAD.radius + 0.1, 0] },
  gesicht: { of: "head", at: [0.5, -0.22, 0.35] },
  haende: { of: "root", at: [HAND.x + 0.1, HAND.y + 0.15, 0.3] },
  koerper: { of: "root", at: [0.62, -0.62, 0.7] },
  aura: { of: "root", at: [-HAND.x - 0.1, 0.35, 0.3] },
  farbe: { of: "root", at: [-0.62, -0.62, 0.7] },
  name: { of: "root", at: [0, BODY_BOTTOM - 0.12, 0] },
};

/** Wiederverwendet, damit das Projizieren je Bild keinen Speicher belegt. */
const point = new Vector3();

/**
 * Muss in `<Canvas>` nach dem Pet stehen, damit die Blobs Kamera und Pose desselben Bildes sehen.
 *
 * @param jelly - Das Jelly, an dem die Punkte hängen.
 * @param target - Bekommt die Variablen `--anchor-<id>-x` und `-y`, dazu `--studio-ready`.
 */
export default function StudioAnchors({
  jelly,
  target,
}: {
  jelly: Jelly;
  target: RefObject<HTMLElement | null>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const written = useRef(new Map<string, string>());

  // Jede neu gesetzte Variable lässt den Browser die Stile der ganzen Bühne neu berechnen.
  function write(style: CSSStyleDeclaration, name: string, value: string) {
    if (written.current.get(name) === value) return;
    written.current.set(name, value);
    style.setProperty(name, value);
  }

  // Steht die Uhr, bräuchten die Blobs sonst einen Anstoß für ihre erste Position.
  useEffect(() => invalidate(), [invalidate, size]);

  useFrame(({ camera }) => {
    const style = target.current?.style;
    if (!style) return;
    for (const [id, { of, at }] of Object.entries(ANCHORS)) {
      point.set(...at);
      jelly[of].localToWorld(point).project(camera);
      // In Pixeln auf der Bühne: Die Canvas ragt nach allen Seiten gleich weit darüber hinaus.
      const { x, y } = projectToStage(
        { x: point.x * CANVAS_OVERSCAN, y: point.y * CANVAS_OVERSCAN },
        { width: size.width / CANVAS_OVERSCAN, height: size.height / CANVAS_OVERSCAN },
      );
      write(style, `--anchor-${id}-x`, `${x.toFixed(1)}px`);
      write(style, `--anchor-${id}-y`, `${y.toFixed(1)}px`);
    }
    write(style, "--studio-ready", "1");
  });

  return null;
}
