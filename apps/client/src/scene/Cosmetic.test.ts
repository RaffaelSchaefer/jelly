/**
 * Prüft die Modelle im Bundle. In der App bliebe ein Ladefehler still: `RenderBoundary` lässt das
 * Cosmetic dann einfach weg.
 *
 * @module
 */

import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { Box3, Mesh } from "three";
import { describe, expect, it, vi } from "vitest";

import { InlineGLTFLoader, MODELS } from "./Cosmetic";

// Fiber zöge hier sonst die CommonJS-Variante von Three nach. Die Modelle brauchen es nicht.
vi.mock("@react-three/fiber", () => ({ useLoader: vi.fn() }));

/** Oberkante des Sichtbereichs, darüber liegt die Sprechblase (`blender/README.md`). */
const BUBBLE_Y = 1.6;

/** Breite der Outline, siehe `GlossyPart.tsx`. */
const OUTLINE = 0.035;

/** Lädt ein Modell mit dem Lader der App. */
function load(url: string) {
  return new Promise<GLTF>((resolve, reject) => {
    new InlineGLTFLoader().load(url, resolve, undefined, reject);
  });
}

describe("Cosmetic-Modelle", () => {
  it("enthält beide Headsets", () => {
    expect(MODELS).toHaveProperty(["../cosmetics/headset.glb"]);
    expect(MODELS).toHaveProperty(["../cosmetics/headset-neutral.glb"]);
  });

  it.each(Object.entries(MODELS))("%s lädt und hält die Regeln ein", async (_path, url) => {
    const { scene } = await load(url);
    const meshes: Mesh[] = [];
    scene.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    expect(meshes.length).toBeGreaterThan(0);
    // Die Outline schiebt jeden Vertex entlang seiner Normale.
    for (const mesh of meshes) expect(mesh.geometry.getAttribute("normal")).toBeDefined();
    expect(new Box3().setFromObject(scene).max.y + OUTLINE).toBeLessThan(BUBBLE_Y);
  });
});
