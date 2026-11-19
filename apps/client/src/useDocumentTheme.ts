/**
 * Farbe, Bewegung und Darstellung als Attribute auf `<html>`, für Pet- und Shop-Fenster. Das CSS
 * liest sie.
 *
 * @module
 */

import { useEffect } from "react";

import type { Me } from "./pet";

/**
 * Ob das Betriebssystem reduzierte Bewegung wünscht. Gilt, solange die Einstellung im Pet nicht
 * gesetzt ist.
 */
export const OS_REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Legt Pet-Farbe, reduzierte Bewegung und den optimierten Modus als Attribute auf `<html>`. */
export function useDocumentTheme(color: Me["color"], reducedMotion: boolean, optimized: boolean) {
  // Das UI-Theme (Akzent, Panels, Sprechblase) folgt der Farbe des Pets.
  useEffect(() => {
    document.documentElement.dataset.petColor = color;
  }, [color]);

  // CSS-Animationen sehen die Einstellung und das Betriebssystem an einem Attribut.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduced-motion", reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.toggleAttribute("data-optimized-rendering", optimized);
  }, [optimized]);
}
