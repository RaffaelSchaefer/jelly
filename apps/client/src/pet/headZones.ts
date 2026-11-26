/**
 * Die Trefferzonen am Kopf des Jellys: die Nase für den Nasenstupser, die obere Kopfhälfte zum
 * Streicheln. Reine Rechnung auf dem Bildschirm: Die Szene projiziert die Punkte
 * (`scene/TouchZones.tsx`), hier fallen die Entscheidungen.
 *
 * @module
 */

import { reachOf } from "./pointerKinds";

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

/**
 * So weit muss ein Streicheln mindestens gehen, in Pixeln. Finger und Stift zittern beim Tippen,
 * und bei einem kleinen Jelly wären 0,6 Radien kaum mehr als dieses Zittern. Die Maus braucht das
 * nicht, bei ihr bleibt es bei den Radien.
 */
const STROKE_FLOOR: Record<string, number> = { touch: 16, pen: 8 };

/**
 * So weit darf ein Finger oder Stift zwischen Aufsetzen und Heben wandern, und es bleibt ein Tipp.
 * Etwas großzügiger als Chromium für einen Klick, denn ein Stupser auf das Jelly darf ungenau
 * sein.
 */
const TAP_SLOP: Record<string, number> = { touch: 20, pen: 10 };

/** Wo am Kopf ein Punkt liegt: auf der Nase oder auf der oberen Kopfhälfte (`crown`). */
export type HeadZone = "nose" | "crown";

/** Ob `point` auf der Nase liegt. `reach` gibt Finger und Stift Pixel dazu. */
function onNose(head: HeadSpots, point: ScreenPoint, reach: number) {
  const nose = Math.max(NOSE_MIN_PX, head.radius * NOSE_REACH) + reach;
  return Math.hypot(point.x - head.nose.x, point.y - head.nose.y) <= nose;
}

/** Ob `point` auf der oberen Kopfhälfte liegt, ohne Rücksicht auf die Nase. */
function onCrown(head: HeadSpots, point: ScreenPoint, reach: number) {
  const { x, y } = head.center;
  return point.y <= y && Math.hypot(point.x - x, point.y - y) <= head.radius * CROWN_REACH + reach;
}

/**
 * In welcher Zone am Kopf `point` liegt, oder `null` außerhalb aller Zonen.
 *
 * @param reach - So viele Pixel trifft der Zeiger daneben noch (`reachOf`), die Maus 0.
 */
export function headZone(head: HeadSpots, point: ScreenPoint, reach = 0): HeadZone | null {
  if (onNose(head, point, reach)) return "nose";
  return onCrown(head, point, reach) ? "crown" : null;
}

/** Eine Geste mit gedrücktem Zeiger: wo er zuletzt war und wie weit er über den Kopf strich. */
export interface Stroke {
  /** Wo der Zeiger aufsetzte. */
  start: ScreenPoint;
  last: ScreenPoint;
  /** Strecke über der oberen Kopfhälfte in Pixeln. */
  travel: number;
  /** Ob aus der Geste ein Streicheln geworden ist. */
  petting: boolean;
  /** Die Art des Zeigers: `mouse`, `pen` oder `touch`. */
  pointer: string;
}

/** Beginnt eine Geste am Punkt des Drückens. Ohne Art zählt sie wie die Maus. */
export function startStroke(at: ScreenPoint, pointer = "mouse"): Stroke {
  return { start: at, last: at, travel: 0, petting: false, pointer };
}

/**
 * Führt die Geste zu `point` weiter. Es zählt nur Strecke, die ganz über der oberen Kopfhälfte
 * liegt, auch hin und her. Die Nase gehört nicht dazu, auch nicht für einen Finger.
 *
 * @returns `true`, sobald aus der Geste ein Streicheln wird, einmal je Geste.
 */
export function followStroke(stroke: Stroke, point: ScreenPoint, head: HeadSpots) {
  const reach = reachOf(stroke.pointer);
  const crown = (at: ScreenPoint) => !onNose(head, at, 0) && onCrown(head, at, reach);
  if (crown(stroke.last) && crown(point)) {
    stroke.travel += Math.hypot(point.x - stroke.last.x, point.y - stroke.last.y);
  }
  stroke.last = point;
  const needed = Math.max(head.radius * STROKE_MIN, STROKE_FLOOR[stroke.pointer] ?? 0);
  if (stroke.petting || stroke.travel < needed) return false;
  stroke.petting = true;
  return true;
}

/**
 * Ob die Geste beim Heben ein Tipp war: kein Streicheln und kaum Weg. Gilt für Finger und Stift.
 * Die Maus entscheidet per Klick wie bisher.
 */
export function isTap(stroke: Stroke, at: ScreenPoint) {
  const slop = TAP_SLOP[stroke.pointer];
  if (slop === undefined || stroke.petting) return false;
  return Math.hypot(at.x - stroke.start.x, at.y - stroke.start.y) <= slop;
}

/** Wo die streichelnde Hand ist, von −1 links bis 1 rechts vom Kopf. */
export function handLean(head: HeadSpots, point: ScreenPoint) {
  return Math.max(-1, Math.min(1, (point.x - head.center.x) / head.radius));
}
