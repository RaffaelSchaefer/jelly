/**
 * Prüft das Modell des Zauberers: Alle Teile laden aus einer Datei, passen in die Bühne des Shops,
 * lassen Mund und Augen frei und bleiben außerhalb von Katalog, Karte und Beamer. Die Grenzen
 * stehen auch in `apps/client/blender/README.md`, `build_wizard.py -- --check` prüft dieselben.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { COSMETIC_MODELS, loadModelParts } from "./cosmetic.ts";
import wizardModel from "./cosmetics/wizard.glb?url&inline";
import {
  animateWizard,
  BEARD_PIVOT,
  HAT_PIVOT,
  loadWizardPart,
  placeEyes,
  ORB_REST,
  WIZARD_CRYSTAL,
  WIZARD_PALETTE,
  WIZARD_PARTS,
  type WizardPart,
} from "./wizard.ts";

/** Alle Teile, wie sie in Blender heißen. */
const PARTS = Object.keys(WIZARD_PARTS) as WizardPart[];

/** Ein Punkt eines Modells. */
interface Point {
  x: number;
  y: number;
  z: number;
}

/** Alle Punkte der Teile `parts`, in Koordinaten ihres Ankers. */
async function pointsOf(...parts: WizardPart[]): Promise<Point[]> {
  const models = await Promise.all(parts.map(loadWizardPart));
  return models.flatMap((model) => {
    const position = model.getAttribute("position");
    return Array.from({ length: position.count }, (_, index) => ({
      x: position.getX(index),
      y: position.getY(index),
      z: position.getZ(index),
    }));
  });
}

