/**
 * Ziehen und Spreizen auf der Karte, mit Maus, Stift und Fingern. Ein gedrückter Zeiger zieht den
 * Ausschnitt, zwei Finger zoomen um ihre Mitte und ziehen mit ihr. Hebt sich einer der beiden,
 * zieht der andere weiter, ohne dass die Kamera springt. Gleiten, Schwung und Grenzen rechnet
 * `@jelly/stage`.
 *
 * @module
 */

import type { ScreenPoint, StageView } from "@jelly/stage";

import { dragThreshold } from "../pet";

/** Zwei Finger auf der Canvas, in CSS-Pixeln. */
export type PointerPair = readonly [ScreenPoint, ScreenPoint];

/** Ein Schritt des Spreizens: Zoom um `factor`, der Boden unter `from` wandert unter `to`. */
export interface PinchStep {
  factor: number;
  from: ScreenPoint;
  to: ScreenPoint;
}

/** Was das Ziehen von der Seite braucht. */
export interface MapGesture {
  canvas: HTMLCanvasElement;
  /** `null`, bis die Bühne läuft. */
  readView: () => StageView | null;
}

/** Was ein Ziehen oder Spreizen gerade weiß. */
interface Grip {
  /** Die gedrückten Zeiger auf der Canvas, höchstens zwei Finger. */
  held: Map<number, ScreenPoint>;
  /** Die Art der gedrückten Zeiger. Gespreizt wird nur mit Fingern. */
  kind: string;
  /** Wo der einzelne Zeiger aufsetzte, beim Ziehen wo er zuletzt war. */
  last: ScreenPoint | null;
  threshold: number;
  /** Der einzelne Zeiger zieht schon. */
  isDragging: boolean;
  /** Die Geste hat gezogen oder gespreizt: Der Klick danach zählt nicht. */
  hasMoved: boolean;
}

/** Die Mitte zwischen zwei Punkten. */
function middleOf([a, b]: PointerPair): ScreenPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Rechnet aus zwei Ständen zweier Finger, wie die Karte folgt: Der Zoom wächst mit ihrem Abstand,
 * der Boden unter ihrer alten Mitte wandert unter die neue. Lagen beide Finger auf einem Punkt,
 * bleibt der Zoom.
 */
export function measurePinch(before: PointerPair, after: PointerPair): PinchStep {
  const gapBefore = Math.hypot(before[1].x - before[0].x, before[1].y - before[0].y);
  const gapAfter = Math.hypot(after[1].x - after[0].x, after[1].y - after[0].y);
  const factor = gapBefore > 0 && gapAfter > 0 ? gapAfter / gapBefore : 1;
  return { factor, from: middleOf(before), to: middleOf(after) };
}

/** Wo ein Zeiger-Ereignis auf der Canvas liegt. */
function pointOf(event: PointerEvent): ScreenPoint {
  return { x: event.offsetX, y: event.offsetY };
}

/** Die beiden Finger, wie sie gerade liegen. */
function pairOf(held: Map<number, ScreenPoint>): PointerPair | null {
  const [a, b] = held.values();
  return a && b ? [a, b] : null;
}

/**
 * Ein Zeiger setzt auf. Der erste beginnt eine Geste, ein zweiter Finger macht daraus ein Spreizen.
 * Ein Zeiger anderer Art oder einer, der schon zählt, beginnt neu: Sein Loslassen kam nie an.
 */
function press(grip: Grip, event: PointerEvent) {
  if (event.button !== 0) return;
  const isFresh =
    grip.held.size === 0 || grip.kind !== event.pointerType || grip.held.has(event.pointerId);
  if (isFresh) {
    grip.held.clear();
    grip.held.set(event.pointerId, pointOf(event));
    Object.assign(grip, {
      kind: event.pointerType,
      last: pointOf(event),
      threshold: dragThreshold(event.pointerType),
      isDragging: false,
      hasMoved: false,
    });
  } else if (grip.held.size === 1 && event.pointerType === "touch") {
    grip.held.set(event.pointerId, pointOf(event));
    // Mit zwei Fingern ist es kein Tipp mehr, auch wenn sie still liegen.
    grip.hasMoved = true;
  }
}

