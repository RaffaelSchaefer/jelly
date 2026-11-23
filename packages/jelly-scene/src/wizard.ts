/**
 * Funkelbart, der Zauberer im Shop der App: seine Farben, seine Teile und seine Kristallkugel.
 *
 * Nur er trägt die Teile. Sie stehen deshalb nicht in `COSMETIC_MODELS`, das auch Karte und Beamer
 * ausliefern, und nicht im Katalog des Servers. Alle liegen in einer Datei, die
 * `apps/client/blender/build_wizard.py` baut, und {@link loadWizardPart} holt jedes einzeln heraus:
 * Jedes Teil hat einen eigenen Anker, eine eigene Malschicht und Strichstärke
 * ({@link WIZARD_PARTS}). Die Glaskugel selbst malt ein Shader (`crystal.ts`).
 *
 * Gesten, Stimmung und schwere Lider legt `animateWizard` (`wizardGestures.ts`, beim Nerven
 * `wizardTease.ts`) über die Grundanimation, die Augen folgen seinem Blick über `placeEyes`. Die
 * Zahlen seiner Gesten ohne Three.js stehen in `@jelly/scene/wizard-timing`.
 *
 * @module
 */

import type { BufferGeometry } from "three";

import type { JellyPalette } from "./colors.ts";

import { loadModelParts } from "./cosmetic.ts";
import wizardModel from "./cosmetics/wizard.glb?url&inline";

export {
  animateCrystalBall,
  createCrystalBall,
  disposeCrystalBall,
  type CrystalLook,
} from "./crystal.ts";
export { EYE_GAZE, placeEyes } from "./face.ts";
export {
  animateWizard,
  type HatState,
  type WizardExtras,
  type WizardFrame,
  type WizardGestureFrame,
} from "./wizardGestures.ts";
export { WIZARD_MOODS, type WizardMood } from "./wizardFace.ts";

/**
 * Seine Farben: warmes Indigo, das sich vom dunklen Hut abhebt, Kerzenlicht von unten und Tinte in
 * dunkler Pflaume, die auf dem Holz der Theke ruhig wirkt.
 */
export const WIZARD_PALETTE: JellyPalette = {
  hex: "#4636a6",
  glow: "#ffbe6b",
  outline: "#1d1146",
  ink: "#110930",
};

/** Seine Kristallkugel: Größe, Malschicht und Strich wie ein Teil, dazu die Farben des Glases. */
export const WIZARD_CRYSTAL = {
  radius: 0.21,
  layer: 1,
  outline: 0.025,
  deep: "#2b1d6e",
  mist: "#8fe6ff",
  core: "#fff1c2",
} as const;

/** Ein Teil des Zauberers, benannt wie die Eigenschaft `part` seiner Objekte in Blender. */
export type WizardPart =
  | "hat"
  | "hair"
  | "hatTrim"
  | "locks"
  | "beard"
  | "brow"
  | "mustache"
  | "nose"
  | "robe"
  | "clasps"
  | "orbStand"
  | "orbSparks"
  | "orbClaws"
  | "wand";

/**
 * Woran ein Teil hängt: `head` in `Jelly.faceAnchor`, `body` in `Jelly.root`, `orb` an der Kugel
 * neben ihm ({@link ORB_REST}), `hand` an seiner rechten Hand.
 */
export type WizardAnchor = "head" | "body" | "orb" | "hand";

/** Wie ein Teil am Zauberer sitzt und gezeichnet wird. */
export interface WizardPartLook {
  anchor: WizardAnchor;
  /** Malschicht 0 bis 4, siehe `CosmeticLook`. */
  layer: number;
  /** Breite der Outline in Szenen-Einheiten. */
  outline: number;
  /** Das Modell enthält nur die rechte Hälfte, der Shop zeichnet sie ein zweites Mal gespiegelt. */
  mirrored?: boolean;
  /** Drehpunkt der rechten Hälfte in Koordinaten des Jellys, für lebendige Brauen und Schnurrbart. */
  pivot?: readonly [number, number, number];
}

