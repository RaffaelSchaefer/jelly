/**
 * Der Takt einer Szene mit `frameloop="demand"`: Pet, Duett und die Bühne des Shops zeichnen damit.
 *
 * @module
 */

import { createFramePacer } from "@jelly/stage/frame-pacing";
import { advance, useThree } from "@react-three/fiber";
import { useEffect } from "react";

/**
 * Taktet die Szene mit `frameLimit` Bildern pro Sekunde, solange das Fenster sichtbar ist. Sonst
 * zeichnet die Canvas mit `frameloop="demand"` nur, wenn sich etwas ändert.
 *
 * Zeichnet direkt mit `advance`: Ein `invalidate` aus diesem Takt käme erst im nächsten Bild an und
 * ließe 60 FPS auf einem 60-Hz-Bildschirm auf 30 fallen. Verborgen steht der Takt ganz. Ein
 * Fokusverlust hält ihn nicht an: Das Jelly lebt beim Spielen weiter.
 */
export default function AnimationClock({
  paused,
  frameLimit,
}: {
  paused: boolean;
  frameLimit: number | null;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const readState = useThree((state) => state.get);
  useEffect(() => {
    const pacer = createFramePacer(frameLimit);
    let frame = 0;
    function tick(now: number) {
      frame = requestAnimationFrame(tick);
      if (pacer.isDue(now)) advance(now, true, readState());
    }
    function sync() {
      cancelAnimationFrame(frame);
      if (document.hidden) return;
      // Auch bei stehender Uhr: Beim Wiederanzeigen soll sofort ein aktuelles Bild dastehen.
      invalidate();
      if (!paused) frame = requestAnimationFrame(tick);
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [paused, frameLimit, invalidate, readState]);
  return null;
}
