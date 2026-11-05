/**
 * Malt die Vorderseite der Schild-Tafel in eine Canvas-Textur: helles Holz, feiner Rand und Text.
 *
 * Grundton, Rand und Tinte haben dieselben Farben wie das Schild auf der Bühne des Servers.
 *
 * @module
 */

import { CanvasTexture, SRGBColorSpace } from "three";

import { fitSignLines } from "../pet";

/** Größe der Textur in Pixeln. Ihr Seitenverhältnis gibt auch der Tafel ihre Form. */
export const SIGN_TEXTURE = { width: 512, height: 172 } as const;

/** Oben etwas heller als der Grundton, unten etwas satter: Die Tafel wirkt gewölbt. */
const PAPER_STOPS = [
  [0, "#fffbea"],
  [0.5, "#fff3c9"],
  [1, "#f7e3a8"],
] as const;
const PAPER_EDGE = "rgba(120, 92, 20, 0.35)";
const PAPER_INK = "#3b2f0f";

/** Abstand und Ecken des feinen Rands innerhalb der Tafel, in Pixeln der Textur. */
const EDGE = { inset: 13, radius: 22, width: 3 };

/** Maserung: lange, leicht wellige Linien, dazwischen immer wieder eine kräftigere. */
const GRAIN = { color: "rgba(146, 100, 36, 0.17)", lines: 11, step: 14, thin: 1.6, thick: 3 };

/** Wie stark die Linien wellen, in Pixeln der Textur. */
const GRAIN_WAVE = 2.6;

/** Der Astknoten rechts unten, wo der Text selten hinreicht. Die Linien weichen ihm aus. */
const KNOT = {
  x: 414,
  y: 128,
  radiusX: 15,
  radiusY: 5.5,
  rings: 3,
  reachX: 66,
  reachY: 24,
  push: 13,
};

/** Runde Schrift, wo es sie gibt. Sonst die der Oberfläche. */
const FONT_FAMILY =
  'ui-rounded, "SF Pro Rounded", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';

/** Größe, bei der die Schrift vermessen wird. `fitSignLines` rechnet von da aus. */
const MEASURE_SIZE = 100;

/** Zeilenabstand im Verhältnis zur Schriftgröße. */
const LINE_HEIGHT = 1.12;

/** Setzt die Schrift der Tafel. */
function useFont(context: CanvasRenderingContext2D, size: number) {
  context.font = `700 ${size}px ${FONT_FAMILY}`;
}

/**
 * Höhe von Maserungslinie Nummer `line` an der Stelle `x`. Gerechnet statt zufällig: Jede Tafel
 * gleicht der anderen.
 */
function grainY(baseY: number, x: number, line: number) {
  const wave = Math.sin(x * 0.011 + line * 1.9) + 0.5 * Math.sin(x * 0.027 + line * 0.7);
  const fromKnotX = (x - KNOT.x) / KNOT.reachX;
  const fromKnotY = (baseY - KNOT.y) / KNOT.reachY;
  const aside = Math.exp(-fromKnotX * fromKnotX - fromKnotY * fromKnotY) * KNOT.push;
  return baseY + wave * GRAIN_WAVE + (fromKnotY < 0 ? -aside : aside);
}

/** Zieht die Maserung und den Astknoten. */
function paintGrain(context: CanvasRenderingContext2D) {
  const { width, height } = SIGN_TEXTURE;
  context.strokeStyle = GRAIN.color;
  context.lineCap = "round";
  for (let line = 0; line < GRAIN.lines; line++) {
    const baseY = ((line + 0.5) * height) / GRAIN.lines;
    context.lineWidth = line % 3 === 0 ? GRAIN.thick : GRAIN.thin;
    context.beginPath();
    for (let x = 0; x <= width + GRAIN.step; x += GRAIN.step) {
      context.lineTo(x, grainY(baseY, x, line));
    }
    context.stroke();
  }
  context.lineWidth = GRAIN.thin;
  for (let ring = 1; ring <= KNOT.rings; ring++) {
    const share = ring / KNOT.rings;
    context.beginPath();
    context.ellipse(KNOT.x, KNOT.y, KNOT.radiusX * share, KNOT.radiusY * share, 0, 0, Math.PI * 2);
    context.stroke();
  }
}

/** Füllt die Tafel mit hellem Holz und zieht den feinen Rand. */
function paintPaper(context: CanvasRenderingContext2D) {
  const { width, height } = SIGN_TEXTURE;
  const paper = context.createLinearGradient(0, 0, 0, height);
  for (const [stop, color] of PAPER_STOPS) paper.addColorStop(stop, color);
  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
  paintGrain(context);
  context.strokeStyle = PAPER_EDGE;
  context.lineWidth = EDGE.width;
  context.beginPath();
  context.roundRect(
    EDGE.inset,
    EDGE.inset,
    width - 2 * EDGE.inset,
    height - 2 * EDGE.inset,
    EDGE.radius,
  );
  context.stroke();
}

/** Schreibt `label` mittig auf die Tafel. */
function paintText(context: CanvasRenderingContext2D, label: string) {
  useFont(context, MEASURE_SIZE);
  const { lines, size } = fitSignLines(label, (text) => context.measureText(text).width);
  useFont(context, size);
  context.fillStyle = PAPER_INK;
  context.textAlign = "center";
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    const offset = (index - (lines.length - 1) / 2) * size * LINE_HEIGHT;
    context.fillText(line, SIGN_TEXTURE.width / 2, SIGN_TEXTURE.height / 2 + offset);
  });
}

/** Die Textur der Tafel und die Funktion, die einen neuen Text darauf malt. */
export function createSignTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = SIGN_TEXTURE.width;
  canvas.height = SIGN_TEXTURE.height;
  const context = canvas.getContext("2d");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return {
    texture,
    paint(label: string) {
      if (!context) return;
      paintPaper(context);
      paintText(context, label);
      texture.needsUpdate = true;
    },
  };
}
