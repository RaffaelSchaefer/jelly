/**
 * Die Mundformen des Jellys beim Sprechen, wie beim Lipsync in gezeichneten Filmen: je eine Form je
 * Vokal und ein geschlossener Mund. Der Mund bewegt sich, weil seine Form wechselt, nicht weil er
 * sich streckt.
 *
 * Die Formen sind flach und liegen knapp vor der Kopfoberfläche. Sie hängen unter der Linie des
 * Lächelns, der Mund öffnet sich also nach unten. Wann welche Form dran ist, weiß der Aufrufer: Er
 * gibt in `animateJelly` einen {@link MouthFrame} mit.
 *
 * @module
 */

import { BufferGeometry, Shape, ShapeGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { Jelly } from "./jelly.ts";

import { tintGeometry } from "./jellyGeometry.ts";

/** Die Namen der Mundformen: die fünf Vokale und `m` für den geschlossenen Mund. */
export const MOUTH_SHAPE_NAMES = ["a", "e", "i", "o", "u", "m"] as const;

/** Eine Mundform. */
export type MouthShape = (typeof MOUTH_SHAPE_NAMES)[number];

/** Was der Mund in einem Bild zeigt. */
export interface MouthFrame {
  shape: MouthShape;
  /** Breite und Höhe im Verhältnis zur gezeichneten Form. */
  width: number;
  height: number;
  /** Wie weit der Kopf gerade nickt, von 0 bis 1. */
  nod: number;
}

/** So weit senkt sich der Kopf bei einem vollen Nicken, in Einheiten des Jellys. */
const NOD_DISTANCE = 0.03;

/** Farbe der Zunge. */
const TONGUE = "#f0648f";

/** So weit liegt der Mund vor seinem Ursprung, die Zunge noch ein Stück davor. */
const MOUTH_LIFT = 0.012;
const TONGUE_LIFT = 0.001;

/** Punkte je Kurvenstück. Mehr sähe man bei dieser Größe nicht. */
const CURVE_SEGMENTS = 12;

/** Maße eines offenen Munds: Mitte des Bogens oben und Tiefe, gemessen vom oberen Ende. */
interface Crescent {
  halfWidth: number;
  top: number;
  /** Wie weit die obere Linie in der Mitte durchhängt, wie beim Lächeln. */
  sag: number;
  depth: number;
}

/** Ein offener Mund wie ein Halbmond: oben die Linie des Lächelns, unten ein tiefer Bogen. */
function crescent({ halfWidth, top, sag, depth }: Crescent) {
  const bottom = top - depth;
  const side = top - depth * 0.7;
  return new Shape()
    .moveTo(-halfWidth, top)
    .quadraticCurveTo(0, top - 2 * sag, halfWidth, top)
    .bezierCurveTo(halfWidth * 0.95, side, halfWidth * 0.5, bottom, 0, bottom)
    .bezierCurveTo(-halfWidth * 0.5, bottom, -halfWidth * 0.95, side, -halfWidth, top);
}

/** Eine Ellipse um die Mitte `y`. */
function oval(y: number, radiusX: number, radiusY: number) {
  return new Shape().absellipse(0, y, radiusX, radiusY, 0, Math.PI * 2, false);
}

/** Wie eine Mundform gezeichnet ist. */
interface MouthDrawing {
  outline: Shape;
  tongue?: Shape;
}

/** Alle Formen. Der Ursprung liegt dort, wo das Lächeln seine Mundwinkel hat. */
const DRAWINGS: Record<MouthShape, MouthDrawing> = {
  a: {
    outline: crescent({ halfWidth: 0.085, top: 0.012, sag: 0.006, depth: 0.115 }),
    tongue: oval(-0.07, 0.042, 0.026),
  },
  e: { outline: crescent({ halfWidth: 0.082, top: 0.008, sag: 0.005, depth: 0.062 }) },
  i: { outline: crescent({ halfWidth: 0.09, top: 0.006, sag: 0.014, depth: 0.044 }) },
  o: { outline: oval(-0.035, 0.05, 0.06), tongue: oval(-0.072, 0.028, 0.016) },
  u: { outline: oval(-0.032, 0.036, 0.042) },
  m: { outline: crescent({ halfWidth: 0.055, top: 0, sag: 0.006, depth: 0.03 }) },
};

/** Eine flache Fläche in der Farbe `hex`, um `lift` vor dem Ursprung. */
function createFlatPart(shape: Shape, hex: string, lift: number) {
  return tintGeometry(new ShapeGeometry(shape, CURVE_SEGMENTS), hex).translate(0, 0, lift);
}

/** Baut eine Mundform als eine Geometrie. Das Mesh des Munds ist um 180° gedreht, das hebt sie auf. */
function buildMouthShape({ outline, tongue }: MouthDrawing, ink: string) {
  const parts = [createFlatPart(outline, ink, MOUTH_LIFT)];
  if (tongue) parts.push(createFlatPart(tongue, TONGUE, MOUTH_LIFT + TONGUE_LIFT));
  const merged = mergeGeometries(parts) ?? parts[0] ?? new BufferGeometry();
  merged.rotateZ(Math.PI);
  return merged;
}

/** Die Formen je Tintenfarbe. Alle Jellies teilen sie, wie die Augen. */
const SHAPES_BY_INK = new Map<string, Record<MouthShape, BufferGeometry>>();

/** Holt alle Mundformen in der Tintenfarbe aus dem Cache oder baut sie. */
export function findMouthShapes(ink: string) {
  const cached = SHAPES_BY_INK.get(ink);
  if (cached) return cached;
  const shapes = {
    a: buildMouthShape(DRAWINGS.a, ink),
    e: buildMouthShape(DRAWINGS.e, ink),
    i: buildMouthShape(DRAWINGS.i, ink),
    o: buildMouthShape(DRAWINGS.o, ink),
    u: buildMouthShape(DRAWINGS.u, ink),
    m: buildMouthShape(DRAWINGS.m, ink),
  };
  SHAPES_BY_INK.set(ink, shapes);
  return shapes;
}

/**
 * Legt die Mundform über die frisch berechnete Grundpose. Größe des Munds und Lage des Kopfes setzt
 * die Animation jedes Bild neu, es sammelt sich also nichts an. Ohne Frame lächelt das Jelly.
 */
export function animateMouth({ face, head }: Jelly, frame?: MouthFrame) {
  if (!frame) {
    face.mouth.geometry = face.smile;
    return;
  }
  face.mouth.geometry = face.mouthShapes[frame.shape];
  face.mouth.scale.set(frame.width, frame.height, 1);
  head.position.y -= frame.nod * NOD_DISTANCE;
}
