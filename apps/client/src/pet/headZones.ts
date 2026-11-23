/**
 * Die Trefferzonen am Kopf des Jellys: die Nase für den Nasenstupser, die obere Kopfhälfte zum
 * Streicheln. Reine Rechnung auf dem Bildschirm: Die Szene projiziert die Punkte
 * (`scene/TouchZones.tsx`), hier fallen die Entscheidungen.
 *
 * @module
 */

/** Eine Berührung mit eigener Reaktion statt des normalen Stupsers. */
export type PetTouch = "boop" | "pet";

/** Ein Punkt auf dem Bildschirm in CSS-Pixeln. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Die Nase relativ zur Kopfmitte, in Einheiten des Jellys wie die Teile in `face.ts` von
 * `@jelly/scene`: zwischen den Augen (y 0) und knapp über dem Mund (y −0,165).
 */
export const NOSE = { x: 0, y: -0.085 } as const;

/** Der Kopf auf dem Bildschirm, so wie ihn die Szene gerade zeigt. */
export interface HeadSpots {
  /** Mitte des Kopfs. */
  center: ScreenPoint;
  /** Die Nase ({@link NOSE}) auf der Kopfoberfläche. */
  nose: ScreenPoint;
  /** Radius des Kopfs in Pixeln. */
  radius: number;
}

/** Liefert den Kopf auf dem Bildschirm, wie ihn das letzte Bild zeigt. */
export type HeadProbe = () => HeadSpots;

/**
 * So weit reicht die Nase im Verhältnis zum Radius des Kopfs. Die Mitten der Augen liegen
 * außerhalb.
 */
const NOSE_REACH = 0.25;

/** So weit reicht sie mindestens, in Pixeln: Auch beim kleinsten Jelly trifft sie ein Finger. */
const NOSE_MIN_PX = 10;

/** So weit reicht die obere Kopfhälfte im Verhältnis zum Radius, etwas über den Umriss hinaus. */
const CROWN_REACH = 1.15;

/** So weit muss ein Streicheln über die obere Kopfhälfte gehen, im Verhältnis zum Radius. */
const STROKE_MIN = 0.6;

/** Wo am Kopf ein Punkt liegt: auf der Nase oder auf der oberen Kopfhälfte (`crown`). */
export type HeadZone = "nose" | "crown";

/** In welcher Zone am Kopf `point` liegt, oder `null` außerhalb aller Zonen. */
export function headZone(head: HeadSpots, point: ScreenPoint): HeadZone | null {
  const reach = Math.max(NOSE_MIN_PX, head.radius * NOSE_REACH);
  if (Math.hypot(point.x - head.nose.x, point.y - head.nose.y) <= reach) return "nose";
  const { x, y } = head.center;
  const above = point.y <= y && Math.hypot(point.x - x, point.y - y) <= head.radius * CROWN_REACH;
  return above ? "crown" : null;
}

/** Eine Geste mit gedrücktem Zeiger: wo er zuletzt war und wie weit er über den Kopf strich. */
export interface Stroke {
  last: ScreenPoint;
  /** Strecke über der oberen Kopfhälfte in Pixeln. */
  travel: number;
  /** Ob aus der Geste ein Streicheln geworden ist. */
  petting: boolean;
}

/** Beginnt eine Geste am Punkt des Drückens. */
export function startStroke(at: ScreenPoint): Stroke {
  return { last: at, travel: 0, petting: false };
}

/**
 * Führt die Geste zu `point` weiter. Es zählt nur Strecke, die ganz über der oberen Kopfhälfte
 * liegt, auch hin und her.
 *
 * @returns `true`, sobald aus der Geste ein Streicheln wird, einmal je Geste.
 */
export function followStroke(stroke: Stroke, point: ScreenPoint, head: HeadSpots) {
  if (headZone(head, stroke.last) === "crown" && headZone(head, point) === "crown") {
    stroke.travel += Math.hypot(point.x - stroke.last.x, point.y - stroke.last.y);
  }
  stroke.last = point;
  if (stroke.petting || stroke.travel < head.radius * STROKE_MIN) return false;
  stroke.petting = true;
  return true;
}

/** Wo die streichelnde Hand ist, von −1 links bis 1 rechts vom Kopf. */
export function handLean(head: HeadSpots, point: ScreenPoint) {
  return Math.max(-1, Math.min(1, (point.x - head.center.x) / head.radius));
}
