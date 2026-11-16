/**
 * Prüft die Modelle des Zauberers: Sie laden, passen in die Bühne des Shops und lassen Mund und
 * Augen frei.
 *
 * @module
 */

import type { BufferGeometry } from "three";

import { describe, expect, it } from "vitest";

import { COSMETIC_MODELS, COSMETIC_OUTLINE } from "./cosmetic.ts";
import { loadWizardPart, WIZARD_PALETTE, type WizardPart } from "./wizard.ts";

/** Oberkante dessen, was die Kamera des Shops über dem Zauberer zeigt. */
const SHOP_TOP = 2.1;

/** Wo der Mund spricht und wo die halb geschlossenen Augen liegen, als [x-Bereich, y-Bereich]. */
const KEEP_CLEAR: [[number, number], [number, number]][] = [
  [
    [-0.12, 0.12],
    [0.38, 0.52],
  ],
  [
    [0.13, 0.25],
    [0.61, 0.71],
  ],
  [
    [-0.25, -0.13],
    [0.61, 0.71],
  ],
];

/** Alle Punkte eines Modells als [x, y]. */
function pointsOf(model: BufferGeometry): [number, number][] {
  const position = model.getAttribute("position");
  return Array.from({ length: position.count }, (_, index) => [
    position.getX(index),
    position.getY(index),
  ]);
}

describe("Zauberer", () => {
  it.each<WizardPart>(["hat", "face", "orb"])(
    "%s lädt mit allem, was der Shader liest",
    async (part) => {
      const model = await loadWizardPart(part);
      const count = model.getAttribute("position").count;
      expect(model.getAttribute("normal").count).toBe(count);
      expect(model.getAttribute("aColor").count).toBe(count);
      expect(model.getAttribute("aGlowRange").count).toBe(count);
    },
  );

  it("gibt für dasselbe Teil dasselbe Promise", () => {
    expect(loadWizardPart("hat")).toBe(loadWizardPart("hat"));
  });

  it("hält den Hut unter der Oberkante des Shops", async () => {
    const model = await loadWizardPart("hat");
    model.computeBoundingBox();
    expect(model.boundingBox!.max.y + COSMETIC_OUTLINE).toBeLessThan(SHOP_TOP);
  });

  it("lässt Mund und Augen frei", async () => {
    const points = pointsOf(await loadWizardPart("face"));
    for (const [[x0, x1], [y0, y1]] of KEEP_CLEAR) {
      const covering = points.filter(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1);
      expect(covering).toEqual([]);
    }
  });

  it("hält die Kugel um den Ursprung", async () => {
    const model = await loadWizardPart("orb");
    model.computeBoundingBox();
    const { min, max } = model.boundingBox!;
    expect(Math.max(-min.x, max.x, -min.y, max.y)).toBeLessThan(0.4);
  });

  it("bleibt außerhalb von Katalog, Karte und Beamer", () => {
    expect(Object.keys(COSMETIC_MODELS).filter((key) => key.startsWith("wizard"))).toEqual([]);
    expect(WIZARD_PALETTE.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});
