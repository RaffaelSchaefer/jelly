/**
 * Augen und Brauen zeigen ihre Vorderseite vor dem Kopf. Was im Kopf steckt, verdeckt das Jelly.
 *
 * @module
 */

import {
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  SrcAlphaFactor,
  Vector3,
  type BufferGeometry,
  type Matrix4,
  type MeshBasicMaterial,
} from "three";
import { expect, test } from "vitest";

import { EYE_SHAPE_NAMES } from "./eyeShapes.ts";
import { placeEyes } from "./face.ts";
import { createJelly, HEAD, JELLY_COLORS } from "./index.ts";

/** Lage zum Kopf-Ellipsoid: 1 auf der Oberfläche, darüber außerhalb. */
function headDistance({ x, y, z }: Vector3) {
  const r = HEAD.radius;
  return ((x - HEAD.x) / r) ** 2 + ((y - HEAD.y) / r) ** 2 + ((z - HEAD.z) / (r * HEAD.depth)) ** 2;
}

/** Der Punkt der Vorderseite, der dem Kopf am nächsten liegt. Vorn heißt: Normale zur Kamera. */
function nearestFront(geometry: BufferGeometry, matrix: Matrix4) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const point = new Vector3();
  let nearest = Infinity;
  for (let index = 0; index < position.count; index++) {
    if (normal.getZ(index) < 0.9) continue;
    point.fromBufferAttribute(position, index).applyMatrix4(matrix);
    nearest = Math.min(nearest, headDistance(point));
  }
  return nearest;
}

test.each(EYE_SHAPE_NAMES)("eye shape %s shows its front outside the head", (shape) => {
  const jelly = createJelly(JELLY_COLORS.mint);
  jelly.root.updateMatrixWorld(true);
  for (const eye of jelly.face.eyes) {
    expect(nearestFront(jelly.face.eyeShapes[shape], eye.matrixWorld)).toBeGreaterThan(1);
  }
});

test("brows start hidden and show their front outside the head", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  jelly.root.updateMatrixWorld(true);
  for (const brow of jelly.face.brows) {
    expect(brow.visible).toBe(false);
    expect(nearestFront(brow.geometry, brow.matrixWorld)).toBeGreaterThan(1);
  }
});

test("cheeks blend like before but in the opaque pass, right after the face", () => {
  const jelly = createJelly(JELLY_COLORS.mint);
  for (const cheek of jelly.face.cheeks) {
    const material = cheek.material as MeshBasicMaterial;
    // Transparent meshes would draw after every sticker and paint over beards and glasses.
    expect(material.transparent).toBe(false);
    expect(cheek.renderOrder).toBe(7);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(CustomBlending);
    expect([material.blendSrc, material.blendDst]).toEqual([
      SrcAlphaFactor,
      OneMinusSrcAlphaFactor,
    ]);
    expect([material.blendSrcAlpha, material.blendDstAlpha]).toEqual([
      OneFactor,
      OneMinusSrcAlphaFactor,
    ]);
  }
});

/** Die äußersten Blicke und zu große Werte, die begrenzt werden. */
const GLANCES = [
  [0.035, 0.022],
  [-0.035, -0.022],
  [0.035, -0.022],
  [-0.035, 0.022],
  [1, 1],
  [-1, -1],
] as const;

test.each(EYE_SHAPE_NAMES)(
  "eye shape %s stays outside the head wherever the eyes look",
  (shape) => {
    const jelly = createJelly(JELLY_COLORS.mint);
    for (const [dx, dy] of GLANCES) {
      placeEyes(jelly.face, dx, dy);
      jelly.root.updateMatrixWorld(true);
      for (const eye of jelly.face.eyes) {
        expect(nearestFront(jelly.face.eyeShapes[shape], eye.matrixWorld)).toBeGreaterThan(1);
      }
    }
  },
);

test("placeEyes sets absolute, clamped positions and keeps the scale", () => {
  const fresh = createJelly(JELLY_COLORS.mint).face.eyes;
  const jelly = createJelly(JELLY_COLORS.mint);
  const { eyes } = jelly.face;
  eyes[1]!.scale.x = -1;
  placeEyes(jelly.face, 0.03, 0.02);
  placeEyes(jelly.face, 0.03, 0.02);
  expect(eyes[0]!.position.x - fresh[0]!.position.x).toBeCloseTo(0.03);
  expect(eyes[1]!.position.x - fresh[1]!.position.x).toBeCloseTo(0.03);
  expect(eyes[0]!.position.y - fresh[0]!.position.y).toBeCloseTo(0.02);
  placeEyes(jelly.face, 1, -1);
  expect(eyes[0]!.position.x - fresh[0]!.position.x).toBeCloseTo(0.035);
  expect(eyes[0]!.position.y - fresh[0]!.position.y).toBeCloseTo(-0.022);
  placeEyes(jelly.face, 0, 0);
  eyes.forEach((eye, index) => {
    expect(eye.position.toArray()).toEqual(fresh[index]!.position.toArray());
    expect(eye.rotation.toArray()).toEqual(fresh[index]!.rotation.toArray());
  });
  expect(eyes[1]!.scale.x).toBe(-1);
});
