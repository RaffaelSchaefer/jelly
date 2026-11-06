/**
 * Zeichnet das 3D-Modell eines Cosmetics. Laden und Bauen stehen in `@jelly/scene`, die Bühne nutzt
 * dieselben Modelle.
 *
 * @module
 */

import { createCosmetic, disposeCosmetic, hasCosmeticModel, loadCosmetic } from "@jelly/scene";
import { Suspense, use, useEffect, useMemo } from "react";

import { PET_COLORS, type PetColor } from "../pet";
import RenderBoundary from "./RenderBoundary";

/**
 * Ein Cosmetic in den Koordinaten des Pets, wie es um `blender/pet_reference.obj` modelliert wurde.
 * Hier liegt es als Sticker obenauf, deshalb muss nur modelliert werden, was man von vorn sieht.
 */
function CosmeticModel({ id, color }: { id: string; color: PetColor }) {
  const model = use(loadCosmetic(id));
  const cosmetic = useMemo(
    () => model && createCosmetic(model, PET_COLORS[color].outline, "sticker"),
    [model, color],
  );
  useEffect(() => () => void (cosmetic && disposeCosmetic(cosmetic)), [cosmetic]);
  return cosmetic ? <primitive object={cosmetic} /> : null;
}

/**
 * Das Cosmetic `id`, falls ein Modell dafür existiert. Lade- und Renderfehler lassen es still weg,
 * statt das ganze Pet zu verlieren.
 */
export default function Cosmetic({ id, color }: { id: string; color: PetColor }) {
  if (!hasCosmeticModel(id)) return null;
  return (
    <RenderBoundary fallback={null}>
      <Suspense fallback={null}>
        <CosmeticModel id={id} color={color} />
      </Suspense>
    </RenderBoundary>
  );
}
