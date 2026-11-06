/**
 * Wie aufwendig die Szene zeichnet. Der Schalter „Optimierter Modus“ wählt eines der beiden
 * Profile.
 *
 * @module
 */

import type { JellyQuality } from "@jelly/scene";

/** Die Hebel der Szene. Einzeln gesetzt misst `scripts/render-check.mjs` ihren jeweiligen Beitrag. */
export interface RenderProfile {
  /** Welchen Körper-Shader die Jellies bekommen. */
  quality: JellyQuality;
  /** Ob der Glas-Shader über die fertige Canvas läuft. */
  glass: boolean;
  /** Pixeldichte der Canvas: fest oder als Bereich `[min, max]`. */
  dpr: number | [number, number];
}

/** Die volle Darstellung mit Glas und Lichtbrechung. */
export const FULL_RENDERING: RenderProfile = { quality: "full", glass: true, dpr: [1, 1.5] };

/** Weniger Arbeit pro Bild. Das Glas fällt ganz weg, `optimized.css` gibt dem DOM eigene Flächen. */
export const OPTIMIZED_RENDERING: RenderProfile = { quality: "optimized", glass: false, dpr: 1 };

/** Ab wann ein Gerät beim Einstieg als zu langsam für die volle Darstellung gilt. */
const SLOW_FRAMES = {
  /** So lange zählt nichts nach dem Start oder einer Pause: Dort kompilieren etwa die Shader. */
  settleMs: 1000,
  /** Länge eines Messfensters. */
  windowMs: 1000,
  /** Darunter ist ein Fenster langsam. Der Standard des Bildraten-Reglers liegt bei 30. */
  minFps: 20,
  /** So viele langsame Fenster in Folge reichen. Ein einzelner Hänger bleibt so folgenlos. */
  strikes: 2,
  /**
   * Eine längere Lücke ist eine Pause, etwa ein verdecktes Fenster, und kein langsames Bild.
   *
   * Ponytail: Ein Gerät unter 0,33 FPS sieht deshalb nie langsam aus. Dort hilft auch der
   * optimierte Modus nicht mehr.
   */
  pauseMs: 3000,
};

/**
 * Misst, ob das Gerät hinterherkommt.
 *
 * @returns Bekommt je Bildschirmaktualisierung die Zeit in Millisekunden. Liefert `true`, sobald
 *   das Gerät zu langsam ist, und zählt danach von vorn: So lässt sich ein gescheitertes Umschalten
 *   beim nächsten Mal nachholen.
 */
export function createSlowFrameMeter() {
  let last = Number.NEGATIVE_INFINITY;
  let windowStart = 0;
  let frames = 0;
  let strikes = 0;
  return (now: number) => {
    const paused = now - last > SLOW_FRAMES.pauseMs;
    last = now;
    if (paused) {
      windowStart = now + SLOW_FRAMES.settleMs;
      frames = 0;
      strikes = 0;
      return false;
    }
    if (now < windowStart) return false;
    frames += 1;
    const elapsed = now - windowStart;
    if (elapsed < SLOW_FRAMES.windowMs) return false;
    strikes = (frames * 1000) / elapsed < SLOW_FRAMES.minFps ? strikes + 1 : 0;
    windowStart = now;
    frames = 0;
    if (strikes < SLOW_FRAMES.strikes) return false;
    strikes = 0;
    return true;
  };
}
