/**
 * Prüft, was einzelne Cosmetics anders zeichnen: Neon und Teile hinter dem Jelly.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import {
  COSMETIC_MODELS,
  cosmeticLook,
  createCosmetic,
  disposeCosmetic,
  loadCosmetic,
} from "./cosmetic.ts";

/** Lädt ein Modell, das es geben muss. */
async function loadModel(key: string) {
  const model = await loadCosmetic(key);
  if (!model) throw new Error(`Kein Modell für ${key}`);
  return model;
}

describe("Neon", () => {
  it("leuchtet nur an den Cyber-Katzenohren, dort aber nicht überall", async () => {
    const neon = async (key: string) =>
      Array.from((await loadModel(key)).getAttribute("aNeon").array);
    const ears = await neon("cyber-cat-ears");
    expect(ears.some((value) => value === 1)).toBe(true);
    expect(ears.some((value) => value === 0)).toBe(true);
    expect((await neon("cat-ears")).every((value) => value === 0)).toBe(true);
  });
});

describe("hinter dem Jelly", () => {
  it("legt Katzenohren und -schwanz hinter das Jelly, sonst nichts", () => {
    const behind = Object.keys(COSMETIC_MODELS).filter((key) => cosmeticLook(key).behind);
    expect(behind.sort()).toEqual(["cat-ears", "cat-tail", "cyber-cat-ears"]);
  });

  it("zeichnet es vor allen Stickern und löscht die Tiefe nicht", async () => {
    const model = await loadModel("cat-tail");
    const behind = createCosmetic(model, "#16248a", "sticker", { behind: true });
    const sticker = createCosmetic(model, "#16248a", "sticker");
    const [outline, fill] = behind.children;
    expect(outline!.renderOrder).toBeLessThan(fill!.renderOrder);
    expect(fill!.renderOrder).toBeLessThan(sticker.children[0]!.renderOrder);
    // Die Tiefe bleibt stehen: Körper, Kopf und Hände verdecken es.
    let cleared = 0;
    const renderer = { clearDepth: () => cleared++ };
    for (const mesh of behind.children) {
      (mesh.onBeforeRender as unknown as (target: typeof renderer) => void)(renderer);
    }
    expect(cleared).toBe(0);
    [behind, sticker].forEach(disposeCosmetic);
  });

  it("gilt nicht auf der Bühne, dort zählt die echte Tiefe", async () => {
    const model = await loadModel("cat-tail");
    const order = (look: { behind?: boolean }) =>
      createCosmetic(model, "#16248a", "depth", look).children.map((mesh) => mesh.renderOrder);
    expect(order({ behind: true })).toEqual(order({}));
  });
});