/**
 * Alle Teile in ihren Malschichten. Höhere Schichten decken tiefere ab, mit Tintenrand: Schnurrbart
 * über Bart, Bart über Locken, Locken und Hutband über Robe und Filz.
 */
export const WIZARD_PARTS: Readonly<Record<WizardPart, WizardPartLook>> = {
  hat: { anchor: "head", layer: 0, outline: 0.035 },
  hair: { anchor: "head", layer: 0, outline: 0.03 },
  hatTrim: { anchor: "head", layer: 1, outline: 0.022 },
  locks: { anchor: "head", layer: 1, outline: 0.026 },
  beard: { anchor: "head", layer: 2, outline: 0.03 },
  brow: { anchor: "head", layer: 2, outline: 0.026, mirrored: true, pivot: [0.22, 0.77, 0.74] },
  mustache: { anchor: "head", layer: 3, outline: 0.02, mirrored: true, pivot: [0.04, 0.556, 0.79] },
  nose: { anchor: "head", layer: 4, outline: 0.02 },
  robe: { anchor: "body", layer: 0, outline: 0.035 },
  clasps: { anchor: "body", layer: 1, outline: 0.02 },
  orbStand: { anchor: "orb", layer: 0, outline: 0.03 },
  orbSparks: { anchor: "orb", layer: 0, outline: 0.016 },
  orbClaws: { anchor: "orb", layer: 2, outline: 0.02 },
  wand: { anchor: "hand", layer: 2, outline: 0.022 },
};

/**
 * Wo die Kugel ruht, in Koordinaten des Zauberers: auf der Theke zu seiner Rechten. Der Fuß ihres
 * Ständers steht 0,32 tiefer auf der Oberkante der Theke.
 */
export const ORB_REST: readonly [number, number, number] = [1.68, 0, 0.75];

/**
 * Drehpunkt des Huts in Koordinaten des Jellys, an der Krempe. Um ihn lüpft er den Hut, höchstens
 * 0,12 hoch und 0,25 rad gekippt.
 */
export const HAT_PIVOT: readonly [number, number, number] = [0, 0.99, 0.2];

/**
 * Drehpunkt des Barts in Koordinaten des Jellys, am Kinn unter dem Schnurrbart. Von dort dehnt er
 * sich nach unten, wenn man an ihm zieht, und die Locken darunter mit ihm.
 */
export const BEARD_PIVOT: readonly [number, number, number] = [0, 0.48, 0.7];

/**
 * Wohin der geklaute Hut fliegt, in Koordinaten des Jellys ab seinem Drehpunkt: hinauf aus dem Bild
 * und zum Kunden hin, dabei kippt er um `tilt` rad und schrumpft auf `scale`.
 */
export const HAT_FLIGHT = { rise: 1.5, drift: 0.7, tilt: -1.1, scale: 0.6 } as const;

/** Wie weit sich der Bart höchstens dehnt und dabei schmaler wird, als Anteil seiner Größe. */
export const BEARD_STRETCH = { long: 0.4, thin: 0.12 } as const;

/** Die Teile je Name, einmal angefragt. Alle Zauberer teilen sie. */
const PARTS = new Map<WizardPart, Promise<BufferGeometry>>();

/**
 * Lädt ein Teil des Zauberers. Für dasselbe Teil kommt immer dasselbe Promise, so wartet React
 * nicht erneut. Alle Teile stammen aus einem einzigen Laden der Datei.
 */
export function loadWizardPart(part: WizardPart): Promise<BufferGeometry> {
  const known = PARTS.get(part);
  if (known) return known;
  const loading = loadModelParts(wizardModel).then((parts) => {
    const model = parts.get(part);
    if (!model) throw new Error(`Zauberer: Im Modell fehlt das Teil „${part}“`);
    return model;
  });
  PARTS.set(part, loading);
  return loading;
}
