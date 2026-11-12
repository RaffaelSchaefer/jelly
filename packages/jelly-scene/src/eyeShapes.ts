/**
 * Die Formen von Augen und Brauen: offen mit Glanzpunkten, fröhlich als Bogen (`^`), zugekniffen
 * als Winkel (`>`), geschlossen als flacher Bogen nach unten, dazu die Braue als flacher Bogen.
 *
 * Wie die Mundformen liegen sie je Tintenfarbe einmal im Speicher. Die Augen tauschen nur ihre
 * Geometrie, ihre Lage auf dem Kopf bleibt.
 *
 * @module
 */

import { BufferGeometry, CapsuleGeometry, SphereGeometry, TorusGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { tintGeometry } from "./jellyGeometry.ts";

/** Die Namen der Augenformen. */
export const EYE_SHAPE_NAMES = ["open", "happy", "squint", "closed"] as const;

/** Eine Augenform. */
export type EyeShape = (typeof EYE_SHAPE_NAMES)[number];

/** Farben der Glanzpunkte im offenen Auge. */
const HIGHLIGHT = "#f3ffff";
const REFLECTION = "#8fdcff";

/** Strichstärke gezeichneter Augen und der Brauen. */
const LINE = 0.024;

/** So weit liegen gezeichnete Striche vor der Augenmitte, die selbst knapp im Kopf sitzt. */
const LINE_LIFT = 0.014;

/** Gezeichnete Striche sind flach, damit sie nicht wie Würste aus dem Kopf ragen. */
const FLAT = 0.6;

/** Ein Teil eines Auges: Form, Größe und Lage relativ zur Augenmitte. Ohne Farbe ist es Tinte. */
interface EyePart {
  shape: BufferGeometry;
  scale: [number, number, number];
  at: [number, number, number];
  color?: string;
}

/** Pupille, großer und kleiner Glanzpunkt. */
function openParts(): EyePart[] {
  const pupil = new SphereGeometry(1, 24, 16);
  const sparkle = new SphereGeometry(1, 12, 8);
  return [
    { shape: pupil, scale: [0.058, 0.084, 0.022], at: [0, 0, 0] },
    { shape: sparkle, scale: [0.018, 0.023, 0.008], at: [-0.016, 0.028, 0.021], color: HIGHLIGHT },
    { shape: sparkle, scale: [0.008, 0.01, 0.005], at: [0.015, -0.026, 0.022], color: REFLECTION },
  ];
}

/** Das offene Auge: Pupille und Glanzpunkte als eine Geometrie mit Vertexfarben. */
function buildOpenEye(ink: string) {
  const parts = openParts().map(({ shape, scale, at, color }) =>
    tintGeometry(
      shape
        .clone()
        .scale(...scale)
        .translate(...at),
      color ?? ink,
    ),
  );
  return mergeGeometries(parts) ?? parts[0] ?? new BufferGeometry();
}

/** Ein gerader Strich mit runden Enden von `from` nach `to`. */
function stroke(from: [number, number], to: [number, number]) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  return new CapsuleGeometry(LINE / 2, Math.hypot(dx, dy), 4, 8)
    .scale(1, 1, FLAT)
    .rotateZ(Math.atan2(dy, dx) - Math.PI / 2)
    .translate((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, LINE_LIFT);
}

/** Ein Bogen mit Radius `radius` über `sweep` Bogenmaß, die Mitte oben. */
function bow(radius: number, sweep: number, thickness = LINE) {
  return new TorusGeometry(radius, thickness / 2, 8, 24, sweep)
    .rotateZ((Math.PI - sweep) / 2)
    .scale(1, 1, FLAT);
}

/**
 * Die gezeichneten Augen, alle um die Augenmitte. Der Winkel zeigt nach +x, also für das linke Auge
 * zur Mitte. Das rechte spiegelt ihn beim Zeigen.
 */
function buildLineEye(shape: Exclude<EyeShape, "open">) {
  switch (shape) {
    case "happy":
      return bow(0.048, 2.4).scale(1, 1.2, 1).translate(0, -0.03, LINE_LIFT);
    case "closed":
      return bow(0.055, 2, 0.028).rotateZ(Math.PI).scale(1, 0.6, 1).translate(0, 0.02, LINE_LIFT);
    case "squint":
      return (
        mergeGeometries([stroke([0.03, 0], [-0.03, 0.032]), stroke([0.03, 0], [-0.03, -0.032])]) ??
        new BufferGeometry()
      );
  }
}

/** Die Augenformen je Tintenfarbe. Alle Jellies teilen sie. */
const EYES_BY_INK = new Map<string, Record<EyeShape, BufferGeometry>>();

/** Holt alle Augenformen in der Tintenfarbe aus dem Cache oder baut sie. */
export function findEyeShapes(ink: string): Record<EyeShape, BufferGeometry> {
  const cached = EYES_BY_INK.get(ink);
  if (cached) return cached;
  const shapes = {
    open: buildOpenEye(ink),
    happy: tintGeometry(buildLineEye("happy"), ink),
    squint: tintGeometry(buildLineEye("squint"), ink),
    closed: tintGeometry(buildLineEye("closed"), ink),
  };
  EYES_BY_INK.set(ink, shapes);
  return shapes;
}

/** Die Braue je Tintenfarbe: ein flacher Bogen, dessen Mitte im Ursprung liegt. */
const BROWS_BY_INK = new Map<string, BufferGeometry>();

/** Holt die Braue in der Tintenfarbe aus dem Cache oder baut sie. */
export function findBrowShape(ink: string) {
  const cached = BROWS_BY_INK.get(ink);
  if (cached) return cached;
  const radius = 0.12;
  const brow = tintGeometry(bow(radius, 0.85, 0.03).translate(0, -radius, LINE_LIFT), ink);
  BROWS_BY_INK.set(ink, brow);
  return brow;
}
