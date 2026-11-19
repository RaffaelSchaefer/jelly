/**
 * Prüft die Kristallkugel: zwei Meshes in ihrer Malschicht, eine Outline wie bei Stickern, Farben
 * als `Color` und eine Zeit, die nur weiterläuft, wenn man sie setzt.
 *
 * @module
 */

import { BackSide, Color, type Mesh, type ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";

import { animateCrystalBall, createCrystalBall, disposeCrystalBall } from "./crystal.ts";
import { WIZARD_CRYSTAL, WIZARD_PALETTE } from "./wizard.ts";

/** Die Kugel des Zauberers in Schicht 1. */
function wizardBall() {
  return createCrystalBall({ ...WIZARD_CRYSTAL, ink: WIZARD_PALETTE.outline });
}

/** Outline und Füllung einer Kugel mit ihren Materialien. */
function partsOf(ball: ReturnType<typeof createCrystalBall>) {
  const [outline, fill] = ball.children as [Mesh, Mesh];
  return {
    outline,
    fill,
    outlineMaterial: outline.material as ShaderMaterial,
    fillMaterial: fill.material as ShaderMaterial,
  };
}

describe("createCrystalBall", () => {
  it("zeichnet zwei Meshes ohne Group, die Outline zuerst", () => {
    const ball = wizardBall();
    const { outline, fill } = partsOf(ball);
    expect(ball.type).toBe("Object3D");
    expect(ball.children).toHaveLength(2);
    expect(outline.renderOrder).toBeLessThan(fill.renderOrder);
    expect(outline.geometry).toBe(fill.geometry);
  });

  it("liegt in Schicht 1 mit einer Outline wie ein Sticker", () => {
    const { outline, fill, outlineMaterial } = partsOf(wizardBall());
    expect([outline.renderOrder, fill.renderOrder]).toEqual([10, 11]);
    expect(outlineMaterial.side).toBe(BackSide);
    expect(outlineMaterial.depthWrite).toBe(false);
    expect(outlineMaterial.uniforms.uWidth?.value).toBe(0.025);
    expect(outlineMaterial.uniforms.uInk?.value).toEqual(new Color(WIZARD_PALETTE.outline));
  });

  it("löscht vor der Outline die Tiefe", () => {
    const { outline } = partsOf(wizardBall());
    let cleared = 0;
    (outline.onBeforeRender as unknown as (renderer: { clearDepth(): void }) => void)({
      clearDepth: () => cleared++,
    });
    expect(cleared).toBe(1);
  });

  it("gibt die Farben des Glases als Color an den Shader", () => {
    const { uniforms } = partsOf(wizardBall()).fillMaterial;
    expect(uniforms.uDeep?.value).toEqual(new Color(WIZARD_CRYSTAL.deep));
    expect(uniforms.uMist?.value).toEqual(new Color(WIZARD_CRYSTAL.mist));
    expect(uniforms.uCore?.value).toEqual(new Color(WIZARD_CRYSTAL.core));
  });

  it("hat den Radius des Zauberers", () => {
    const { fill } = partsOf(wizardBall());
    fill.geometry.computeBoundingSphere();
    expect(fill.geometry.boundingSphere!.radius).toBeCloseTo(WIZARD_CRYSTAL.radius, 5);
  });
});

describe("animateCrystalBall", () => {
  it("schreibt Zeit und Aufflammen in die Füllung", () => {
    const ball = wizardBall();
    const { uniforms } = partsOf(ball).fillMaterial;
    expect([uniforms.uTime?.value, uniforms.uPulse?.value]).toEqual([0, 0]);
    animateCrystalBall(ball, 4.5, 0.75);
    expect([uniforms.uTime?.value, uniforms.uPulse?.value]).toEqual([4.5, 0.75]);
  });

  it("lässt andere Objekte in Ruhe", () => {
    const { outline } = partsOf(wizardBall());
    expect(() => animateCrystalBall(outline, 1, 1)).not.toThrow();
  });
});

describe("disposeCrystalBall", () => {
  it("gibt Geometrie und beide Materialien frei", () => {
    const ball = wizardBall();
    const { fill, outlineMaterial, fillMaterial } = partsOf(ball);
    const freed: string[] = [];
    fill.geometry.addEventListener("dispose", () => freed.push("geometry"));
    outlineMaterial.addEventListener("dispose", () => freed.push("outline"));
    fillMaterial.addEventListener("dispose", () => freed.push("fill"));
    disposeCrystalBall(ball);
    expect(freed.sort()).toEqual(["fill", "geometry", "outline"]);
  });
});
