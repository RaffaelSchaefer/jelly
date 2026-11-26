/**
 * The dance floor of a conga line: a soft pool of light on the floor under every dancer, in its
 * color. A pool flashes with the bulb on the head of its dancer, so the flashes run up the line on
 * the beat, like the bulbs of the garland. With reduced motion every pool glows steadily. So a line
 * also reads from far away, where the garland is only a few specks. All pools draw in one call.
 *
 * @module
 */

import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
} from "three";

import type { CongaDancer } from "./congaLines.ts";
import type { JellySpot } from "./jellies.ts";
import type { Placement } from "./zones.ts";

import { findTint } from "./conga.ts";
import { calculateCongaBeat, calculateCongaPulse } from "./congaLines.ts";
import { JELLY_HEIGHT } from "./jellies.ts";
import { FLAT_ORDER } from "./props.ts";
import { FLOOR_BLENDING, SHADOW_HEIGHT } from "./shadow.ts";
import fragmentShader from "./shaders/congaFloor.frag.glsl?raw";
import vertexShader from "./shaders/congaFloor.vert.glsl?raw";
import { findFloorHeight } from "./zones.ts";

/**
 * A pool in jelly units: its radius, the share of it that is fully lit and how much whiter its
 * middle gets while lit.
 */
const POOL = { radius: 1.9, core: 0.45, white: 0.3 };
/**
 * How strong a fully lit pool covers the floor by its radius on screen: `far` up to `farPixels`,
 * which is also its least radius, and `near` from `nearPixels` on.
 */
const STRENGTH = { far: 0.95, farPixels: 32, near: 0.6, nearPixels: 90 };
/** How bright a pool is between two flashes and with reduced motion, where it does not flash. */
const GLOW = { rest: 0.6, still: 0.8 };
/** A dancer up on a tower throws no pool: it fades between these heights over the floor. */
const LIFTED = { low: 0.25 * JELLY_HEIGHT, high: 0.75 * JELLY_HEIGHT };
/** Over the flat things on the floor, under the light of a highlight, stack rings and shadows. */
const POOL_ORDER = FLAT_ORDER + 0.25;
/** Ponytail: more dancers than a full hall holds. Further ones get no pool. */
const MOST_POOLS = 128;
/** Reused to place every pool, so a frame allocates nothing. */
const PLACE = new Matrix4();

/** Everything that draws the dance floor. */
export interface CongaFloor {
  mesh: InstancedMesh;
  /** The color of each dancer and how bright its pool is. */
  glow: InstancedBufferAttribute;
  /** The color of the pools by the color key of a jelly, parsed once. */
  tints: Map<string, Color>;
}

/** What {@link updateCongaFloor} needs for a frame. */
export interface CongaFloorFrame {
  spots: JellySpot[];
  /** Everybody who dances right now, by player ID. */
  dancers: ReadonlyMap<number, CongaDancer>;
  platforms: Placement[];
  /** Server time in milliseconds, the clock of the dance. */
  serverTime: number;
  reducedMotion: boolean;
}

/** Creates the dance floor, empty at first. The mesh belongs into the scene. */
export function createCongaFloor(): CongaFloor {
  const geometry = new PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const glow = new InstancedBufferAttribute(new Float32Array(MOST_POOLS * 4), 4);
  glow.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aGlow", glow);
  const pixel = { value: 0 };
  const material = new ShaderMaterial({
    defines: {
      POOL_RADIUS: POOL.radius.toFixed(3),
      POOL_CORE: POOL.core.toFixed(3),
      LIT_WHITE: POOL.white.toFixed(3),
      FAR_ALPHA: STRENGTH.far.toFixed(3),
      FAR_PIXELS: STRENGTH.farPixels.toFixed(1),
      NEAR_ALPHA: STRENGTH.near.toFixed(3),
      NEAR_PIXELS: STRENGTH.nearPixels.toFixed(1),
    },
    uniforms: { uPixel: pixel },
    vertexShader,
    fragmentShader,
    toneMapped: false,
    ...FLOOR_BLENDING,
  });
  const mesh = new InstancedMesh(geometry, material, MOST_POOLS);
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = POOL_ORDER;
  const size = new Vector2();
  mesh.onBeforeRender = (renderer) => {
    pixel.value = 2 / renderer.getDrawingBufferSize(size).y;
  };
  return { mesh, glow, tints: new Map() };
}

/** Returns how bright the pool of `dancer` is in this frame, from 0 to 1. */
function measureGlow(dancer: CongaDancer, beat: number, reducedMotion: boolean): number {
  if (reducedMotion) return GLOW.still * dancer.presence;
  const pulse = calculateCongaPulse(dancer.rank, beat);
  return (GLOW.rest + (1 - GLOW.rest) * pulse) * dancer.presence;
}

/** Lays a pool under every dancer and takes up the rest. */
export function updateCongaFloor(floor: CongaFloor, frame: CongaFloorFrame): void {
  const { mesh, glow } = floor;
  mesh.count = 0;
  // Most frames nobody dances: then nothing is uploaded.
  if (frame.dancers.size === 0) return;
  const beat = calculateCongaBeat(frame.serverTime);
  let count = 0;
  for (const spot of frame.spots) {
    const dancer = frame.dancers.get(spot.player.id);
    if (!dancer || count === MOST_POOLS) continue;
    const ground = findFloorHeight(spot.feet, frame.platforms);
    const lifted = MathUtils.smoothstep(spot.feet.y - ground, LIFTED.low, LIFTED.high);
    const light = measureGlow(dancer, beat, frame.reducedMotion) * (1 - lifted);
    if (light <= 0) continue;
    mesh.setMatrixAt(
      count,
      PLACE.makeTranslation(spot.feet.x, ground + SHADOW_HEIGHT, spot.feet.z),
    );
    const tint = findTint(floor.tints, spot);
    glow.setXYZW(count, tint.r, tint.g, tint.b, light);
    count += 1;
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  glow.needsUpdate = true;
}
