/**
 * Das Bild der Schimmer im Shop: ein weicher, runder Schein auf schwarzem Grund, einmal gemalt.
 * Additiv gemischt fügt Schwarz nichts hinzu, die Farbe gibt das Material.
 *
 * @module
 */

import { CanvasTexture, SRGBColorSpace } from "three";

/** Kantenlänge in Pixeln. Weich gezogen reicht das für jede Größe auf der Bühne. */
const SIZE = 64;

/** Malt den Schein: ein milder Kern, der weich ins Schwarz ausläuft und die Kugel nicht überstrahlt. */
export function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const paint = canvas.getContext("2d");
  if (paint) {
    const middle = SIZE / 2;
    const gradient = paint.createRadialGradient(middle, middle, 0, middle, middle, middle);
    gradient.addColorStop(0, "#c8c8c8");
    gradient.addColorStop(0.25, "#9a9a9a");
    gradient.addColorStop(0.5, "#4a4a4a");
    gradient.addColorStop(0.75, "#161616");
    gradient.addColorStop(1, "#000000");
    paint.fillStyle = "#000000";
    paint.fillRect(0, 0, SIZE, SIZE);
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, SIZE, SIZE);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
