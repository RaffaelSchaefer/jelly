/**
 * Prüft die Modelle im Bundle. Im Betrieb bliebe ein Ladefehler still: Das Cosmetic fehlt dann
 * einfach.
 *
 * @module
 */

import {
  CustomBlending,
  Mesh,
  NormalBlending,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  SrcAlphaFactor,
  type ShaderMaterial,
} from "three";
import { describe, expect, it } from "vitest";

import {
  COSMETIC_MODELS,
  COSMETIC_OUTLINE,
  createCosmetic,
  disposeCosmetic,
  hasCosmeticModel,
  loadCosmetic,
  loadModelParts,
  stickerOrder,
} from "./cosmetic.ts";
import { COSMETIC_MODEL_KEYS } from "./cosmeticKeys.ts";

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
    // Die Liste ohne Three.js nennt jedes Modell, `cosmeticKeys.test.ts` hält sie vollständig.
    for (const key of COSMETIC_MODEL_KEYS) expect(hasCosmeticModel(key)).toBe(true);
    expect(hasCosmeticModel("glow-aura")).toBe(false);
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
    expect(model.getAttribute("aFluff").count).toBe(count);
    expect(model.getAttribute("aTint").count).toBe(count);
    expect(model.getAttribute("aGlass").count).toBe(count);
    expect(model.getAttribute("aNeon").count).toBe(count);
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

/** Was der Server einfärben lässt (`colorable` in `apps/server/internal/rules/cosmetics.go`). */
const COLORABLE = new Set([
  "beanie",
  "hood",
  "headset",
  "pixel-glasses",
  "party-hat",
  "crown",
  "ogre-ears",
  "goose",
  "long-schnoerbi",
  "bandana",
  "bell-collar",
  "knit-scarf",
  "mini-backpack",
  "fairy-wings",
  "bat-wings",
  "snail-shell",
  "kamina-glasses",
  "cat-ears",
  "cyber-cat-ears",
  "kitten",
  "yarn-ball",
  "cat-paws",
  "cat-tail",
]);

describe("Farbe des Trägers", () => {
  // Ohne `tint` aus Blender gäbe es im Studio eine Farbwahl, die nichts tut.
  it.each(Object.keys(COSMETIC_MODELS))("%s färbt nur, was der Server einfärbt", async (key) => {
    const tints = (await loadModel(key)).getAttribute("aTint");
    const tinted = Array.from({ length: tints.count }, (_, index) => tints.getX(index)).some(
      (tint) => tint > 0,
    );
    expect(tinted).toBe(COLORABLE.has(key));
  });

  it("gibt die Farbe linear an den Shader, ohne Farbe bleibt sie aus", async () => {
    const model = await loadModel("beanie");
    const tintOf = (tint?: string | null) =>
      (
        (createCosmetic(model, "#16248a", "sticker", { tint }).children[1] as Mesh)
          .material as ShaderMaterial
      ).uniforms.uTint?.value as { x: number; w: number };
    expect(tintOf().w).toBe(0);
    expect(tintOf(null).w).toBe(0);
    expect(tintOf("#ffffff")).toMatchObject({ x: 1, w: 1 });
    expect(tintOf("#808080").x).toBeCloseTo(0.2158, 3);
  });
});

describe("Malschichten", () => {
  /** Outline und Füllung eines Cosmetics mit ihren Materialien. */
  async function drawn(mode: "depth" | "sticker", look?: { layer?: number; outline?: number }) {
    const [outline, fill] = createCosmetic(await loadModel("headset"), "#16248a", mode, look)
      .children as [Mesh, Mesh];
    return {
      outline,
      fill,
      width: (outline.material as ShaderMaterial).uniforms.uWidth?.value as number,
    };
  }

  it("legt jede Schicht zwei Stufen höher", () => {
    expect(stickerOrder()).toEqual({ outline: 8, fill: 9 });
    expect(stickerOrder(2)).toEqual({ outline: 12, fill: 13 });
    expect(stickerOrder(4)).toEqual({ outline: 16, fill: 17 });
  });

  it("zeichnet Schicht 2 mit feinerem Strich und löscht die Tiefe", async () => {
    const { outline, fill, width } = await drawn("sticker", { layer: 2, outline: 0.02 });
    expect([outline.renderOrder, fill.renderOrder]).toEqual([12, 13]);
    expect(width).toBe(0.02);
    let cleared = 0;
    (outline.onBeforeRender as unknown as (renderer: { clearDepth(): void }) => void)({
      clearDepth: () => cleared++,
    });
    expect(cleared).toBe(1);
  });

  it("bleibt ohne Angaben wie bisher, auch auf der Bühne", async () => {
    for (const mode of ["depth", "sticker"] as const) {
      const { outline, fill, width } = await drawn(mode);
      expect([outline.renderOrder, fill.renderOrder]).toEqual([8, 9]);
      expect(width).toBe(COSMETIC_OUTLINE);
    }
  });

  it("markiert die Füllung als beleuchtbar, die Outline nicht", async () => {
    const { outline, fill } = await drawn("sticker");
    expect((fill.material as ShaderMaterial).userData.lightable).toBe(true);
    expect((outline.material as ShaderMaterial).userData.lightable).toBeUndefined();
  });
});