/** Kleinster und größter Wert über alle Punkte. */
function extent(points: Point[], read: (point: Point) => number) {
  const values = points.map(read);
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Wo Mund und halb geschlossene Augen liegen, als Bereich von |x| und y. |x| prüft auch die
 * gespiegelte zweite Hälfte von Brauen und Schnurrbart.
 */
const KEEP_CLEAR = {
  mouth: { x: [0, 0.12], y: [0.345, 0.52] },
  eye: { x: [0.11, 0.27], y: [0.58, 0.69] },
} as const;

describe("Teile des Zauberers", () => {
  it("sind 14, alle in einer Datei und nur diese", async () => {
    expect(PARTS).toHaveLength(14);
    const names = [...(await loadModelParts(wizardModel)).keys()];
    expect(names.sort()).toEqual([...PARTS].sort());
  });

  it.each(PARTS)("%s lädt mit allem, was der Shader liest", async (part) => {
    const model = await loadWizardPart(part);
    const count = model.getAttribute("position").count;
    expect(count).toBeGreaterThan(0);
    for (const name of ["normal", "aColor", "aGlowRange"]) {
      expect(model.getAttribute(name).count).toBe(count);
    }
  });

  it("bleibt im Budget: höchstens 10 500 Vertices und 380 000 Bytes", async () => {
    const parts = await loadModelParts(wizardModel);
    const vertices = [...parts.values()].reduce(
      (sum, model) => sum + model.getAttribute("position").count,
      0,
    );
    expect(vertices).toBeLessThanOrEqual(10_500);
    expect(atob(wizardModel.slice(wizardModel.indexOf(",") + 1)).length).toBeLessThanOrEqual(
      380_000,
    );
  });

  it("gibt für dasselbe Teil dasselbe Promise", () => {
    expect(loadWizardPart("hat")).toBe(loadWizardPart("hat"));
    expect(loadWizardPart("wand")).toBe(loadWizardPart("wand"));
  });

  it("zeichnet nur Brauen und Schnurrbart gespiegelt, um ihren Drehpunkt", () => {
    const mirrored = PARTS.filter((part) => WIZARD_PARTS[part].mirrored);
    expect(mirrored).toEqual(["brow", "mustache"]);
    expect(WIZARD_PARTS.brow.pivot).toEqual([0.22, 0.77, 0.74]);
    expect(WIZARD_PARTS.mustache.pivot).toEqual([0.04, 0.556, 0.79]);
  });
});

describe("Hut und Haar", () => {
  it("bleibt mit Outline unter der Oberkante des Shops und in seiner Breite", async () => {
    const hat = await pointsOf("hat", "hatTrim");
    expect(extent(hat, (p) => p.y).max + WIZARD_PARTS.hat.outline).toBeLessThan(2.1);
    expect(extent(hat, (p) => Math.abs(p.x)).max).toBeLessThanOrEqual(1.02);
  });

  it("lässt die Krempe vorn nicht über die Augen hängen", async () => {
    const front = (await pointsOf("hat")).filter((p) => Math.abs(p.x) < 0.42 && p.z > 0.5);
    expect(extent(front, (p) => p.y).min).toBeGreaterThanOrEqual(0.85);
  });

  it("schiebt das Haar unter die Krempe", async () => {
    const hair = await pointsOf("hair");
    expect(extent(hair, (p) => p.y).max).toBeLessThanOrEqual(0.97);
    expect(extent(hair, (p) => Math.abs(p.x)).max).toBeLessThanOrEqual(0.69);
  });
});

describe("Gesicht", () => {
  it("lässt Mund und Augen frei", async () => {
    const face = await pointsOf("hair", "locks", "beard", "brow", "mustache", "nose");
    for (const { x, y } of Object.values(KEEP_CLEAR)) {
      const covering = face.filter(
        (p) => Math.abs(p.x) > x[0] && Math.abs(p.x) < x[1] && p.y > y[0] && p.y < y[1],
      );
      expect(covering).toEqual([]);
    }
  });

  it("hält Bart und Locken über der Theke", async () => {
    expect(extent(await pointsOf("beard", "locks"), (p) => p.y).min).toBeGreaterThanOrEqual(-0.27);
  });

  it("enthält von Brauen und Schnurrbart nur die rechte Hälfte", async () => {
    expect(extent(await pointsOf("brow", "mustache"), (p) => p.x).min).toBeGreaterThanOrEqual(0);
  });

  it("setzt die Nase in die Mitte", async () => {
    expect(extent(await pointsOf("nose"), (p) => Math.abs(p.x)).max).toBeLessThanOrEqual(0.06);
  });
});

describe("Robe, Kugel und Zauberstab", () => {
  it("hängt die Robe um die Schultern, nicht um den Kopf", async () => {
    const robe = await pointsOf("robe", "clasps");
    expect(extent(robe, (p) => p.y).max).toBeLessThanOrEqual(0.17);
    expect(extent(robe, (p) => Math.abs(p.x)).max).toBeLessThanOrEqual(0.95);
    const high = robe.filter((p) => p.y > 0);
    expect(extent(high, (p) => Math.abs(p.x)).max).toBeLessThanOrEqual(0.75);
  });

  it("stellt den Ständer der Kugel auf die Theke", async () => {
    expect(extent(await pointsOf("orbStand"), (p) => p.y).min).toBeCloseTo(-0.32, 2);
    const orb = await pointsOf("orbStand", "orbSparks", "orbClaws");
    expect(extent(orb, (p) => Math.abs(p.x)).max).toBeLessThanOrEqual(0.34);
    expect(extent(orb, (p) => p.y).max).toBeLessThanOrEqual(0.35);
  });

  it("hält den Zauberstab schlank in der Hand", async () => {
    const wand = await pointsOf("wand");
    expect(extent(wand, (p) => Math.abs(p.x)).max).toBeLessThanOrEqual(0.09);
    const { min, max } = extent(wand, (p) => p.y);
    expect(min).toBeGreaterThanOrEqual(-0.13);
    expect(max).toBeLessThanOrEqual(0.67);
  });

  it("legt Kugel und Hut an ihre Plätze", () => {
    expect(ORB_REST).toEqual([1.68, 0, 0.75]);
    expect(HAT_PIVOT).toEqual([0, 0.99, 0.2]);
  });

  it("dehnt den Bart von seiner Oberkante aus", async () => {
    const top = Math.max(...(await pointsOf("beard")).map((point) => point.y));
    expect(BEARD_PIVOT[1]).toBeCloseTo(top, 1);
  });

  it("bringt Gesten und Blick gleich mit", () => {
    expect(animateWizard).toBeTypeOf("function");
    expect(placeEyes).toBeTypeOf("function");
  });
});

describe("Farben", () => {
  it("nutzt sechsstellige Hex-Farben für Körper und Kugel", () => {
    const colors = [...Object.values(WIZARD_PALETTE), WIZARD_CRYSTAL.deep, WIZARD_CRYSTAL.mist];
    for (const color of [...colors, WIZARD_CRYSTAL.core]) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(WIZARD_PALETTE.hex).toBe("#4636a6");
    expect(WIZARD_CRYSTAL).toMatchObject({ radius: 0.21, layer: 1, outline: 0.025 });
  });

  it("bleibt außerhalb von Katalog, Karte und Beamer", () => {
    expect(Object.keys(COSMETIC_MODELS).filter((key) => key.startsWith("wizard"))).toEqual([]);
  });
});
