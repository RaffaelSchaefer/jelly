/**
 * Was die Funken-Canvas malt: ein Atlas aus weichem Schein, Stern mit vier Zacken und Münze in den
 * fünf Farben, einmal gemalt, dazu Blitz, Schockring, Schein und Lichtsäule. Je Funke ist das ein
 * einziges `drawImage`, ohne Verlauf pro Funke.
 *
 * Stern und Münze folgen den Symbolen `spark` und `coin` aus `ui/Icon.tsx`.
 *
 * @module
 */

import type { FxSprite, FxTint, Point, ShapeSpec, SparkSpec } from "../../pet/sparks";

import { coinFlip } from "../../pet/sparks";

/** Die festen Farben der Funken, `glow` kommt vom Jelly. */
export const FX_COLORS: Readonly<Record<Exclude<FxTint, "glow">, string>> = {
  gold: "#ffd76a",
  white: "#fff6d8",
  cyan: "#9fe8ff",
  violet: "#c7a4ff",
};

/** Kantenlänge einer Zelle im Atlas, in Pixeln. */
const CELL = 64;

/** Reihenfolge der Bilder (Spalten) und Farben (Zeilen). */
const SPRITES: readonly FxSprite[] = ["glow", "star", "coin"];
const TINTS: readonly FxTint[] = ["gold", "white", "cyan", "violet", "glow"];

/** Der Stern mit vier Zacken aus `ui/Icon.tsx` (`spark`), im Raster 24 × 24. */
const STAR_PATH = "m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z";

/** Der Ring der Münze aus `ui/Icon.tsx` (`coin`), im Raster 24 × 24. */
const COIN_PATH =
  "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm0 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z";

/** Eine Farbe mit Deckkraft als CSS. */
function withAlpha(hex: string, alpha: number) {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return `rgb(${value >> 16} ${(value >> 8) & 255} ${value & 255} / ${alpha})`;
}

/** Ein weicher, runder Schein mit hellem Kern. */
function paintGlow(context: CanvasRenderingContext2D, color: string, strength = 1) {
  const middle = CELL / 2;
  const gradient = context.createRadialGradient(middle, middle, 0, middle, middle, middle);
  gradient.addColorStop(0, withAlpha("#ffffff", strength));
  gradient.addColorStop(0.18, withAlpha(color, 0.9 * strength));
  gradient.addColorStop(0.5, withAlpha(color, 0.28 * strength));
  gradient.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, CELL, CELL);
}

/** Ein Symbol aus dem Raster 24 × 24, auf die Zelle gezogen. */
function paintIcon(context: CanvasRenderingContext2D, path: string, fill: string) {
  context.save();
  context.translate(CELL * 0.1, CELL * 0.1);
  context.scale((CELL * 0.8) / 24, (CELL * 0.8) / 24);
  context.fillStyle = fill;
  context.fill(new Path2D(path), "evenodd");
  context.restore();
}

/** Ein Stern über einem schwächeren Schein. */
function paintStar(context: CanvasRenderingContext2D, color: string) {
  paintGlow(context, color, 0.45);
  paintIcon(context, STAR_PATH, color);
  paintIcon(context, STAR_PATH, withAlpha("#ffffff", 0.55));
}

/** Eine Münze: volle Scheibe, geprägter Ring, ein Glanzpunkt. */
function paintCoin(context: CanvasRenderingContext2D, color: string) {
  const middle = CELL / 2;
  context.beginPath();
  context.arc(middle, middle, CELL * 0.4, 0, 2 * Math.PI);
  context.fillStyle = color;
  context.fill();
  paintIcon(context, COIN_PATH, "rgb(110 70 10 / 0.55)");
  context.beginPath();
  context.arc(middle - CELL * 0.12, middle - CELL * 0.13, CELL * 0.07, 0, 2 * Math.PI);
  context.fillStyle = "rgb(255 255 240 / 0.85)";
  context.fill();
}

/** Malt eine Zelle. */
function paintCell(context: CanvasRenderingContext2D, sprite: FxSprite, color: string) {
  if (sprite === "glow") paintGlow(context, color);
  else if (sprite === "star") paintStar(context, color);
  else paintCoin(context, color);
}

/** Wo ein Funke auf der Canvas landet: Mitte, Breite, Höhe und Deckkraft. */
export interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
}

/**
 * Wo und wie ein Funke beim Anteil `t` seines Lebens erscheint: Er verblasst (oder blendet ein und
 * aus) und schrumpft, eine Münze dreht sich.
 */
export function placeSpark(spark: Point & { spec: SparkSpec }, t: number): Placement {
  const { spec } = spark;
  const alpha = spec.flip ? 1 : spec.fade === "inOut" ? Math.sin(Math.PI * t) : 1 - t * t;
  const size = spec.size * (spec.path ? 1 : 1 - 0.35 * t);
  const width = spec.flip ? size * coinFlip(t) : size;
  return { x: spark.x, y: spark.y, width, height: size, alpha };
}

/** Der gemalte Atlas. */
export interface FxAtlas {
  /** Malt die Zeile `glow` in der Leuchtfarbe des Kunden neu. */
  setGlow: (color: string) => void;
  /** Die CSS-Farbe einer Tönung. */
  color: (tint: FxTint) => string;
  /** Zeichnet ein Bild des Atlas. */
  draw: (
    context: CanvasRenderingContext2D,
    look: { sprite: FxSprite; tint: FxTint },
    at: Placement,
  ) => void;
}

