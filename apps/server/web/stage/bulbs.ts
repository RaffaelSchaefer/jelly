/**
 * Strings of small light bulbs: fairy lights in the lounge, the frame of the snack bar sign and the
 * glints of the trophy. A shader lets them twinkle or chase, so no bulb is touched per frame.
 *
 * @module
 */

import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  SphereGeometry,
} from "three";

import type { ScenePoint } from "./world.ts";

import { keepMaterial, VENUE_TIME } from "./props.ts";
import fragmentShader from "./shaders/bulb.frag.glsl?raw";
import vertexShader from "./shaders/bulb.vert.glsl?raw";
import { calculateRandomValue } from "./wander.ts";

/** How bulbs light up: each at its own pace, or as a light that runs along the string. */
export type BulbPattern = "twinkle" | "chase";

/** Rounds per second through dark and lit. */
const BLINK_RATES: Record<BulbPattern, number> = { twinkle: 0.35, chase: 1.2 };
/** In a chase every third bulb is lit at a time. */
const CHASE_GROUP = 3;
const SEED_TWINKLE = 41;
const BULB_SEGMENTS = { around: 10, up: 8 };
const PROP_ORDER = 3;

const BULB_MATERIALS: Record<BulbPattern, ShaderMaterial> = {
  twinkle: createBulbMaterial(BLINK_RATES.twinkle),
  chase: createBulbMaterial(BLINK_RATES.chase),
};

/** Creates the shared material of one pattern. */
function createBulbMaterial(rate: number): ShaderMaterial {
  return keepMaterial(
    new ShaderMaterial({
      defines: { BLINK_RATE: rate.toFixed(2) },
      uniforms: { uTime: VENUE_TIME },
      vertexShader,
      fragmentShader,
      toneMapped: false,
    }),
  );
}

/** How a string of bulbs looks. */
export interface BulbLook {
  radius: number;
  /** Colors the bulbs take in turn. */
  colors: string[];
  pattern: BulbPattern;
}

/** Creates one bulb at every point. */
export function createBulbs(points: ScenePoint[], look: BulbLook): InstancedMesh {
  const geometry = new SphereGeometry(look.radius, BULB_SEGMENTS.around, BULB_SEGMENTS.up);
  const tints = new Float32Array(points.length * 3);
  const phases = new Float32Array(points.length);
  const bulbs = new InstancedMesh(geometry, BULB_MATERIALS[look.pattern], points.length);
  const matrix = new Matrix4();
  const color = new Color();
  points.forEach((point, index) => {
    bulbs.setMatrixAt(index, matrix.makeTranslation(point.x, point.y, point.z));
    color.set(look.colors[index % look.colors.length] ?? "#ffffff");
    tints.set([color.r, color.g, color.b], index * 3);
    phases[index] =
      look.pattern === "chase" ? index / CHASE_GROUP : calculateRandomValue(index, SEED_TWINKLE);
  });
  geometry.setAttribute("aColor", new InstancedBufferAttribute(tints, 3));
  geometry.setAttribute("aPhase", new InstancedBufferAttribute(phases, 1));
  bulbs.computeBoundingSphere();
  bulbs.renderOrder = PROP_ORDER;
  return bulbs;
}
