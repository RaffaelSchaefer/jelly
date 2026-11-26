/**
 * Was Finger und Stift anders brauchen als die Maus, reine Rechnung für Pet, Shop und Karte: Ein
 * Finger trifft auch knapp daneben und zittert beim Tippen, ein Stift etwas weniger. Die Maus
 * trifft genau. Ein Stift schwebt wie die Maus, ein Finger nicht.
 *
 * @module
 */

/**
 * So viele CSS-Pixel neben einem Ziel trifft ein Tipp noch. Eine Fingerkuppe deckt rund 30 Pixel,
 * ihr Punkt liegt irgendwo darin.
 */
const REACH: Record<string, number> = { touch: 12, pen: 4 };

/**
 * Ab so vielen Pixeln ist ein gedrückter Zeiger ein Ziehen und kein Klick mehr. Die Schwelle für
 * Finger bleibt unter der Strecke, bis zu der Chromium einen Finger noch als Tipp zählt: Ein Zug
 * dazwischen gäbe weder Klick noch Ziehen.
 */
const DRAG_START: Record<string, number> = { mouse: 4, pen: 6, touch: 10 };

/** So zittert ein Zeiger, dessen Art der Browser nicht nennt. */
const DEFAULT_DRAG_START = 4;

/** Die Art des Zeigers hinter einem Klick. Chromium schickt Klicks als `PointerEvent`. */
export function pointerTypeOf(event: MouseEvent): string {
  return "pointerType" in event && typeof event.pointerType === "string" && event.pointerType
    ? event.pointerType
    : "mouse";
}

/** Wie viele Pixel neben einem Ziel ein Zeiger dieser Art noch trifft. */
export function reachOf(pointerType: string): number {
  return REACH[pointerType] ?? 0;
}

/** Ab wie vielen Pixeln ein Zeiger dieser Art zieht. */
export function dragThreshold(pointerType: string): number {
  return DRAG_START[pointerType] ?? DEFAULT_DRAG_START;
}

/** Ob ein Zeiger dieser Art schweben kann wie die Maus. Nur der Finger kann es nicht. */
export function canHover(pointerType: string): boolean {
  return pointerType !== "touch";
}

/**
 * Ob ein Zug eines Fingers oder Stifts zur Seite geht: weit genug für ein Ziehen und mehr
 * waagerecht als senkrecht. So unterscheidet ein Regler im Panel sein Ziehen vom Scrollen.
 */
export function isSideways(dx: number, dy: number, pointerType: string): boolean {
  return Math.hypot(dx, dy) >= dragThreshold(pointerType) && Math.abs(dx) > Math.abs(dy);
}
