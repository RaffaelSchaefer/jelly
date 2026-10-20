import { expect, test } from 'vitest';
import type { BufferGeometry } from 'three';
import { BODY_BOTTOM, createBodyGeometry, createHandGeometry, createHeadGeometry, HAND, HEAD, headSurface } from './jellyGeometry';

function bounds(geometry: BufferGeometry) {
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    expect([positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite)).toBe(true);
  }
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
}

test('buddy is a round head sitting on a wider, rounded body', () => {
  const head = bounds(createHeadGeometry());
  const body = bounds(createBodyGeometry());
  expect(body.min.y).toBeCloseTo(BODY_BOTTOM, 2);
  // Head overlaps the top of the body a little, like a buddy icon.
  expect(head.min.y).toBeLessThan(body.max.y);
  expect(head.max.y).toBeGreaterThan(1.2);
  // Body is wider than the head, and symmetric.
  expect(body.max.x - body.min.x).toBeGreaterThan(head.max.x - head.min.x);
  expect(body.max.x).toBeCloseTo(-body.min.x, 3);
});

test('orb hands float clear of the body', () => {
  const hand = bounds(createHandGeometry());
  const body = bounds(createBodyGeometry());
  expect(HAND.x - (hand.max.x - hand.min.x) / 2).toBeGreaterThan(body.max.x);
});

test('face features sit on the front of the head', () => {
  const [, , z] = headSurface(0, 0);
  expect(z).toBeCloseTo(HEAD.z + HEAD.radius * HEAD.depth, 5);
});
