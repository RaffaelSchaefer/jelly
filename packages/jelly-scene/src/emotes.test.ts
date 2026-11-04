/**
 * Gesten bleiben zeitlich begrenzt und hinterlassen keine veränderte Grundpose.
 *
 * @module
 */

import { MeshBasicMaterial } from "three";
import { expect, test } from "vitest";

import { EMOTE_GLYPHS, EMOTE_SECONDS, isEmoteKey, type EmoteKey } from "./emotes.ts";
import { animateJelly, createJelly, createMotion, JELLY_COLORS, type Jelly } from "./index.ts";

const frame = { time: 1, rawDelta: 0.016, pulse: 0, holding: false, reducedMotion: false };
const keys = Object.keys(EMOTE_GLYPHS) as EmoteKey[];

/** Alle von einer Geste veränderten Eigenschaften. */
function pose(jelly: Jelly) {
  const parts = [jelly.root, jelly.head, ...jelly.hands, ...jelly.face.eyes, jelly.face.mouth];
  return {
    parts: parts.map((part) => [
      part.visible,
      ...part.position,
      ...part.scale,
      ...part.rotation.toArray(),
    ]),
    cheeks: jelly.face.cheeks.map((cheek) => [
      cheek.visible,
      (cheek.material as MeshBasicMaterial).opacity,
    ]),
  };
}

/** Eine unbewegte Ausgangspose ohne Stupser. */
function resting() {
  const jelly = createJelly(JELLY_COLORS.mint);
  animateJelly(jelly, createMotion(0), frame);
  return pose(jelly);
}

test.each(keys)("%s ist erkennbar, beginnt weich und endet in der Grundpose", (key) => {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  const baseline = resting();
  animateJelly(jelly, motion, { ...frame, emote: { key, elapsed: 0 } });
  expect(pose(jelly)).toEqual(baseline);
  animateJelly(jelly, motion, { ...frame, emote: { key, elapsed: 0.9 } });
  expect(pose(jelly)).not.toEqual(baseline);
  animateJelly(jelly, motion, { ...frame, emote: { key, elapsed: EMOTE_SECONDS } });
  expect(pose(jelly)).toEqual(baseline);
});

test.each(keys)("%s sammelt keine Transformationen an und lässt sich erneut abspielen", (key) => {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  const input = { ...frame, emote: { key, elapsed: 0.9 } };
  animateJelly(jelly, motion, input);
  const first = pose(jelly);
  for (let step = 0; step < 10; step++) animateJelly(jelly, motion, input);
  expect(pose(jelly)).toEqual(first);
  animateJelly(jelly, motion, frame);
  animateJelly(jelly, motion, input);
  expect(pose(jelly)).toEqual(first);
});

test.each(keys)("%s hat bei reduzierter Bewegung eine ruhige Pose mit klarem Ende", (key) => {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  const input = { ...frame, reducedMotion: true };
  animateJelly(jelly, motion, input);
  const baseline = pose(jelly);
  animateJelly(jelly, motion, { ...input, emote: { key, elapsed: 0 } });
  const first = pose(jelly);
  expect(first).not.toEqual(baseline);
  animateJelly(jelly, motion, { ...input, emote: { key, elapsed: 2.5 } });
  expect(pose(jelly)).toEqual(first);
  animateJelly(jelly, motion, { ...input, emote: { key, elapsed: EMOTE_SECONDS } });
  expect(pose(jelly)).toEqual(baseline);
});

test("Ein Wechsel verwirft die alte Geste, auch ihre Mimik", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  animateJelly(jelly, motion, { ...frame, emote: { key: "love", elapsed: 1 } });
  animateJelly(jelly, motion, { ...frame, emote: { key: "wave", elapsed: 1 } });
  const fresh = createJelly(JELLY_COLORS.mint);
  animateJelly(fresh, createMotion(0), { ...frame, emote: { key: "wave", elapsed: 1 } });
  expect(pose(jelly)).toEqual(pose(fresh));
});

test("Unbekannte Schlüssel und ungültige Zeiten erzeugen keine Geste", () => {
  expect(isEmoteKey("wave")).toBe(true);
  for (const key of ["future", "constructor", "__proto__"]) expect(isEmoteKey(key)).toBe(false);
  const jelly = createJelly(JELLY_COLORS.mint);
  for (const elapsed of [-1, NaN, Infinity, EMOTE_SECONDS + 1]) {
    animateJelly(jelly, createMotion(0), { ...frame, emote: { key: "wave", elapsed } });
    expect(pose(jelly)).toEqual(resting());
  }
});