/** Malt den Atlas einmal, mit `glow` als Leuchtfarbe des Kunden. */
export function createFxAtlas(glow: string): FxAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = CELL * SPRITES.length;
  canvas.height = CELL * TINTS.length;
  const paint = canvas.getContext("2d");
  const colors = { ...FX_COLORS, glow };
  function paintRow(tint: FxTint) {
    if (!paint) return;
    const row = TINTS.indexOf(tint) * CELL;
    paint.clearRect(0, row, canvas.width, CELL);
    SPRITES.forEach((sprite, column) => {
      paint.save();
      paint.translate(column * CELL, row);
      paintCell(paint, sprite, colors[tint]);
      paint.restore();
    });
  }
  TINTS.forEach(paintRow);
  return {
    setGlow(color) {
      if (color === colors.glow) return;
      colors.glow = color;
      paintRow("glow");
    },
    color: (tint) => colors[tint],
    draw(context, { sprite, tint }, { x, y, width, height, alpha }) {
      if (alpha <= 0 || width <= 0 || height <= 0) return;
      context.globalAlpha = Math.min(1, alpha);
      const sx = SPRITES.indexOf(sprite) * CELL;
      const sy = TINTS.indexOf(tint) * CELL;
      context.drawImage(canvas, sx, sy, CELL, CELL, x - width / 2, y - height / 2, width, height);
    },
  };
}

/** Eine laufende Form. Die Lichtsäule malt sich beim ersten Bild einmal vor. */
export interface LiveShape {
  spec: ShapeSpec;
  born: number;
  painted?: HTMLCanvasElement | null;
}

/** Die Lichtsäule als Bild: in der Mitte hell, zu den Seiten und nach oben weich verlaufend. */
function paintPillar(width: number, height: number, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) return null;
  const across = context.createLinearGradient(0, 0, canvas.width, 0);
  across.addColorStop(0, withAlpha(color, 0));
  across.addColorStop(0.3, withAlpha(color, 0.45));
  across.addColorStop(0.5, withAlpha("#fff6d8", 0.85));
  across.addColorStop(0.7, withAlpha(color, 0.45));
  across.addColorStop(1, withAlpha(color, 0));
  context.fillStyle = across;
  context.fillRect(0, 0, canvas.width, canvas.height);
  fadeUpward(context, canvas);
  return canvas;
}

/** Lässt ein Bild nach oben weich auslaufen. */
function fadeUpward(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const up = context.createLinearGradient(0, 0, 0, canvas.height);
  up.addColorStop(0, "rgb(0 0 0 / 0)");
  up.addColorStop(0.55, "rgb(0 0 0 / 0.6)");
  up.addColorStop(1, "rgb(0 0 0 / 1)");
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = up;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

/** Zeichnet die Lichtsäule: wächst in 150 ms von den Füßen auf, blendet in 400 ms aus. */
function drawPillar(context: CanvasRenderingContext2D, atlas: FxAtlas, live: LiveShape, t: number) {
  const { spec } = live;
  if (spec.shape !== "pillar") return;
  const height = spec.bottom - spec.top;
  if (live.painted === undefined)
    live.painted = paintPillar(spec.width, height, atlas.color(spec.tint));
  if (!live.painted) return;
  const ms = t * spec.life;
  const rise = Math.min(1, ms / 150);
  context.globalAlpha = Math.min(1, (spec.life - ms) / 400);
  const { painted } = live;
  const shown = painted.height * rise;
  const left = spec.x - spec.width / 2;
  const top = spec.bottom - height * rise;
  context.drawImage(
    painted,
    0,
    painted.height - shown,
    painted.width,
    shown,
    left,
    top,
    spec.width,
    height * rise,
  );
}

/** Zeichnet einen Schockring: wächst schnell, wird dabei dünner und blasser. */
function drawRing(context: CanvasRenderingContext2D, atlas: FxAtlas, spec: ShapeSpec, t: number) {
  if (spec.shape !== "ring") return;
  const grow = 1 - (1 - t) ** 3;
  const radius = spec.from + (spec.to - spec.from) * grow;
  const fade = (1 - t) ** 1.5;
  context.strokeStyle = atlas.color(spec.tint);
  for (const [width, alpha] of [
    [spec.to * 0.09, 0.25],
    [spec.to * 0.025, 1],
  ] as const) {
    context.globalAlpha = alpha * fade;
    context.lineWidth = Math.max(1, width * (1 - 0.6 * t));
    context.beginPath();
    context.arc(spec.x, spec.y, radius, 0, 2 * Math.PI);
    context.stroke();
  }
}

/** Zeichnet eine Form zum Anteil `t` ihres Lebens. */
export function drawShape(
  context: CanvasRenderingContext2D,
  atlas: FxAtlas,
  live: LiveShape,
  t: number,
) {
  const { spec } = live;
  if (spec.shape === "pillar") return drawPillar(context, atlas, live, t);
  if (spec.shape === "ring") return drawRing(context, atlas, spec, t);
  const flash = spec.shape === "flash";
  const size = 2 * spec.radius * (flash ? 0.6 + 0.4 * t : 1);
  const alpha = flash ? (1 - t) ** 2 : Math.sin(Math.PI * t);
  const look = { sprite: "glow", tint: spec.tint } as const;
  atlas.draw(context, look, { x: spec.x, y: spec.y, width: size, height: size, alpha });
}
