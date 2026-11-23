/**
 * Prüft, was einzelne Cosmetics anders zeichnen: Neon, Teile hinter dem Jelly und Pulsieren.
 *
 * @module
 */

import { Object3D, Vector3, type Mesh, type ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";

import {
  COSMETIC_MODELS,
  COSMETIC_OUTLINE,
  cosmeticLook,
  createCosmetic,
  disposeCosmetic,
  loadCosmetic,
} from "./cosmetic.ts";
import { pulseCosmetics } from "./cosmeticPulse.ts";

/** Oberkante des Sichtbereichs, darüber liegt die Sprechblase (`apps/client/blender/README.md`). */
const BUBBLE_Y = 1.6;

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

describe("Pulsieren", () => {
  it("lässt nur den Oktopus pulsieren", () => {
    const pulsing = Object.keys(COSMETIC_MODELS).filter((key) => cosmeticLook(key).pulse);
    expect(pulsing).toEqual(["octopus"]);
  });

  it("schwillt um seinen Punkt an und steht bei reduzierter Bewegung still", async () => {
    const look = cosmeticLook("octopus");
    const pulse = look.pulse!;
    const cosmetic = createCosmetic(await loadModel("octopus"), "#16248a", "sticker", look);
    const root = new Object3D().add(cosmetic);
    const peak = 0.5 / pulse.rate;
    pulseCosmetics(root, peak, false);
    expect(cosmetic.scale.x).toBeCloseTo(1 + pulse.amount);
    const centre = new Vector3(...pulse.at);
    const moved = centre.clone().multiplyScalar(cosmetic.scale.x).add(cosmetic.position);
    expect(moved.distanceTo(centre)).toBeCloseTo(0);
    pulseCosmetics(root, peak, true);
    expect(cosmetic.scale.x).toBe(1);
    expect(cosmetic.position.length()).toBe(0);
    disposeCosmetic(cosmetic);
  });

  it("lässt seine Arme wedeln, bei reduzierter Bewegung nicht", async () => {
    const look = cosmeticLook("octopus");
    const cosmetic = createCosmetic(await loadModel("octopus"), "#16248a", "sticker", look);
    const root = new Object3D().add(cosmetic);
    const moves = cosmetic.children.map(
      (mesh) => ((mesh as Mesh).material as ShaderMaterial).uniforms.uWaveMove?.value as Vector3,
    );
    // Füllung und Outline teilen sich das Uniform, sonst liefen sie auseinander.
    expect(moves[0]).toBe(moves[1]);
    pulseCosmetics(root, 1, false);
    expect(moves[0]!.x).toBe(look.wave!.amount);
    expect(moves[0]!.z).toBeCloseTo(2 * Math.PI * look.wave!.rate);
    pulseCosmetics(root, 1, true);
    expect(moves[0]!.x).toBe(0);
    disposeCosmetic(cosmetic);
  });

  it("lässt ohne Angabe nichts wedeln", async () => {
    const [outline] = createCosmetic(await loadModel("crown"), "#16248a", "sticker").children;
    const move = ((outline as Mesh).material as ShaderMaterial).uniforms.uWaveMove
      ?.value as Vector3;
    expect(move.x).toBe(0);
  });

  it("bleibt auch angeschwollen unter der Sprechblase", async () => {
    const pulse = cosmeticLook("octopus").pulse!;
    const model = await loadModel("octopus");
    model.computeBoundingBox();
    const swell = 1 + pulse.amount;
    const top = pulse.at[1] + (model.boundingBox!.max.y - pulse.at[1]) * swell;
    expect(top + COSMETIC_OUTLINE * swell).toBeLessThan(BUBBLE_Y);
  });
});
