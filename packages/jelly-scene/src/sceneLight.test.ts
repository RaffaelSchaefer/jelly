import { BufferGeometry, Color, Float32BufferAttribute, type Mesh, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";

import { JELLY_COLORS } from "./colors.ts";
import { createCosmetic } from "./cosmetic.ts";
import { createJelly } from "./jelly.ts";
import {
  createSceneLight,
  lightMaterial,
  SCENE_LIGHTS,
  setSceneLight,
  setSceneRim,
} from "./sceneLight.ts";
import jellyFragment from "./shaders/jelly.frag.glsl?raw";
import outlineFragment from "./shaders/outline.frag.glsl?raw";
import outlineVertex from "./shaders/outline.vert.glsl?raw";
import toonFragment from "./shaders/toon.frag.glsl?raw";
import toonVertex from "./shaders/toon.vert.glsl?raw";

/** Der Block zwischen den Markierungen `// <scene-light>` und `// </scene-light>`. */
function lightBlock(source: string) {
  const start = source.indexOf("// <scene-light>");
  const end = source.indexOf("// </scene-light>");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** Zeilen außerhalb aller `#ifdef SCENE_LIGHT`-Blöcke, die das Licht trotzdem erwähnen. */
function unguardedLightLines(source: string) {
  let depth = 0;
  let guarded = 0;
  const stray: string[] = [];
  for (const line of source.split("\n").map((text) => text.trim())) {
    if (line.startsWith("#if")) {
      depth += 1;
      if (line === "#ifdef SCENE_LIGHT") guarded = guarded || depth;
    } else if (line.startsWith("#endif")) {
      if (guarded === depth) guarded = 0;
      depth -= 1;
    } else if (
      !guarded &&
      !line.startsWith("//") &&
      /uScene|scene(Diffuse|Rim)|vWorld/.test(line)
    ) {
      stray.push(line);
    }
  }
  return stray;
}

/** Ein kleines Modell mit allem, was der Toon-Shader braucht. */
function model() {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute("normal", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute("aColor", new Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  geometry.setAttribute("aGlowRange", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  return geometry;
}

/** Alle Shader-Materialien in einem Baum. */
function materialsOf(root: { traverse: (visit: (object: unknown) => void) => void }) {
  const found: ShaderMaterial[] = [];
  root.traverse((object) => {
    const material = (object as Partial<Mesh>).material;
    if (material instanceof ShaderMaterial) found.push(material);
  });
  return found;
}

describe("scene light", () => {
  it("holds four lights, a shade, a rim and starts dark", () => {
    const { uniforms } = createSceneLight();
    expect(SCENE_LIGHTS).toBe(4);
    expect(uniforms.uSceneShade.value).toBe(1);
    expect(uniforms.uSceneLights.value).toHaveLength(SCENE_LIGHTS);
    expect(uniforms.uSceneColors.value).toHaveLength(SCENE_LIGHTS);
    for (const slot of uniforms.uSceneLights.value) expect(slot.w).toBe(0);
    for (const tint of uniforms.uSceneColors.value) expect(tint.getHex()).toBe(0);
    expect(uniforms.uSceneRimColor.value.getHex()).toBe(0);
  });

  it("sets position and range, and the colour as linear colour times intensity", () => {
    const light = createSceneLight();
    setSceneLight(light, 2, {
      position: [-0.62, -0.12, 0.75],
      color: "#8fd8ff",
      intensity: 0.5,
      range: 2.3,
    });
    const slot = light.uniforms.uSceneLights.value[2]!;
    expect(slot.toArray()).toEqual([-0.62, -0.12, 0.75, 2.3]);
    const expected = new Color("#8fd8ff").multiplyScalar(0.5);
    expect(light.uniforms.uSceneColors.value[2]!.r).toBeCloseTo(expected.r, 6);
    expect(light.uniforms.uSceneColors.value[2]!.b).toBeCloseTo(expected.b, 6);
    const spot = { position: [0, 0, 0], color: "#fff", intensity: 1, range: 1 } as const;
    expect(() => setSceneLight(light, SCENE_LIGHTS, spot)).toThrow(RangeError);
  });

  it("normalises the rim direction", () => {
    const light = createSceneLight();
    setSceneRim(light, { direction: [-0.35, 0.75, -0.56], color: "#7fa6ff", strength: 0.55 });
    expect(light.uniforms.uSceneRimDir.value.length()).toBeCloseTo(1, 6);
    expect(light.uniforms.uSceneRimColor.value.getHex()).not.toBe(0);
  });
});

describe("lighting materials", () => {
  it("lights a material once, with the very same uniform objects", () => {
    const light = createSceneLight();
    const material = new ShaderMaterial({ uniforms: { uOwn: { value: 1 } } });
    const version = material.version;
    expect(lightMaterial(material, light)).toBe(true);
    expect(material.defines.SCENE_LIGHT).toBe(SCENE_LIGHTS);
    expect(material.uniforms.uSceneShade).toBe(light.uniforms.uSceneShade);
    expect(material.uniforms.uSceneLights).toBe(light.uniforms.uSceneLights);
    expect(material.uniforms.uOwn!.value).toBe(1);
    expect(material.version).toBe(version + 1);
    expect(lightMaterial(material, light)).toBe(false);
    expect(material.version).toBe(version + 1);
  });

  it("takes over another light without compiling again", () => {
    const material = new ShaderMaterial();
    lightMaterial(material, createSceneLight());
    const version = material.version;
    const next = createSceneLight();
    expect(lightMaterial(material, next)).toBe(true);
    expect(material.uniforms.uSceneShade).toBe(next.uniforms.uSceneShade);
    expect(material.version).toBe(version);
  });

  it("leaves jellies and cosmetics unlit until a scene lights them", () => {
    const jelly = createJelly(JELLY_COLORS.mint);
    const cosmetic = createCosmetic(model(), "#123456", "sticker");
    for (const material of [...materialsOf(jelly.root), ...materialsOf(cosmetic)]) {
      expect(material.defines ?? {}).not.toHaveProperty("SCENE_LIGHT");
      expect(material.uniforms).not.toHaveProperty("uSceneShade");
    }
  });

  it("marks the body and the cosmetic fill as lightable, the outline not", () => {
    const body = materialsOf(createJelly(JELLY_COLORS.peach, "optimized").root);
    expect(body.filter((material) => material.userData.lightable)).toHaveLength(1);
    const cosmetic = materialsOf(createCosmetic(model(), "#123456", "depth"));
    expect(cosmetic.map((material) => Boolean(material.userData.lightable)).sort()).toEqual([
      false,
      true,
    ]);
  });
});

describe("scene light shaders", () => {
  it("share one identical light block in the jelly and the toon shader", () => {
    expect(lightBlock(jellyFragment)).toBe(lightBlock(toonFragment));
    expect(lightBlock(jellyFragment)).toContain("vec3 sceneDiffuse(");
    expect(lightBlock(jellyFragment)).toContain("vec3 sceneRim(");
  });

  it("keep everything about the light behind #ifdef SCENE_LIGHT", () => {
    for (const source of [jellyFragment, toonFragment, toonVertex]) {
      expect(unguardedLightLines(source)).toEqual([]);
    }
  });

  it("light the jelly after the studio and before the ink, in both qualities", () => {
    const main = jellyFragment.slice(jellyFragment.indexOf("void main()"));
    const env = main.indexOf("env(reflect(vW, nW))");
    const diffuse = main.indexOf("sceneDiffuse(");
    const rim = main.indexOf("sceneRim(");
    const ink = main.indexOf("color = mix(color, uInk, ink)");
    expect(main.indexOf("#endif", main.lastIndexOf("#ifdef JELLY_OPTIMIZED"))).toBeLessThan(env);
    expect(env).toBeLessThan(diffuse);
    expect(diffuse).toBeLessThan(rim);
    expect(rim).toBeLessThan(ink);
  });

  it("light the toon fill after its facing shade, with the rim last", () => {
    const main = toonFragment.slice(toonFragment.indexOf("void main()"));
    const facing = main.indexOf("color *= 0.62 + 0.38 * facing;");
    expect(facing).toBeGreaterThan(0);
    expect(main.indexOf("sceneDiffuse(")).toBeGreaterThan(facing);
    expect(main.indexOf("sceneRim(")).toBeGreaterThan(main.indexOf("color += vGlow * pow("));
    expect(toonVertex).toContain("vWorldPos =");
    expect(toonVertex).toContain("vWorldNormal =");
  });

  it("never light the outline", () => {
    for (const source of [outlineVertex, outlineFragment]) expect(source).not.toMatch(/SCENE/);
  });
});
