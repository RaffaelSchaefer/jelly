/**
 * Cosmetics laden und zeichnen. App, Karte und Beamer zeigen damit dieselben Modelle.
 *
 * Die Modelle entstehen in `apps/client/blender/cosmetics.blend`. Ein neues Modell braucht hier
 * eine Import-Zeile: esbuild, das die Bühne des Servers baut, kennt kein `import.meta.glob`.
 *
 * @module
 */

import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Object3D,
  ShaderMaterial,
  type MeshStandardMaterial,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import headsetNeutral from "./cosmetics/headset-neutral.glb?url&inline";
import headset from "./cosmetics/headset.glb?url&inline";
import outlineFragmentShader from "./shaders/outline.frag.glsl?raw";
import outlineVertexShader from "./shaders/outline.vert.glsl?raw";
import fragmentShader from "./shaders/toon.frag.glsl?raw";
import vertexShader from "./shaders/toon.vert.glsl?raw";

/**
 * Modelle als Data-URL nach Schlüssel. Sie liegen im Bundle, denn `connect-src` der App verbietet
 * der Oberfläche `fetch`, auch auf eigene Dateien. `tauri dev` zeigt das nicht: Dort kommt die
 * Seite direkt von Vite, ohne CSP. Erst das gebaute Binary würde das Modell still weglassen.
 */
// ponytail: Alle Modelle liegen im Chunk der Szene. Dynamische Importe trennten sie, falls sie groß
// werden. `?inline` allein geht nicht, Vite kennt `.glb` nicht als Asset.
export const COSMETIC_MODELS: Readonly<Record<string, string>> = {
  headset,
  "headset-neutral": headsetNeutral,
};

/** Breite der Outline in Szenen-Einheiten. */
export const COSMETIC_OUTLINE = 0.035;

/** Zeichenebene: über dem Gesicht (6–7), die Outline vor der Füllung. */
const OUTLINE_ORDER = 8;
const FILL_ORDER = 9;

/**
 * So weit rückt die Tiefe im Modus `depth` zur Kamera, in Einheiten des Jellys. Die Bühne blickt
 * von oben, ohne den Versatz verdeckte der Kopf das Mikro und die Outline dort, wo das Cosmetic
 * anliegt. Durch den ganzen Kopf reicht er nicht, von hinten scheint also nichts durch.
 */
const DEPTH_BIAS = 0.2;

/**
 * Wie ein Cosmetic zu dem steht, was schon gezeichnet ist.
 *
 * - `sticker`: Es löscht vorher die Tiefe und liegt obenauf. Für die App, wo nichts davor steht.
 * - `depth`: Normaler Tiefentest, für die Bühne. Dort stünde ein Jelly sonst vor dem Sofa, das vor
 *   ihm steht.
 */
export type CosmeticMode = "sticker" | "depth";

/** Die Data-URL des Modells `key`, falls es eins gibt. Schlüssel kommen vom Server. */
function findModelUrl(key: string) {
  return Object.hasOwn(COSMETIC_MODELS, key) ? COSMETIC_MODELS[key] : undefined;
}

/** Ob es für das Cosmetic schon ein Modell gibt. */
export function hasCosmeticModel(key: string) {
  return findModelUrl(key) !== undefined;
}

/** Liest eine Data-URL. `GLTFLoader.load` holte sie per `fetch`. */
function decodeDataUrl(url: string) {
  const base64 = url.slice(url.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
}

/** Ein Mesh aus der glTF-Datei in Koordinaten des Jellys, mit Farbe und y-Bereich je Vertex. */
function createPart(mesh: Mesh) {
  const source = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  source.computeBoundingBox();
  const { min, max } = source.boundingBox!;
  const { color } = (
    Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  ) as MeshStandardMaterial;
  const count = source.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  const ranges = new Float32Array(count * 2);
  for (let index = 0; index < count; index++) {
    colors.set([color.r, color.g, color.b], index * 3);
    ranges.set([min.y, max.y], index * 2);
  }
  // Nur was der Shader liest: Mit weiteren Attributen scheiterte das Zusammenfassen an Unterschieden.
  const part = new BufferGeometry();
  part.setAttribute("position", source.getAttribute("position"));
  part.setAttribute("normal", source.getAttribute("normal"));
  part.setAttribute("aColor", new BufferAttribute(colors, 3));
  part.setAttribute("aGlowRange", new BufferAttribute(ranges, 2));
  part.setIndex(source.getIndex());
  return part;
}

/** Fasst alle Meshes zu einer Geometrie zusammen: zwei Draw-Calls je Träger statt zwei je Teil. */
function mergeParts(scene: Object3D) {
  scene.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh) parts.push(createPart(object));
  });
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error("Cosmetic: Die Teile passen nicht zusammen");
  return merged;
}

/** Bereits geladene Modelle. Alle Jellies teilen sie, darum werden sie nie freigegeben. */
const LOADED = new Map<string, Promise<BufferGeometry | null>>();

/**
 * Lädt das Modell `key` als eine Geometrie, ohne Modell ist das Ergebnis `null`. Für denselben
 * Schlüssel kommt immer dasselbe Promise, so kann React darauf warten.
 */
export function loadCosmetic(key: string) {
  const known = LOADED.get(key);
  if (known) return known;
  const url = findModelUrl(key);
  const loading = url
    ? new GLTFLoader().parseAsync(decodeDataUrl(url), "").then(({ scene }) => mergeParts(scene))
    : Promise.resolve(null);
  LOADED.set(key, loading);
  return loading;
}

/**
 * Ein Cosmetic in der Tintenfarbe `ink`, in Koordinaten des Jellys. Für Kopf und Gesicht gehört es
 * in `Jelly.faceAnchor`. `Object3D` statt `Group`, damit die Bühne das Jelly weiter als Ganzes
 * sortiert. Das Material gehört ihm, `disposeJelly` oder {@link disposeCosmetic} geben es frei.
 */
export function createCosmetic(model: BufferGeometry, ink: string, mode: CosmeticMode) {
  const uDepthBias = { value: mode === "depth" ? DEPTH_BIAS : 0 };
  // Die Outline schreibt keine Tiefe: Sonst läge ihr Rand über Teilen dahinter, wie eine Innenlinie.
  const outline = new Mesh(
    model,
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      uniforms: {
        uWidth: { value: COSMETIC_OUTLINE },
        uInk: { value: new Color(ink) },
        uDepthBias,
      },
      vertexShader: outlineVertexShader,
      fragmentShader: outlineFragmentShader,
    }),
  );
  outline.renderOrder = OUTLINE_ORDER;
  if (mode === "sticker") outline.onBeforeRender = (renderer) => renderer.clearDepth();
  const fill = new Mesh(
    model,
    new ShaderMaterial({ uniforms: { uDepthBias }, vertexShader, fragmentShader }),
  );
  fill.renderOrder = FILL_ORDER;
  const cosmetic = new Object3D();
  cosmetic.add(outline, fill);
  return cosmetic;
}

/** Gibt die Materialien eines Cosmetics frei. Das Modell teilen sich alle Jellies und es bleibt. */
export function disposeCosmetic(cosmetic: Object3D) {
  cosmetic.traverse((object) => {
    if (object instanceof Mesh) (object.material as ShaderMaterial).dispose();
  });
}
