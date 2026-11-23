/**
 * Berührungen laufen ab und hinterlassen keine veränderte Grundpose. Ohne `touch` bleibt alles wie
 * zuvor.
 *
 * @module
 */

import { expect, test } from "vitest";

import { animateJelly, createJelly, createMotion, JELLY_COLORS, type Jelly } from "./index.ts";
import { BOOP_SECONDS, boopPhases, type TouchFrame } from "./touch.ts";

// Längste Bildzeit: So klingt das Streicheln in wenigen Bildern ab.
const frame = { time: 1, rawDelta: 0.1, pulse: 0, holding: false, reducedMotion: false };

/** Lage, Größe und Formen der Teile, die eine Berührung bewegt. */
function pose(jelly: Jelly) {
  const { eyes, mouth } = jelly.face;
  return {
    shapes: [...eyes, mouth].map((part) => part.geometry.uuid),
    parts: [jelly.root, jelly.head, ...eyes, mouth].map((part) => [
      ...part.position,
      ...part.scale,
      ...part.rotation.toArray(),
    ]),
  };
}

/** Pose nach je einem Bild mit diesen Berührungen, ein leeres Bild ganz ohne. */
function posed(touches: (TouchFrame | null)[], reducedMotion = false) {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  for (const touch of touches)
    animateJelly(jelly, motion, { ...frame, reducedMotion, touch: touch ?? undefined });
  return { jelly, pose: pose(jelly) };
}

test("without touch, and with an empty one, the jelly rests as before", () => {
  const resting = posed([null]).pose;
  expect(posed([{}]).pose).toEqual(resting);
  expect(posed([{ boop: Number.NaN }]).pose).toEqual(resting);
});

test("a nose boop flinches, then giggles, then smiles, and ends on time", () => {
  const at = (elapsed: number) => boopPhases(elapsed);
  expect(at(0.2)).toMatchObject({ flinch: 1, giggle: 0, smile: 0 });
  expect(at(0.7)).toMatchObject({ flinch: 0, giggle: 1, smile: 0 });
  expect(at(1.2)).toMatchObject({ flinch: 0, giggle: 0, smile: 1 });
  expect(Object.values(at(BOOP_SECONDS))).toEqual([0, 0, 0]);
});

test("the head jerks back and the eyes cross toward the nose", () => {
  const rest = posed([null]).jelly;
  const { jelly } = posed([{ boop: 0.2 }]);
  expect(jelly.head.position.z).toBeLessThan(rest.head.position.z);
  const [left, right] = jelly.face.eyes;
  expect(left!.position.x).toBeGreaterThan(rest.face.eyes[0]!.position.x);
  expect(right!.position.x).toBeLessThan(rest.face.eyes[1]!.position.x);
});

test("after the boop the eyes return, so nothing is left behind", () => {
  const resting = posed([null]).pose;
  expect(posed([{ boop: 0.2 }, { boop: BOOP_SECONDS + 0.1 }]).pose).toEqual(resting);
});

test("with reduced motion only the face reacts", () => {
  const rest = posed([null], true).jelly;
  const { jelly } = posed([{ boop: 0.2 }, { boop: 0.7 }], true);
  expect(jelly.head.position.toArray()).toEqual(rest.head.position.toArray());
  expect(jelly.root.rotation.z).toBe(rest.root.rotation.z);
  expect(jelly.face.eyes[0]!.position.toArray()).toEqual(rest.face.eyes[0]!.position.toArray());
  expect(jelly.face.eyes[0]!.geometry).toBe(jelly.face.eyeShapes.squint);
});

/** `count` gleiche Bilder. */
const times = (count: number, touch: TouchFrame) => Array.from({ length: count }, () => touch);

test("petting flattens the jelly, tilts the head toward the hand and closes the eyes happily", () => {
  const rest = posed([null]).jelly;
  const { jelly } = posed(times(10, { petting: 1, lean: 1 }));
  expect(jelly.root.scale.y).toBeLessThan(rest.root.scale.y);
  expect(jelly.root.scale.x).toBeGreaterThan(rest.root.scale.x);
  expect(jelly.head.rotation.z).toBeLessThan(rest.head.rotation.z);
  expect(jelly.face.eyes[0]!.geometry).toBe(jelly.face.eyeShapes.happy);
});

test("after petting it fades out softly and leaves nothing behind", () => {
  const resting = posed([null]).pose;
  const petted = times(10, { petting: 1, lean: -1 });
  expect(posed([...petted, { petting: 0 }]).pose).not.toEqual(resting);
  expect(posed([...petted, ...times(40, { petting: 0 })]).pose).toEqual(resting);
});

test("with reduced motion petting only changes the face", () => {
  const rest = posed([null], true).jelly;
  const { jelly } = posed([{ petting: 1, lean: 1 }], true);
  expect(jelly.root.scale.toArray()).toEqual(rest.root.scale.toArray());
  expect(jelly.head.rotation.z).toBe(rest.head.rotation.z);
  expect(jelly.face.eyes[0]!.geometry).toBe(jelly.face.eyeShapes.happy);
});
