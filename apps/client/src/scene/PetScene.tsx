/**
 * Die 3D-Bühne: transparente WebGL-Canvas mit Kamera und dem Pet darin.
 *
 * Wird in `App.tsx` per `lazy()` geladen, damit Three.js den ersten Start nicht bremst.
 *
 * @module
 */

import type { Jelly } from "@jelly/scene";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useState, type RefObject } from "react";
import { MathUtils } from "three";

import { CANVAS_OVERSCAN, type StudioFocus } from "../pet";
import CameraRig from "./CameraRig";
import Character, { type CharacterProps } from "./Character";
import LiquidGlass from "./LiquidGlass";
import RenderBoundary from "./RenderBoundary";
import StudioAnchors from "./StudioAnchors";

/** Bildrate der Animation. Mehr braucht ein Desktop-Begleiter nicht. */
const FPS = 30;

/** Öffnungswinkel, auf den die Bühnengeometrie in `pet/layout.ts` abgestimmt ist. */
const STAGE_FOV = 34;

/** Derselbe Bildausschnitt in der größeren Canvas: Das Pet bleibt gleich groß und am selben Ort. */
const FOV = MathUtils.radToDeg(
  2 * Math.atan(Math.tan(MathUtils.degToRad(STAGE_FOV / 2)) * CANVAS_OVERSCAN),
);

/**
 * Die Canvas ragt über den anklickbaren Bereich hinaus, Klicks gehen an ihr vorbei. Fiber würde
 * sonst eine Position und volle Größe setzen.
 */
const OVERSCAN_STYLE = {
  position: "absolute",
  inset: `${((1 - CANVAS_OVERSCAN) / 2) * 100}%`,
  width: "auto",
  height: "auto",
  pointerEvents: "none",
} as const;

/**
 * Taktet die Szene mit {@link FPS} Bildern pro Sekunde, solange das Fenster sichtbar ist. Die Canvas
 * läuft mit `frameloop="demand"` und zeichnet nur, wenn dieser Takt es anstößt.
 */
function AnimationClock({ paused }: { paused: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, 1000 / FPS);
    return () => window.clearInterval(timer);
  }, [paused, invalidate]);
  return null;
}

/** Eigenschaften von {@link PetScene}. */
export interface PetSceneProps extends CharacterProps {
  /** Worauf die Kamera fährt. Ohne Wert steht sie in der Grundansicht. */
  focus?: StudioFocus | null;
  /** Element für die Anker des Studios. Ohne Element wird nichts projiziert. */
  anchors?: RefObject<HTMLElement | null>;
}

/** Das Pet auf transparentem Hintergrund. Ohne WebGL erscheint ein Hinweis statt eines Fehlers. */
export default function PetScene({ focus = null, anchors, ...character }: PetSceneProps) {
  const [jelly, setJelly] = useState<Jelly | null>(null);
  return (
    <RenderBoundary>
      <Canvas
        aria-hidden="true"
        camera={{ position: [0, 0.1, 5.8], fov: FOV }}
        style={OVERSCAN_STYLE}
        // Pixeldichte deckeln, damit hochauflösende Displays nicht unnötig GPU kosten.
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        frameloop="demand"
        fallback={<p className="render-fallback">Dieser WebView unterstützt kein WebGL.</p>}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <AnimationClock paused={character.reducedMotion} />
        <CameraRig focus={focus} reducedMotion={character.reducedMotion} />
        <Character {...character} onJelly={setJelly} />
        {anchors && jelly ? <StudioAnchors jelly={jelly} target={anchors} /> : null}
        <LiquidGlass
          color={character.color}
          anchors={anchors}
          reducedMotion={character.reducedMotion}
        />
      </Canvas>
    </RenderBoundary>
  );
}
