import assert from "node:assert/strict";
import { test } from "node:test";

import { CHANNEL_COLORS, FLASH_COLORS, LIVE_COLOR, ON_COLOR, pickColors } from "./newsBarPaint.ts";
import {
  coverStripes,
  deepen,
  findLacquer,
  lighten,
  measureContrast,
  measureLuminance,
  NEIGHBOR,
  paintLacquer,
  paintStripes,
} from "./newsBarTexture.ts";

const URGENT_COLORS = pickColors(true);
const PALETTES = [CHANNEL_COLORS, URGENT_COLORS, FLASH_COLORS];

/** Lightness as the eye counts it, from 0 to 100. */
function measureLightness(color: string): number {
  const luminance = measureLuminance(color);
  return luminance > 0.008856 ? 116 * Math.cbrt(luminance) - 16 : 903.3 * luminance;
}

/** A color mixed toward another the way the canvas does, rounded. */
function mixColor(first: string, second: string, share: number): string {
  const channels = [first, second].map((color) => {
    const value = Number.parseInt(color.slice(1, 7), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  });
  const [from = [], to = []] = channels;
  const mixed = from.map((value, index) => Math.round(value + ((to[index] ?? 0) - value) * share));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

test("neighboring tones only ever go one way", () => {
  for (const color of PALETTES.flatMap((colors) => Object.values(colors))) {
    assert.ok(measureLuminance(deepen(color, 0.2)) <= measureLuminance(color));
    assert.ok(measureLuminance(lighten(color, 0.2)) >= measureLuminance(color));
  }
  assert.equal(deepen("#ffffff", 0), "#ffffff");
  assert.equal(deepen("#808080", 0.5), "#404040");
});

test("lacquer never costs the letters on it their contrast", () => {
  const surfaces = [
    ...PALETTES.map((colors) => ({ color: colors.brand, ink: ON_COLOR })),
    { color: LIVE_COLOR, ink: ON_COLOR },
    { color: CHANNEL_COLORS.deep, ink: ON_COLOR },
    { color: CHANNEL_COLORS.accent, ink: CHANNEL_COLORS.deep },
  ];
  for (const { color, ink } of surfaces) {
    const text = measureLuminance(ink) > measureLuminance(color) ? "light" : "dark";
    const before = measureContrast(ink, color);
    for (const tone of findLacquer(color, text)) {
      assert.ok(measureContrast(ink, tone) >= before, `${ink} on ${tone} for ${color}`);
    }
  }
});

test("the stripes of a band are its own color over a deeper one: no hue, no lost contrast", () => {
  for (const colors of PALETTES) {
    for (const [color, depth] of [
      [colors.deep, NEIGHBOR.band],
      [colors.strip, NEIGHBOR.strip],
    ] as const) {
      const deeper = deepen(color, depth);
      assert.ok(measureContrast(ON_COLOR, deeper) >= measureContrast(ON_COLOR, color));
      assert.ok(measureContrast(colors.accent, deeper) >= measureContrast(colors.accent, color));
    }
  }
});

test("the stripes stay a few percent of lightness, below the front of the desk", () => {
  // The desk front: its accent at a tenth over the deep blue, with hard edges.
  const desk = mixColor(CHANNEL_COLORS.deep, CHANNEL_COLORS.accent, 0.1);
  const loudest = measureLightness(desk) - measureLightness(CHANNEL_COLORS.deep);
  for (const colors of PALETTES) {
    for (const [color, depth] of [
      [colors.deep, NEIGHBOR.band],
      [colors.strip, NEIGHBOR.strip],
    ] as const) {
      const step = measureLightness(color) - measureLightness(deepen(color, depth));
      assert.ok(step >= 2 && step < 6, `${color}: ${step}`);
      assert.ok(step < loudest, `${color} is as loud as the desk`);
    }
  }
});

test("stripes are soft, alternately wide and thin, and join without a seam", () => {
  const samples = Array.from({ length: 1000 }, (_, index) => coverStripes(index / 1000));
  assert.ok(samples.every((cover) => cover >= 0 && cover <= 1));
  assert.equal(coverStripes(0.25), 1);
  assert.equal(coverStripes(0.72), 1);
  assert.equal(coverStripes(0.55), 0);
  assert.equal(coverStripes(0), coverStripes(0.999999));
  const wide = samples.slice(0, 500).filter((cover) => cover > 0.5).length;
  const thin = samples.slice(500).filter((cover) => cover > 0.5).length;
  assert.ok(wide > 2.5 * thin && thin > 0);
  // Soft edges: between full and none there are steps in between.
  assert.ok(samples.some((cover) => cover > 0.2 && cover < 0.8));
});

test("without a page there are no stripes, lacquer still paints, the canvas is left as it was", () => {
  const calls: string[] = [];
  let depth = 0;
  const target: Record<string | symbol, unknown> = {
    globalAlpha: 1,
    getTransform: () => ({ a: 2, b: 0 }),
    save: () => (depth += 1),
    restore: () => (depth -= 1),
    fillRect: () => calls.push("fillRect"),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createPattern: () => null,
  };
  const context = new Proxy(target, {
    get: (object, key) => (key in object ? object[key] : () => undefined),
  }) as unknown as CanvasRenderingContext2D;
  const rect = { x: 0, y: 0, width: 50, height: 20 };
  paintStripes(context, rect, { color: CHANNEL_COLORS.deep, alpha: 1 }, { period: 8, x: 0, y: 0 });
  assert.deepEqual(calls, []);
  paintLacquer(context, rect, CHANNEL_COLORS.brand, "light");
  assert.deepEqual(calls, ["fillRect", "fillRect"]);
  assert.equal(depth, 0);
});
