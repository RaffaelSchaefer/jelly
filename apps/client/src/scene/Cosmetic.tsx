/**
 * Lädt und zeichnet das 3D-Modell eines Cosmetics.
 *
 * Die Modelle entstehen in `blender/cosmetics.blend` und werden von `blender/setup_cosmetics.py`
 * als `src/cosmetics/<id>.glb` exportiert. Cosmetics ohne Datei zeigen einfach nichts.
 *
 * @module
 */

import { useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import { BufferGeometry, Color, Mesh, MeshStandardMaterial, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { PET_COLORS, type PetColor } from "../pet";
import GlossyPart from "./GlossyPart";
import RenderBoundary from "./RenderBoundary";

/** Modell-URLs nach Pfad. Vite löst sie beim Build auf. */
const MODELS = import.meta.glob<string>("../cosmetics/*.glb", {
  query: "?url",
  import: "default",
  eager: true,
});

/** Ob es für das Cosmetic schon ein Modell gibt. */
export function hasCosmeticModel(id: string) {
  return `../cosmetics/${id}.glb` in MODELS;
}

/** Zeichenebene für Cosmetics: Render-Order 8–9, also über dem Gesicht (6–7). */
const COSMETIC_LAYER = 4;

/** Ein Mesh aus der glTF-Datei, bereit für {@link GlossyPart}. */
interface Part {
  geometry: BufferGeometry;
  hex: string;
  range: [number, number];
}

/** Sammelt alle Meshes einer Szene in Weltkoordinaten, jeweils mit Grundfarbe und y-Bereich. */
function collectParts(scene: Object3D): Part[] {
  scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox();
    const material = (
      Array.isArray(object.material) ? object.material[0] : object.material
    ) as MeshStandardMaterial;
    parts.push({
      geometry,
      hex: `#${material.color.getHexString()}`,
      range: [geometry.boundingBox!.min.y, geometry.boundingBox!.max.y],
    });
  });
  return parts;
}

/** Hellt `hex` zu 45 % in Richtung Weiß auf, als Leuchtfarbe des Teils. */
function glowOf(hex: string) {
  return `#${new Color(hex).lerp(new Color("#ffffff"), 0.45).getHexString()}`;
}

/**
 * Ein Cosmetic in den Koordinaten des Pets, wie es um `blender/pet_reference.obj` modelliert wurde.
 * Jedes Material wird in seiner Grundfarbe mit dem Toon-Shader gezeichnet und in der Tintenfarbe
 * des Pets umrandet. Es löscht vorher die Tiefe und liegt als Sticker obenauf. Deshalb muss nur
 * modelliert werden, was man von vorn sieht.
 */
function CosmeticModel({ url, color }: { url: string; color: PetColor }) {
  const gltf = useLoader(GLTFLoader, url);
  const parts = useMemo(() => collectParts(gltf.scene), [gltf]);
  useEffect(() => () => parts.forEach((part) => part.geometry.dispose()), [parts]);
  return (
    <>
      {parts.map((part, index) => (
        <GlossyPart
          key={index}
          geometry={part.geometry}
          layer={COSMETIC_LAYER}
          range={part.range}
          paint={{ hex: part.hex, glow: glowOf(part.hex), outline: PET_COLORS[color].outline }}
        />
      ))}
    </>
  );
}

/**
 * Das Cosmetic `id`, falls ein Modell dafür existiert. Lade- und Renderfehler lassen es still weg,
 * statt das ganze Pet zu verlieren.
 */
export default function Cosmetic({ id, color }: { id: string; color: PetColor }) {
  const url = MODELS[`../cosmetics/${id}.glb`];
  if (!url) return null;
  return (
    <RenderBoundary fallback={null}>
      <Suspense fallback={null}>
        <CosmeticModel url={url} color={color} />
      </Suspense>
    </RenderBoundary>
  );
}
