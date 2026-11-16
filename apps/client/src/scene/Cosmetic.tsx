/**
 * Zeichnet das 3D-Modell eines Cosmetics. Laden und Bauen stehen in `@jelly/scene`, die Bühne nutzt
 * dieselben Modelle.
 *
 * @module
 */

import type { BufferGeometry } from "three";

import { createCosmetic, disposeCosmetic, hasCosmeticModel, loadCosmetic } from "@jelly/scene";
import { Suspense, use, useEffect, useMemo } from "react";

import RenderBoundary from "./RenderBoundary";

/** Ein Modell, das noch lädt. Ohne Modell löst es zu `null` auf. */
type ModelPromise = Promise<BufferGeometry | null>;

/**
 * Ein Modell in den Koordinaten des Pets, wie es um `blender/pet_reference.obj` modelliert wurde.
 * Hier liegt es als Sticker obenauf, deshalb muss nur modelliert werden, was man von vorn sieht.
 */
function StickerModel({ model, ink }: { model: ModelPromise; ink: string }) {
  const geometry = use(model);
  const cosmetic = useMemo(
    () => geometry && createCosmetic(geometry, ink, "sticker"),
    [geometry, ink],
  );
  useEffect(() => () => void (cosmetic && disposeCosmetic(cosmetic)), [cosmetic]);
  return cosmetic ? <primitive object={cosmetic} /> : null;
}

/**
 * Ein Modell als Sticker mit Outline in `ink`, etwa die Teile des Zauberers. Lade- und Renderfehler
 * lassen es still weg, statt das ganze Pet zu verlieren. `model` sollte stabil sein, wie die
 * Promises aus `@jelly/scene`.
 */
export function Sticker({ model, ink }: { model: ModelPromise; ink: string }) {
  return (
    <RenderBoundary fallback={null}>
      <Suspense fallback={null}>
        <StickerModel model={model} ink={ink} />
      </Suspense>
    </RenderBoundary>
  );
}

/** Das Cosmetic `id` mit Outline in `ink`, falls ein Modell dafür existiert. */
export default function Cosmetic({ id, ink }: { id: string; ink: string }) {
  if (!hasCosmeticModel(id)) return null;
  return <Sticker model={loadCosmetic(id)} ink={ink} />;
}
