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
  sky: { hex: "#1fa3e6", glow: "#b0f2ff", outline: "#0b5a8a", ink: "#06304d" },
  violet: { hex: "#5b3fe8", glow: "#b5a4ff", outline: "#2a1890", ink: "#160b52" },
  lilac: { hex: "#8045df", glow: "#f1a5f3", outline: "#45188a", ink: "#2a0f52" },
  rose: { hex: "#e8619f", glow: "#ffc4e1", outline: "#861d52", ink: "#4a0d2c" },
  cherry: { hex: "#e0383e", glow: "#ff9e7a", outline: "#7d1018", ink: "#45070c" },
  peach: { hex: "#ed7448", glow: "#ffdc8a", outline: "#8a3216", ink: "#4f1c0b" },
  tangerine: { hex: "#f28a1c", glow: "#ffe066", outline: "#8a4508", ink: "#4a2304" },
  lemon: { hex: "#f2c11d", glow: "#fff6a8", outline: "#8a6406", ink: "#453203" },
  lime: { hex: "#36b83c", glow: "#c6ff66", outline: "#1f6b24", ink: "#0e3a12" },
  clover: { hex: "#1fae62", glow: "#8ff5c0", outline: "#0d6337", ink: "#06341c" },
} as const satisfies Record<string, JellyPalette>;

/** Schlüssel einer Farbvariante. */
export type JellyColor = keyof typeof JELLY_COLORS;
