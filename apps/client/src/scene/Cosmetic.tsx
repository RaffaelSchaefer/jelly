/**
 * Zeichnet das 3D-Modell eines Cosmetics. Laden und Bauen stehen in `@jelly/scene`, die Bühne nutzt
 * dieselben Modelle.
 *
 * @module
 */

import type { BufferGeometry, Object3D } from "three";

import {
  createCosmetic,
  disposeCosmetic,
  hasCosmeticModel,
  loadCosmetic,
  type CosmeticLook,
} from "@jelly/scene";
import { useFrame } from "@react-three/fiber";
import { Suspense, use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { springScale } from "../pet/spring";
import RenderBoundary from "./RenderBoundary";
import { MaterializeContext, type MaterializeContextValue } from "./stageLook";

/** Ein Modell, das noch lädt. Ohne Modell löst es zu `null` auf. */
type ModelPromise = Promise<BufferGeometry | null>;

/** Eigenschaften von {@link Sticker}: Modell und Tinte, dazu Malschicht und Strichstärke. */
interface StickerProps extends CosmeticLook {
  model: ModelPromise;
  ink: string;
}

/**
 * Ein Modell in den Koordinaten des Pets, wie es um `blender/pet_reference.obj` modelliert wurde.
 * Hier liegt es als Sticker obenauf, deshalb muss nur modelliert werden, was man von vorn sieht.
 */
function StickerModel({ model, ink, layer, outline }: StickerProps) {
  const geometry = use(model);
  const cosmetic = useMemo(
    () => geometry && createCosmetic(geometry, ink, "sticker", { layer, outline }),
    [geometry, ink, layer, outline],
  );
  useEffect(() => () => void (cosmetic && disposeCosmetic(cosmetic)), [cosmetic]);
  // Nur beim ersten Erscheinen: Ein späterer Wechsel des Contexts lässt nichts mehr aufspringen.
  const materialize = use(MaterializeContext);
  const [pop] = useState(() => materialize && { ...materialize, start: performance.now() });
  if (!cosmetic || !geometry) return null;
  if (!pop) return <primitive object={cosmetic} />;
  return <Springing cosmetic={cosmetic} geometry={geometry} pop={pop} />;
}

/** Ein Aufspringen, das zur Zeit `start` (ms) beginnt. */
type Pop = MaterializeContextValue & { start: number };

/**
 * Ein Sticker, der aus seiner Mitte aufspringt: unsichtbar bis zur Wartezeit, dann von 0 über 1,12
 * auf seine Größe. Danach steht er still wie jeder andere.
 */
function Springing({
  cosmetic,
  geometry,
  pop,
}: {
  cosmetic: Object3D;
  geometry: BufferGeometry;
  pop: Pop;
}) {
  const holder = useRef<Object3D>(null);
  const done = useRef(false);
  const center = useMemo(() => {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    return geometry.boundingSphere?.center.toArray() ?? [0, 0, 0];
  }, [geometry]);
  // Vor dem ersten Bild verstecken, sonst stünde er einen Augenblick schon in voller Größe da.
  useLayoutEffect(() => {
    if (holder.current) holder.current.visible = false;
  }, []);
  useFrame(() => {
    const node = holder.current;
    if (!node || done.current) return;
    const elapsed = performance.now() - pop.start;
    const scale = springScale(elapsed, pop);
    node.visible = scale > 1e-3;
    node.scale.setScalar(Math.max(scale, 1e-3));
    done.current = elapsed >= pop.delayMs + pop.durationMs;
  });
  const [x, y, z] = center;
  return (
    <object3D ref={holder} position={[x, y, z]}>
      <object3D position={[-x, -y, -z]}>
        <primitive object={cosmetic} />
      </object3D>
    </object3D>
  );
}

/**
 * Ein Modell als Sticker mit Outline in `ink`, etwa die Teile des Zauberers. Eine höhere Malschicht
 * (`layer`) deckt tiefere ganz ab, mit eigenem Tintenrand der Breite `outline`. Lade- und
 * Renderfehler lassen es still weg, statt das ganze Pet zu verlieren. `model` sollte stabil sein,
 * wie die Promises aus `@jelly/scene`.
 */
export function Sticker({ model, ink, layer = 0, outline }: StickerProps) {
  return (
    <RenderBoundary fallback={null}>
      <Suspense fallback={null}>
        <StickerModel model={model} ink={ink} layer={layer} outline={outline} />
      </Suspense>
    </RenderBoundary>
  );
}

/** Das Cosmetic `id` mit Outline in `ink` in der Malschicht `layer`, falls ein Modell existiert. */
export default function Cosmetic({ id, ink, layer }: { id: string; ink: string; layer?: number }) {
  if (!hasCosmeticModel(id)) return null;
  return <Sticker model={loadCosmetic(id)} ink={ink} layer={layer} />;
}
