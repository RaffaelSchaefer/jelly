import { Group, Mesh } from "three";
import { expect, test } from "vitest";

import { JELLY_COLORS } from "./colors.ts";
import { animateJelly, createJelly, createMotion, disposeJelly } from "./index.ts";

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
