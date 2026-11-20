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
  sky: { label: "Himmelblau", ...JELLY_COLORS.sky },
  violet: { label: "Lila", ...JELLY_COLORS.violet },
  lilac: { label: "Flieder", ...JELLY_COLORS.lilac },
  rose: { label: "Rosa", ...JELLY_COLORS.rose },
  cherry: { label: "Rot", ...JELLY_COLORS.cherry },
  peach: { label: "Pfirsich", ...JELLY_COLORS.peach },
  tangerine: { label: "Orange", ...JELLY_COLORS.tangerine },
  lemon: { label: "Gelb", ...JELLY_COLORS.lemon },
  lime: { label: "Hellgrün", ...JELLY_COLORS.lime },
  clover: { label: "Grün", ...JELLY_COLORS.clover },
} as const;
