/**
 * Die 3D-Bühne: transparente WebGL-Canvas mit Kamera und dem Pet darin.
 *
 * Wird in `App.tsx` per `lazy()` geladen, damit Three.js den ersten Start nicht bremst.
 *
 * @module
 */

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect } from "react";

import Character, { type CharacterProps } from "./Character";
import RenderBoundary from "./RenderBoundary";

/** Bildrate der Animation. Mehr braucht ein Desktop-Begleiter nicht. */
const FPS = 30;

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

/** Das Pet auf transparentem Hintergrund. Ohne WebGL erscheint ein Hinweis statt eines Fehlers. */
export default function PetScene(props: CharacterProps) {
  return (
    <RenderBoundary>
      <Canvas
        aria-hidden="true"
        camera={{ position: [0, 0.1, 5.8], fov: 34 }}
        // Pixeldichte deckeln, damit hochauflösende Displays nicht unnötig GPU kosten.
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        frameloop="demand"
        fallback={<p className="render-fallback">Dieser WebView unterstützt kein WebGL.</p>}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <AnimationClock paused={props.reducedMotion} />
        <Character {...props} />
      </Canvas>
    </RenderBoundary>
  );
}
