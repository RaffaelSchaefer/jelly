/**
 * Beleuchtet alles in der Szene, was sich beleuchten lässt: Körper der Jellies und die Füllung
 * ihrer Sticker (`userData.lightable` aus `@jelly/scene`). Nur der Shop nutzt das, Pet, Karte und
 * Bühne des Servers bleiben ohne Licht.
 *
 * @module
 */

import type { Material, Object3D, ShaderMaterial } from "three";

import { lightMaterial, type SceneLight } from "@jelly/scene";
import { useFrame } from "@react-three/fiber";

/** Vor allem anderen: Erst danach schreiben die Lichter, und Fiber zeichnet zuletzt. */
const PATCH_PRIORITY = -3;

/** Ob `material` ein Shader-Material ist, das beleuchtet werden will. */
function isLightable(material: Material): material is ShaderMaterial {
  return material.userData.lightable === true && (material as ShaderMaterial).isShaderMaterial;
}

/** Beleuchtet die Materialien eines Objekts, falls sie es wollen. */
function lightObject(object: Object3D, light: SceneLight) {
  const { material } = object as Object3D & { material?: Material | Material[] };
  if (!material) return;
  for (const each of Array.isArray(material) ? material : [material]) {
    if (isLightable(each)) lightMaterial(each, light);
  }
}

/**
 * Geht jedes Bild die ganze Szene durch, bevor gezeichnet wird. Sticker zur Anprobe kommen erst
 * spät dazu, so haben auch sie das Licht schon im ersten Bild. Bereits beleuchtete Materialien
 * kosten nur einen Vergleich, kompiliert wird nur ein neues.
 */
export function useSceneLight(light: SceneLight) {
  useFrame(({ scene }) => scene.traverse((object) => lightObject(object, light)), PATCH_PRIORITY);
}
