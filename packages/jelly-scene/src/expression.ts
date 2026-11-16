/**
 * Gesichtsausdrücke aus Bausteinen: Augenform, Brauen, Mundform und Röte. Gesten legen sie über die
 * Grundpose, die `animateFace` in `animation.ts` jedes Bild neu setzt. Beim Sprechen gewinnt der
 * Mund des Sprechens, Augen und Brauen behalten den Ausdruck.
 *
 * @module
 */

import { MathUtils, type Mesh, type MeshBasicMaterial } from "three";

import type { EyeShape } from "./eyeShapes.ts";
import type { Face } from "./face.ts";
import type { MouthShape } from "./mouthShapes.ts";

/** Lage und Neigung der Brauen. */
export interface BrowPose {
  /** Wie weit beide Brauen steigen. Negativ sinken sie zu den Augen. */
  lift: number;
  /**
   * Neigung im Bogenmaß. Positiv heben sich die inneren Enden (traurig), negativ sinken sie
   * (wütend).
   */
  tilt: number;
  /** Hebt nur die rechte Braue zusätzlich: skeptisch. */
  raise?: number;
}

/** Ein Gesichtsausdruck. Was fehlt, bleibt wie in der Grundpose. */
export interface Expression {
  eyes?: EyeShape;
  /** Wie weit sich die Augen schließen, 0 offen, 1 zu. */
  squeeze?: number;
  brows?: BrowPose;
  mouth?: MouthShape;
  /** Breite und Höhe des Munds im Verhältnis zur Grundpose. */
  mouthScale?: readonly [number, number];
  /** Wie rot die Wangen werden, 0 bis 1. */
  blush?: number;
}

/** Die Ausdrücke, aus denen die Gesten schöpfen. */
export const EXPRESSIONS = {
  joy: { eyes: "happy", mouth: "grin", blush: 0.6 },
  angry: { squeeze: 0.35, brows: { lift: -0.025, tilt: -0.5 }, mouth: "flat" },
  shout: { eyes: "squint", brows: { lift: -0.02, tilt: -0.5 }, mouth: "o", mouthScale: [1.2, 1.3] },
  sad: { squeeze: 0.25, brows: { lift: 0.02, tilt: 0.45 }, mouth: "sad" },
  shy: { eyes: "happy", blush: 0.9, mouthScale: [0.6, 0.7] },
  skeptic: { squeeze: 0.15, brows: { lift: -0.01, tilt: -0.15, raise: 0.04 }, mouth: "flat" },
  sleepy: { eyes: "closed", mouth: "m", mouthScale: [0.7, 1] },
} as const satisfies Record<string, Expression>;

/**
 * Ab dieser Stärke tauschen Augen und Mund ihre Form. Das weiche Ein- und Ausblenden der Geste
 * lässt den Sprung kaum auffallen.
 */
const SWAP_FROM = 0.5;

/** So kräftig werden die Wangen bei voller Röte. */
const BLUSH_OPACITY = 0.75;

/** Tauscht die Form eines Auges. Der Winkel zeigt bei beiden Augen zur Mitte, rechts gespiegelt. */
function shapeEye(face: Face, index: number, shape: EyeShape) {
  const eye = face.eyes[index]!;
  eye.geometry = face.eyeShapes[shape];
  // Gezeichnete Augen blinzeln nicht, ein halbes Blinzeln würde sie nur stauchen.
  if (shape !== "open") eye.scale.y = 1;
  if (shape === "squint" && index === 1) eye.scale.x *= -1;
}

/** Zeigt eine Braue. Sie zieht sich mit der Geste auf, statt aufzuploppen. */
function poseBrow(
  brow: Mesh,
  index: number,
  { lift, tilt, raise = 0 }: BrowPose,
  strength: number,
) {
  const side = index === 0 ? -1 : 1;
  brow.visible = true;
  brow.scale.x = strength;
  brow.position.y += (lift + (index === 1 ? raise : 0)) * strength;
  brow.rotation.z += -side * tilt * strength;
}

/** Färbt die Wangen, mindestens so kräftig wie schon nach einem Stupser. */
function blushCheeks(cheeks: Mesh[], amount: number) {
  for (const cheek of cheeks) {
    cheek.visible = true;
    const material = cheek.material as MeshBasicMaterial;
    material.opacity = Math.max(material.opacity, amount * BLUSH_OPACITY);
  }
}

/** Legt einen Ausdruck mit der Stärke der Geste über das Gesicht in der Grundpose. */
export function applyExpression(face: Face, expression: Expression, strength: number) {
  const { eyes, squeeze = 0, brows, mouth, mouthScale, blush = 0 } = expression;
  const swap = strength > SWAP_FROM;
  face.eyes.forEach((eye, index) => {
    if (eyes && swap) shapeEye(face, index, eyes);
    eye.scale.y *= 1 - squeeze * strength;
  });
  if (brows) face.brows.forEach((brow, index) => poseBrow(brow, index, brows, strength));
  if (mouth && swap) face.mouth.geometry = face.mouthShapes[mouth];
  if (mouthScale) {
    face.mouth.scale.x *= MathUtils.lerp(1, mouthScale[0], strength);
    face.mouth.scale.y *= MathUtils.lerp(1, mouthScale[1], strength);
  }
  if (blush > 0) blushCheeks(face.cheeks, blush * strength);
}
