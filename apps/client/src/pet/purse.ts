/**
 * Die Börse im Kopf des Zauberladens zählt Münzen einzeln herunter und herauf, als reine Rechnung.
 * Abgespielt wird sie in `shop/usePurseCount.ts`.
 *
 * @module
 */

/** Höchstens so viele Schritte zählt die Börse, auch bei großen Sprüngen. */
export const PURSE_MAX_STEPS = 12;

/** Takt der Börse in Millisekunden: Ausgeben geht schneller als Verdienen. */
export const PURSE_STEP_MS = { down: 70, up: 120 } as const;

/** In welche Richtung die Börse zählt. */
export type PurseTrend = keyof typeof PURSE_STEP_MS;

/**
 * Die Zahlen, die die Börse auf dem Weg von `from` nach `to` zeigt, ohne `from`. Bis zu
 * {@link PURSE_MAX_STEPS} Münzen zählt sie einzeln, darüber in gerundeten Sprüngen, die genau bei
 * `to` enden.
 */
export function coinSteps(from: number, to: number): number[] {
  const delta = to - from;
  const count = Math.min(Math.abs(delta), PURSE_MAX_STEPS);
  return Array.from({ length: count }, (_, step) =>
    Math.round(from + (delta * (step + 1)) / count),
  );
}

/** Ob die Börse von `from` nach `to` steigt oder fällt, `null` wenn nichts zu zählen ist. */
export function purseTrend(from: number, to: number): PurseTrend | null {
  if (to === from) return null;
  return to > from ? "up" : "down";
}
