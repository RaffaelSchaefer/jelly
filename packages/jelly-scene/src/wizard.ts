/**
 * Der Zauberer, der in der App den Shop führt: seine Farben und seine eigenen Cosmetics.
 *
 * Nur er trägt sie. Sie stehen deshalb nicht in `COSMETIC_MODELS`, das auch Karte und Beamer
 * ausliefern, und nicht im Katalog des Servers. Die Modelle baut
 * `apps/client/blender/build_wizard.py`. Hut und Gesicht sitzen wie andere Cosmetics im Kopf, die
 * Kugel liegt um den Ursprung und schwebt neben ihm.
 *
 * @module
 */

import type { JellyPalette } from "./colors.ts";

import { loadModel } from "./cosmetic.ts";
import face from "./cosmetics/wizard-face.glb?url&inline";
import hat from "./cosmetics/wizard-hat.glb?url&inline";
import orb from "./cosmetics/wizard-orb.glb?url&inline";

/** Seine Farben: Indigo mit warmem Kerzenlicht von unten. */
export const WIZARD_PALETTE: JellyPalette = {
  hex: "#3d2fa0",
  glow: "#ffcf7a",
  outline: "#1c1354",
  ink: "#120b38",
};

/** Die Modelle des Zauberers als Data-URL. */
const WIZARD_MODELS = { hat, face, orb } as const;

/** Ein Teil des Zauberers: Spitzhut, Bart mit Brauen oder Kristallkugel. */
export type WizardPart = keyof typeof WIZARD_MODELS;

/** Lädt ein Teil des Zauberers. Für dasselbe Teil kommt immer dasselbe Promise. */
export function loadWizardPart(part: WizardPart) {
  return loadModel(WIZARD_MODELS[part]);
}
