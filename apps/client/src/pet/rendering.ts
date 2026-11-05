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