describe("Glas", () => {
  /** Outline und Füllung der Kamina-Brille, deren Glas durchscheint. */
  async function glasses(mode: "depth" | "sticker", layer?: number) {
    const model = await loadModel("kamina-glasses");
    return createCosmetic(model, "#16248a", mode, { layer }).children as [Mesh, Mesh];
  }

  /** Wie oft Outline und Füllung vor dem Zeichnen die Tiefe löschen. */
  function clears(meshes: Mesh[]) {
    let cleared = 0;
    const renderer = { clearDepth: () => cleared++ };
    for (const mesh of meshes) {
      (mesh.onBeforeRender as unknown as (target: typeof renderer) => void)(renderer);
    }
    return cleared;
  }

  it("zeichnet zuletzt in seiner Malschicht, erst die Füllung, dann die Outline", async () => {
    const [outline, fill] = await glasses("sticker", 1);
    expect(fill.renderOrder).toBeGreaterThan(stickerOrder(1).fill);
    expect(outline.renderOrder).toBeGreaterThan(fill.renderOrder);
    expect(outline.renderOrder).toBeLessThan(stickerOrder(2).outline);
  });

  it("löscht als Sticker die Tiefe vor der Füllung, auf der Bühne nie", async () => {
    const [outline, fill] = await glasses("sticker");
    expect(clears([fill])).toBe(1);
    expect(clears([outline])).toBe(0);
    expect(clears(await glasses("depth"))).toBe(0);
  });

  it("mischt nur Glas mit dem Hintergrund und bleibt dabei in der Reihenfolge", async () => {
    const material = (await glasses("depth"))[1].material as ShaderMaterial;
    expect(material).toMatchObject({
      blending: CustomBlending,
      transparent: false,
      blendSrc: SrcAlphaFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
    });
    const headset = createCosmetic(await loadModel("headset"), "#16248a", "depth");
    expect(((headset.children[1] as Mesh).material as ShaderMaterial).blending).toBe(
      NormalBlending,
    );
  });
});

/** Ein Dreieck in der Ebene z = 0, mit Normalen nach vorn. */
const TRIANGLE = {
  position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  index: new Uint16Array([0, 1, 2]),
};

/**
 * GlTF einer kleinen Szene: zwei rote und blaue Meshes im Teil `hat`, das blaue verschoben und mit
 * gedämpftem Leuchten, dazu ein Mesh ohne eigenen Namen unter einem Knoten `beard`.
 */
function sceneJson(byteLength: number) {
  const primitive = (material: number) => ({
    attributes: { POSITION: 0, NORMAL: 1 },
    indices: 2,
    material,
  });
  return {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1, 2] }],
    nodes: [
      { mesh: 0, extras: { part: "hat" } },
      { mesh: 1, extras: { part: "hat" }, translation: [2, 0, 0] },
      { children: [3], extras: { part: "beard" } },
      { mesh: 0 },
    ],
    meshes: [{ primitives: [primitive(0)] }, { primitives: [primitive(1)] }],
    materials: [
      { pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } },
      {
        pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1] },
        extras: { glow: 0.5, fluff: 0.75 },
      },
    ],
    buffers: [{ byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 6 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
    ],
  };
}

/** Die Testszene als GLB-Data-URL, so wie Vite Modelle einbettet. */
function syntheticModel() {
  const bin = new Uint8Array(80);
  bin.set(new Uint8Array(TRIANGLE.position.buffer), 0);
  bin.set(new Uint8Array(TRIANGLE.normal.buffer), 36);
  bin.set(new Uint8Array(TRIANGLE.index.buffer), 72);
  const text = new TextEncoder().encode(JSON.stringify(sceneJson(78)));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const glb = new Uint8Array(28 + jsonLength + bin.length);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, glb.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  glb.fill(0x20, 20, 20 + jsonLength);
  glb.set(text, 20);
  view.setUint32(20 + jsonLength, bin.length, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true); // "BIN"
  glb.set(bin, 28 + jsonLength);
  return `data:model/gltf-binary;base64,${btoa(String.fromCharCode(...glb))}`;
}

describe("loadModelParts", () => {
  const url = syntheticModel();

  it("fasst die Meshes je Teil zusammen, auch über den Elternknoten", async () => {
    const parts = await loadModelParts(url);
    expect([...parts.keys()].sort()).toEqual(["beard", "hat"]);
    const hat = parts.get("hat")!;
    for (const name of [
      "position",
      "normal",
      "aColor",
      "aGlowRange",
      "aFluff",
      "aTint",
      "aGlass",
      "aNeon",
    ]) {
      expect(hat.getAttribute(name).count).toBe(6);
    }
    expect(hat.getAttribute("uv")).toBeUndefined();
    expect(parts.get("beard")!.getAttribute("position").count).toBe(3);
  });

  it("behält Lage, Farbe und Leuchten jedes Meshes", async () => {
    const hat = (await loadModelParts(url)).get("hat")!;
    // Das zweite Dreieck liegt um 2 verschoben, ist blau und leuchtet halb.
    expect(hat.getAttribute("position").getX(4)).toBe(3);
    expect([hat.getAttribute("aColor").getX(0), hat.getAttribute("aColor").getZ(3)]).toEqual([
      1, 1,
    ]);
    expect([
      hat.getAttribute("aGlowRange").getZ(0),
      hat.getAttribute("aGlowRange").getZ(3),
    ]).toEqual([1, 0.5]);
    // Ohne `fluff` glänzt ein Teil wie immer, das blaue ist zu drei Vierteln Plüsch.
    expect([hat.getAttribute("aFluff").getX(0), hat.getAttribute("aFluff").getX(3)]).toEqual([
      0, 0.75,
    ]);
  });

  it("gibt für dieselbe URL dasselbe Promise", () => {
    expect(loadModelParts(url)).toBe(loadModelParts(url));
  });
});
