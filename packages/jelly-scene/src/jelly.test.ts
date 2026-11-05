import { Group, Mesh, type ShaderMaterial } from "three";
import { expect, test } from "vitest";

import { JELLY_COLORS } from "./colors.ts";
import { EMOTE_GLYPHS } from "./emotes.ts";
import { animateJelly, createJelly, createMotion, disposeJelly, type Jelly } from "./index.ts";

const frame = { time: 1, rawDelta: 0.016, reducedMotion: false, holding: false };

test("the jelly has no Group inside, so a stage can sort whole jellies", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  jelly.root.traverse((object) => expect(object instanceof Group).toBe(false));
});

test("body, head and hands are siblings, because the shader reads their local position", () => {
  const jelly = createJelly(JELLY_COLORS.lilac);
  const body = jelly.root.children.find((child) => child instanceof Mesh);
  expect(body).toBeDefined();
  expect(jelly.head.parent).toBe(jelly.root);
  for (const hand of jelly.hands) expect(hand.parent).toBe(jelly.root);
});

test("only the optimized jelly selects the cheap shader path, the full one stays the default", () => {
  const defines = (jelly: ReturnType<typeof createJelly>) =>
    (
      (jelly.root.children.find((child) => child instanceof Mesh) as Mesh)
        .material as ShaderMaterial
    ).defines;
  expect(defines(createJelly(JELLY_COLORS.mint))).not.toHaveProperty("JELLY_OPTIMIZED");
  expect(defines(createJelly(JELLY_COLORS.mint, "full"))).not.toHaveProperty("JELLY_OPTIMIZED");
  expect(defines(createJelly(JELLY_COLORS.mint, "optimized"))).toHaveProperty("JELLY_OPTIMIZED");
});

test("both qualities move alike, so the emote and mouth tests hold for the optimized jelly too", () => {
  const pose = ({ root, head, hands, face }: Jelly) =>
    [root, head, ...hands, ...face.eyes, face.mouth].map((part) => [
      part.visible,
      ...part.position,
      ...part.scale,
      ...part.rotation.toArray(),
    ]);
  const mouth = { shape: "a", width: 1.1, height: 0.9, nod: 1 } as const;
  for (const key of Object.keys(EMOTE_GLYPHS) as (keyof typeof EMOTE_GLYPHS)[]) {
    const [full, optimized] = (["full", "optimized"] as const).map((quality) => {
      const jelly = createJelly(JELLY_COLORS.mint, quality);
      const input = { ...frame, pulse: 1, emote: { key, elapsed: 1.5 }, mouth };
      animateJelly(jelly, createMotion(0), input);
      return pose(jelly);
    });
    expect(optimized).toEqual(full);
  }
});

test("every eye is one mesh and the cheeks are hidden until the jelly is happy", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  expect(jelly.face.eyes.every((eye) => eye instanceof Mesh)).toBe(true);
  animateJelly(jelly, createMotion(0), { ...frame, pulse: 0 });
  expect(jelly.face.cheeks.every((cheek) => !cheek.visible)).toBe(true);
});

test("a pulse brings the hands out and makes the jelly happy", () => {
  const jelly = createJelly(JELLY_COLORS.peach);
  const motion = createMotion(0);
  animateJelly(jelly, motion, { ...frame, pulse: 0 });
  expect(jelly.hands.every((hand) => !hand.visible)).toBe(true);
  for (let step = 0; step < 10; step++) {
    animateJelly(jelly, motion, { ...frame, time: 2 + step * 0.016, pulse: 1 });
  }
  expect(jelly.hands.every((hand) => hand.visible)).toBe(true);
  expect(motion.bounce).toBeGreaterThan(0);
});

test("disposing frees the materials without breaking the shared shapes", () => {
  const first = createJelly(JELLY_COLORS.mint);
  const second = createJelly(JELLY_COLORS.mint);
  disposeJelly(first);
  const shapes = (jelly: typeof first) => {
    const geometries: unknown[] = [];
    jelly.root.traverse((object) => {
      if (object instanceof Mesh) geometries.push(object.geometry);
    });
    return geometries;
  };
  expect(shapes(second)).toEqual(shapes(first));
});
