/**
 * Farbpaletten je Farbvariante. Die 3D-Szene färbt damit das Pet, die Farbauswahl zeigt `label` und
 * `hex`. Die Farben selbst kommen aus `@jelly/scene`, damit die Bühne des Servers dieselben nutzt.
 * Das UI-Theme (Akzent, Panels) steht separat in `styles.css` unter `:root[data-pet-color=…]`.
 *
 * @module
 */

import { JELLY_COLORS } from "@jelly/scene/colors";

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
  mint: { label: "Aqua", ...JELLY_COLORS.mint },
  lilac: { label: "Flieder", ...JELLY_COLORS.lilac },
  peach: { label: "Pfirsich", ...JELLY_COLORS.peach },
} as const;
