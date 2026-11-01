/**
 * Farbpaletten je Farbvariante. Die 3D-Szene färbt damit das Pet, die Farbauswahl zeigt `label` und
 * `hex`. Das UI-Theme (Akzent, Panels) steht separat in `styles.css` unter
 * `:root[data-pet-color=…]`.
 *
 * @module
 */

/**
 * Pro Farbvariante:
 *
 * - `label`: Name in der Farbauswahl
 * - `hex`: Grundfarbe des Körpers
 * - `glow`: Leuchten von unten
 * - `outline`: Umriss
 * - `ink`: Augen und Mund
 */
export const PET_COLORS = {
  mint: { label: "Aqua", hex: "#2059ed", glow: "#23f5dc", outline: "#16248a", ink: "#0b1550" },
  lilac: { label: "Flieder", hex: "#8045df", glow: "#f1a5f3", outline: "#45188a", ink: "#2a0f52" },
  peach: { label: "Pfirsich", hex: "#ed7448", glow: "#ffdc8a", outline: "#8a3216", ink: "#4f1c0b" },
} as const;
