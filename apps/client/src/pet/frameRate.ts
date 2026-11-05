/**
 * Der Regler der Bildrate als reine Rechnung. `null` heißt unbegrenzt, im Regler ist das die
 * Stellung hinter dem größten Wert. Diese Stellung wird nie gespeichert.
 *
 * @module
 */

/**
 * Bereich der Bildrate in Bildern pro Sekunde (Rust: `MIN_FRAME_LIMIT`, `MAX_FRAME_LIMIT`,
 * `DEFAULT_FRAME_LIMIT`).
 */
export const FRAME_RATE = { min: 5, max: 144, default: 30 } as const;

/** Die Reglerstellung für „Unbegrenzt“. */
export const UNLIMITED_STOP = FRAME_RATE.max + 1;

/** Die Reglerstellung zu einer Bildrate. */
export function frameLimitToStop(limit: number | null) {
  return limit ?? UNLIMITED_STOP;
}

/** Die Bildrate zu einer Reglerstellung. */
export function stopToFrameLimit(stop: number) {
  return stop > FRAME_RATE.max ? null : stop;
}

/** Der Wert in Worten, auch für Screenreader. */
export function frameRateText(limit: number | null) {
  return limit === null ? "Unbegrenzt" : `${limit} FPS`;
}
