/**
 * Prüft die Modelle im Bundle. Im Betrieb bliebe ein Ladefehler still: Das Cosmetic fehlt dann
 * einfach.
 *
 * @module
 */

import { Mesh, Object3D, type ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";

import {
  COSMETIC_MODELS,
  COSMETIC_OUTLINE,
  createCosmetic,
  disposeCosmetic,
  hasCosmeticModel,
  loadCosmetic,
} from "./cosmetic.ts";

/** Oberkante des Sichtbereichs, darüber liegt die Sprechblase (`apps/client/blender/README.md`). */
const BUBBLE_Y = 1.6;

/** Lädt ein Modell, das es geben muss. */
async function loadModel(key: string) {
  const model = await loadCosmetic(key);
  if (!model) throw new Error(`Kein Modell für ${key}`);
  return model;
}

describe("Cosmetic-Modelle", () => {
  it("kennt die Modelle im Bundle und nichts anderes", () => {
    expect(hasCosmeticModel("beanie")).toBe(true);
    expect(hasCosmeticModel("headset")).toBe(true);
    expect(hasCosmeticModel("headset-neutral")).toBe(true);
    expect(hasCosmeticModel("pixel-glasses")).toBe(true);
    expect(hasCosmeticModel("unbekannt")).toBe(false);
    expect(hasCosmeticModel("constructor")).toBe(false);
  });

  it.each(Object.keys(COSMETIC_MODELS))("%s lädt und hält die Regeln ein", async (key) => {
    const model = await loadModel(key);
    const count = model.getAttribute("position").count;
    // Die Outline schiebt jeden Vertex entlang seiner Normale.
    expect(model.getAttribute("normal").count).toBe(count);
    expect(model.getAttribute("aColor").count).toBe(count);
    expect(model.getAttribute("aGlowRange").count).toBe(count);
    model.computeBoundingBox();
    expect(model.boundingBox!.max.y + COSMETIC_OUTLINE).toBeLessThan(BUBBLE_Y);
  });

  it("merkt sich jedes Teil mit eigener Farbe und eigenem y-Bereich", async () => {
    const model = await loadModel("headset");
    const ranges = model.getAttribute("aGlowRange");
    const colors = model.getAttribute("aColor");
    const distinct = (read: (index: number) => string) =>
      new Set(Array.from({ length: ranges.count }, (_, index) => read(index))).size;
    expect(distinct((index) => `${ranges.getX(index)}|${ranges.getY(index)}`)).toBe(7);
    expect(distinct((index) => `${colors.getX(index)}|${colors.getY(index)}`)).toBe(3);
  });

  it("gibt für denselben Schlüssel dasselbe Promise, Fremdes ergibt null", async () => {
    expect(loadCosmetic("headset")).toBe(loadCosmetic("headset"));
    await expect(loadCosmetic("unbekannt")).resolves.toBeNull();
  });
});

describe("createCosmetic", () => {
  /** Die zwei Meshes eines Cosmetics, Outline zuerst. */
  function meshesOf(cosmetic: Object3D) {
    return cosmetic.children as [Mesh, Mesh];
  }

  it("zeichnet zwei Meshes ohne Group, die Outline zuerst und ohne Tiefe", async () => {
    const cosmetic = createCosmetic(await loadModel("headset"), "#16248a", "depth");
    const [outline, fill] = meshesOf(cosmetic);
    expect(cosmetic.type).toBe("Object3D");
    expect(outline.renderOrder).toBeLessThan(fill.renderOrder);
    expect((outline.material as { depthWrite: boolean }).depthWrite).toBe(false);
    expect((fill.material as { depthWrite: boolean }).depthWrite).toBe(true);
    disposeCosmetic(cosmetic);
  });

  it("rückt die Tiefe nur auf der Bühne zur Kamera", async () => {
    const model = await loadModel("headset");
    const bias = (mode: "depth" | "sticker") =>
      meshesOf(createCosmetic(model, "#16248a", mode)).map(
        (mesh) => (mesh.material as ShaderMaterial).uniforms.uDepthBias?.value as number,
      );
    expect(bias("sticker")).toEqual([0, 0]);
    expect(bias("depth")[0]).toBeGreaterThan(0);
    expect(bias("depth")[1]).toBe(bias("depth")[0]);
  });

  it("löscht die Tiefe nur als Sticker", async () => {
    const model = await loadModel("headset");
    let cleared = 0;
    const renderer = { clearDepth: () => cleared++ };
    const render = (mesh: Mesh) =>
      (mesh.onBeforeRender as unknown as (target: typeof renderer) => void)(renderer);
    render(meshesOf(createCosmetic(model, "#16248a", "depth"))[0]);
    expect(cleared).toBe(0);
    render(meshesOf(createCosmetic(model, "#16248a", "sticker"))[0]);
    expect(cleared).toBe(1);
  });
});