/** Zwei Finger bewegen sich: Zoom und Verschieben in einem Schritt. */
function pinch(grip: Grip, gesture: MapGesture, event: PointerEvent) {
  const before = pairOf(grip.held);
  grip.held.set(event.pointerId, pointOf(event));
  const after = pairOf(grip.held);
  if (!before || !after) return;
  const { factor, from, to } = measurePinch(before, after);
  gesture.canvas.parentElement!.toggleAttribute("data-dragging", true);
  gesture.readView()?.pinch(from, to, factor);
}

/** Ein einzelner Zeiger zieht, sobald er weit genug gewandert ist. */
function drag(grip: Grip, gesture: MapGesture, event: PointerEvent) {
  const { last } = grip;
  const point = pointOf(event);
  if (!last) return;
  if (!grip.isDragging && Math.hypot(point.x - last.x, point.y - last.y) < grip.threshold) return;
  // Auch über den Knöpfen und außerhalb des Fensters geht das Ziehen weiter.
  if (!grip.isDragging) gesture.canvas.setPointerCapture(event.pointerId);
  Object.assign(grip, { isDragging: true, hasMoved: true, last: point });
  grip.held.set(event.pointerId, point);
  gesture.canvas.parentElement!.toggleAttribute("data-dragging", true);
  gesture.readView()?.pan(last, point);
}

/** Ein Zeiger bewegt sich. Maus und Stift ziehen nur mit gedrückter Taste oder Spitze. */
function move(grip: Grip, gesture: MapGesture, event: PointerEvent) {
  if (!grip.held.has(event.pointerId)) return;
  if (event.pointerType !== "touch" && !(event.buttons & 1)) return;
  if (grip.held.size === 2) pinch(grip, gesture, event);
  else drag(grip, gesture, event);
}

/**
 * Ein Zeiger hebt sich oder der Browser bricht ihn ab. Der Ort steht dann nicht mehr verlässlich im
 * Ereignis, es zählt der gemerkte. Bleibt ein Finger, zieht er von dort weiter. Hebt sich der
 * letzte, schwingt der Ausschnitt aus.
 */
function lift(grip: Grip, gesture: MapGesture, event: PointerEvent) {
  if (!grip.held.delete(event.pointerId)) return;
  const [left] = grip.held.values();
  if (left) {
    Object.assign(grip, { last: left, isDragging: true });
    return;
  }
  grip.last = null;
  grip.isDragging = false;
  const frame = gesture.canvas.parentElement!;
  if (!frame.hasAttribute("data-dragging")) return;
  frame.toggleAttribute("data-dragging", false);
  gesture.readView()?.releasePan();
}

/**
 * Ziehen und Spreizen. Der Klick am Ende zählt nicht, sonst ginge das Jelly danach auf einen
 * Ausflug. Dafür muss dieser Hörer vor dem der Seite angemeldet sein.
 */
export function listenToGestures(gesture: MapGesture): void {
  const { canvas } = gesture;
  const grip: Grip = {
    held: new Map(),
    kind: "mouse",
    last: null,
    threshold: dragThreshold("mouse"),
    isDragging: false,
    hasMoved: false,
  };
  canvas.addEventListener("pointerdown", (event) => press(grip, event));
  canvas.addEventListener("pointermove", (event) => move(grip, gesture, event));
  canvas.addEventListener("pointerup", (event) => lift(grip, gesture, event));
  canvas.addEventListener("pointercancel", (event) => lift(grip, gesture, event));
  canvas.addEventListener("click", (event) => {
    if (grip.hasMoved) event.stopImmediatePropagation();
    grip.hasMoved = false;
  });
}
