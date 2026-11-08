/**
 * Augen und Brauen zeigen ihre Vorderseite vor dem Kopf. Was im Kopf steckt, verdeckt das Jelly.
 *
 * @module
 */

import { Vector3, type BufferGeometry, type Matrix4 } from "three";
import { expect, test } from "vitest";

import { EYE_SHAPE_NAMES } from "./eyeShapes.ts";
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
