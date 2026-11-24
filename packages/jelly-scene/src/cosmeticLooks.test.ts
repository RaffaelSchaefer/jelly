/**
 * Prüft, was einzelne Cosmetics anders zeichnen: Neon, Teile hinter dem Jelly und Pulsieren.
 *
 * @module
 */

import {
  Matrix4,
  Object3D,
  Vector3,
  type BufferGeometry,
  type Mesh,
  type ShaderMaterial,
} from "three";
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
  it("leuchtet an den Cyber-Katzenohren und im Plasma der BFG, dort aber nicht überall", async () => {
    const neon = async (key: string) =>
      Array.from((await loadModel(key)).getAttribute("aNeon").array);
    for (const key of ["cyber-cat-ears", "bfg"]) {
      const glowing = await neon(key);
      expect(glowing.some((value) => value === 1)).toBe(true);
      expect(glowing.some((value) => value === 0)).toBe(true);
    }
    expect((await neon("cat-ears")).every((value) => value === 0)).toBe(true);
  });
});

describe("hinter dem Jelly", () => {
  it("legt Katzenohren, -schwanz und die BFG hinter das Jelly, sonst nichts", () => {
    const behind = Object.keys(COSMETIC_MODELS).filter((key) => cosmeticLook(key).behind);
    expect(behind.sort()).toEqual(["bfg", "cat-ears", "cat-tail", "cyber-cat-ears"]);
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

/**
 * Der höchste Punkt, den ein pulsierendes Cosmetic erreicht: Stauchen, Strecken und Schaukeln über
 * viele Schläge, dazu der volle Ausschlag seiner Arme, wo sie wedeln.
 */
function highestPoint(cosmetic: Object3D, model: BufferGeometry) {
  const root = new Object3D().add(cosmetic);
  const wave = cosmeticLook("octopus").wave!;
  const points = model.getAttribute("position");
  const hub = new Vector3(...wave.at);
  const point = new Vector3();
  let top = -Infinity;
  for (let time = 0; time < 12; time += 0.03) {
    pulseCosmetics(root, time, false);
    for (let index = 0; index < points.count; index += 1) {
      point.fromBufferAttribute(points, index);
      // Wie im Shader wächst der Ausschlag vom Rand des Kopfes bis zur Spitze des Arms.
      const far = Math.min(1, Math.max(0, (point.distanceTo(hub) - wave.from) / wave.span));
      const waves = wave.amount * far;
      top = Math.max(top, point.applyMatrix4(cosmetic.matrix).y + waves);
    }
  }
  return top;
}

describe("Pulsieren", () => {
  it("lässt nur den Oktopus pulsieren", () => {
    const pulsing = Object.keys(COSMETIC_MODELS).filter((key) => cosmeticLook(key).pulse);
    expect(pulsing).toEqual(["octopus"]);
  });

  it("wackelt um seinen Punkt und steht bei reduzierter Bewegung still", async () => {
    const look = cosmeticLook("octopus");
    const pulse = look.pulse!;
    const cosmetic = createCosmetic(await loadModel("octopus"), "#16248a", "sticker", look);
    const root = new Object3D().add(cosmetic);
    const centre = new Vector3(...pulse.at);
    for (const time of [0.1, 0.37, 1.9]) {
      pulseCosmetics(root, time, false);
      // Der Punkt staucht und schaukelt nicht mit.
      expect(centre.clone().applyMatrix4(cosmetic.matrix).distanceTo(centre)).toBeCloseTo(0);
      // Wie Wackelpudding: Was es flacher wird, geht es in die Breite, der Inhalt bleibt.
      expect(cosmetic.matrix.determinant()).toBeCloseTo(1);
      expect(cosmetic.matrix.equals(new Matrix4())).toBe(false);
    }
    pulseCosmetics(root, 0.37, true);
    expect(cosmetic.matrix.equals(new Matrix4())).toBe(true);
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

  it("bleibt in jeder Lage unter der Sprechblase", async () => {
    const look = cosmeticLook("octopus");
    const model = await loadModel("octopus");
    const cosmetic = createCosmetic(model, "#16248a", "sticker", look);
    // Gestaucht geht es in die Breite, die Outline mit: höchstens so weit, wie es sich staucht.
    const widest = 1 / Math.sqrt(1 - look.pulse!.amount);
    expect(highestPoint(cosmetic, model) + COSMETIC_OUTLINE * widest).toBeLessThan(BUBBLE_Y);
    disposeCosmetic(cosmetic);
  });
});
