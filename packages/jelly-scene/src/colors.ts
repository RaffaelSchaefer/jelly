/**
 * Farbpaletten des Jellys je Farbvariante, ohne Three.js. Client und Server-Bühne färben damit
 * dasselbe Jelly. Die Namen in der Farbauswahl stehen im Client (`src/pet/colors.ts`).
 *
 * @module
 */

/**
 * Farben eines Jellys:
 *
 * - `hex`: Grundfarbe des Körpers
 * - `glow`: Leuchten von unten
 * - `outline`: Umriss
 * - `ink`: Augen und Mund
 */
export interface JellyPalette {
  hex: string;
  glow: string;
  outline: string;
  ink: string;
}

/** Alle Farbvarianten. Die Schlüssel sind dieselben wie beim Server. */
export const JELLY_COLORS = {
  mint: { hex: "#2059ed", glow: "#23f5dc", outline: "#16248a", ink: "#0b1550" },
  lilac: { hex: "#8045df", glow: "#f1a5f3", outline: "#45188a", ink: "#2a0f52" },
  peach: { hex: "#ed7448", glow: "#ffdc8a", outline: "#8a3216", ink: "#4f1c0b" },
} as const satisfies Record<string, JellyPalette>;

/** Schlüssel einer Farbvariante. */
export type JellyColor = keyof typeof JELLY_COLORS;
