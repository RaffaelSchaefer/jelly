/**
 * Das Aufspringen einer Ware bei der Anprobe als reine Rechnung: Sie wächst aus dem Nichts über ihr
 * Maß hinaus und federt zurück, wie `easeOutBack`.
 *
 * @module
 */

/** Wie weit das Aufspringen über das Maß hinausgeht, und an welcher Stelle der Kurve. */
export const SPRING = { overshoot: 0.12, peakAt: 0.6 } as const;

/** Der Zeitplan eines Aufspringens: Wartezeit und Dauer in Millisekunden. */
export interface SpringTiming {
  delayMs: number;
  durationMs: number;
}

/**
 * Die Größe zum Fortschritt `t` von 0 bis 1: von 0 mit Schwung auf 1,12 bei 60 %, dann weich zurück
 * auf 1. Die Kurve ist stetig und am Gipfel und am Ende waagerecht, so ruckt nichts. Werte
 * außerhalb von 0 bis 1 gelten als Anfang oder Ende.
 */
export function springIn(t: number) {
  const { overshoot, peakAt } = SPRING;
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  if (t <= peakAt) {
    const rest = 1 - t / peakAt;
    return (1 + overshoot) * (1 - rest * rest * rest);
  }
  const settle = (t - peakAt) / (1 - peakAt);
  return 1 + overshoot * (1 - settle * settle * (3 - 2 * settle));
}

/**
 * Die Größe `elapsedMs` nach dem Erscheinen: 0 während der Wartezeit, dann {@link springIn} über die
 * Dauer.
 */
export function springScale(elapsedMs: number, { delayMs, durationMs }: SpringTiming) {
  if (durationMs <= 0) return elapsedMs >= delayMs ? 1 : 0;
  return springIn((elapsedMs - delayMs) / durationMs);
}
