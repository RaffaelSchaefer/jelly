/**
 * Die Mundformen: da, sichtbar und ohne Spuren, sobald das Jelly wieder lächelt.
 *
 * @module
 */

import { Group, Vector3 } from "three";
import { expect, test } from "vitest";

import {
  animateJelly,
  createJelly,
  createMotion,
  HEAD,
  JELLY_COLORS,
  MOUTH_SHAPE_NAMES,
  type Jelly,
  type MouthFrame,
} from "./index.ts";

const frame = { time: 1, rawDelta: 0.016, pulse: 0, holding: false, reducedMotion: false };
const open: MouthFrame = { shape: "a", width: 1.1, height: 0.9, nod: 1 };

/** Alles, was eine Mundform verändert. */
function pose(jelly: Jelly) {
  return {
    mouth: [...jelly.face.mouth.scale, jelly.face.mouth.geometry.uuid],
    head: [...jelly.head.position],
  };
}

/** Wie viele Farben eine Geometrie in ihren Vertices trägt. */
function countColors(jelly: Jelly, shape: MouthFrame["shape"]) {
  const colors = jelly.face.mouthShapes[shape].getAttribute("color");
  const seen = new Set<string>();
  for (let index = 0; index < colors.count; index++) {
    seen.add(`${colors.getX(index)},${colors.getY(index)},${colors.getZ(index)}`);
  }
  return seen.size;
}

test("every shape exists in the ink of the jelly, and only a, o and grin show a tongue", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  for (const shape of MOUTH_SHAPE_NAMES) {
    const expected = shape === "a" || shape === "o" || shape === "grin" ? 2 : 1;
    expect(countColors(jelly, shape)).toBe(expected);
  }
});

test("jellies of one color share their shapes", () => {
  const first = createJelly(JELLY_COLORS.peach);
  const second = createJelly(JELLY_COLORS.peach);
  expect(second.face.mouthShapes.a).toBe(first.face.mouthShapes.a);
  expect(createJelly(JELLY_COLORS.mint).face.mouthShapes.a).not.toBe(first.face.mouthShapes.a);
});

test.each(MOUTH_SHAPE_NAMES)(
  "shape %s lies on the head, not inside it, and below the eyes",
  (shape) => {
    const jelly = createJelly(JELLY_COLORS.lilac);
    const { mouth } = jelly.face;
    mouth.scale.setScalar(1);
    mouth.updateMatrix();
    const position = jelly.face.mouthShapes[shape].getAttribute("position");
    const point = new Vector3();
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(mouth.matrix);
      const x = (point.x - HEAD.x) / HEAD.radius;
      const y = (point.y - HEAD.y) / HEAD.radius;
      const z = (point.z - HEAD.z) / (HEAD.radius * HEAD.depth);
      expect(x * x + y * y + z * z).toBeGreaterThan(1);
      // Die Augen enden knapp unter der Kopfmitte.
      expect(point.y - HEAD.y).toBeLessThan(-0.09);
    }
  },
);

test("a shape faces the camera, otherwise it would be culled", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  const normal = jelly.face.mouthShapes.a.getAttribute("normal");
  expect(normal.getZ(0)).toBeGreaterThan(0.99);
});

test("a frame swaps the shape, sizes the mouth and lowers the head", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  animateJelly(jelly, motion, frame);
  const headY = jelly.head.position.y;
  animateJelly(jelly, motion, { ...frame, mouth: open });
  expect(jelly.face.mouth.geometry).toBe(jelly.face.mouthShapes.a);
  expect(jelly.face.mouth.scale.x).toBe(1.1);
  expect(jelly.face.mouth.scale.y).toBe(0.9);
  expect(jelly.head.position.y).toBeLessThan(headY);
});

test("without a frame the jelly smiles again and nothing stays behind", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  animateJelly(jelly, motion, frame);
  const smiling = pose(jelly);
  for (let step = 0; step < 5; step++) animateJelly(jelly, motion, { ...frame, mouth: open });
  animateJelly(jelly, motion, frame);
  expect(pose(jelly)).toEqual(smiling);
  expect(jelly.face.mouth.geometry).toBe(jelly.face.smile);
});

test("a mouth wins over the size a gesture gives it, the eyes keep the gesture", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  const motion = createMotion(0);
  const laugh = { key: "laugh", elapsed: 0.9 } as const;
  animateJelly(jelly, motion, { ...frame, emote: laugh });
  const closedEye = jelly.face.eyes[0]?.scale.y;
  animateJelly(jelly, motion, { ...frame, emote: laugh, mouth: open });
  expect(jelly.face.mouth.scale.x).toBe(1.1);
  expect(jelly.face.eyes[0]?.scale.y).toBe(closedEye);
});

test("the shapes add no Group, so a stage can still sort whole jellies", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  animateJelly(jelly, createMotion(0), { ...frame, mouth: open });
  jelly.root.traverse((object) => expect(object instanceof Group).toBe(false));
});
