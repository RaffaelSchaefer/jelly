/**
 * The ring on the floor around every running stack. Its arc runs out with the time the stack has
 * left, so even a lone jelly that just started a tower shows from afar: here is a tower, climb it,
 * it lasts this long. All rings draw in one call.
 *
 * @module
 */

import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
} from "three";

import type { StageStack } from "./types.ts";

import { FLAT_ORDER, VENUE_TIME } from "./props.ts";
import { calculateRandomValue } from "./random.ts";
import { FLOOR_BLENDING, SHADOW_HEIGHT } from "./shadow.ts";
import fragmentShader from "./shaders/stackRing.frag.glsl?raw";
import vertexShader from "./shaders/stackRing.vert.glsl?raw";
import {
  calculatePulse,
  calculateRingScale,
  stepStackClocks,
  type StackClock,
} from "./stackMarks.ts";
import { toFloorPoint, type RoomSize } from "./world.ts";
import { findFloorHeight, type Placement } from "./zones.ts";

/**
 * In jelly units: the arc lies clear outside the other marks at a jelly's feet (hover ring 1.16,
 * choice ring 1.4, beam rim 1.35) and is thick enough to read from the far beamer camera.
 */
const RING = { radius: 2.2, arc: 0.46, track: 0.12, plane: 3.6 };
/** Half the least width of the arc on screen, in pixels, for the far beamer camera. */
const LEAST_PIXELS = 3;
/** Dots on the track like the marks of a clock, and how many ripples per second run inward. */
const TICKS = 12;
const RIPPLE_RATE = 0.6;
/** A violet of its own: gold means "can be chosen", red would look like an error. */
const CORE = "#a184ff";
const EDGE = "#4a26c9";
const HOT = "#f6f0ff";
const YARD = "#291f57";
/** Over the pool of a highlight, under the shadows of the jellies standing on it. */
const RING_ORDER = FLAT_ORDER + 0.5;
/** Every ring has its own clock offset, so their ripples do not run in step. */
const SEED_PHASE = 83;
/** Ponytail: far more stacks than a hall holds at once. Further ones get no ring. */
const MOST_RINGS = 64;

/** Everything that draws the rings, and what each ring remembers. */
export interface StackRings {
  mesh: InstancedMesh;
  /** 0 under reduced motion: then no ripples run. */
  motion: { value: number };
  /** Share of time left, presence, urgency and pulse of each instance. */
  clock: InstancedBufferAttribute;
  phase: InstancedBufferAttribute;
  /** The clock of each stack, by stack ID. */
  clocks: Map<number, StackClock>;
}

/** What {@link updateStackRings} needs for a frame. */
export interface StackRingFrame {
  stacks: StageStack[];
  platforms: Placement[];
  room: RoomSize;
  /** Server time in milliseconds, as `ends_at` counts. */
  serverTime: number;
  seconds: number;
  reducedMotion: boolean;
}

/** Creates the rings, none shown at first. The mesh belongs into the scene. */
export function createStackRings(): StackRings {
  const geometry = new PlaneGeometry(2 * RING.plane, 2 * RING.plane).rotateX(-Math.PI / 2);
  const clock = new InstancedBufferAttribute(new Float32Array(MOST_RINGS * 4), 4);
  clock.setUsage(DynamicDrawUsage);
  const phase = new InstancedBufferAttribute(new Float32Array(MOST_RINGS), 1);
  geometry.setAttribute("aClock", clock);
  geometry.setAttribute("aPhase", phase);
  const motion = { value: 1 };
  const material = new ShaderMaterial({
    defines: {
      RING_RADIUS: RING.radius.toFixed(3),
      ARC_WIDTH: RING.arc.toFixed(3),
      TRACK_WIDTH: RING.track.toFixed(3),
      LEAST_PIXELS: LEAST_PIXELS.toFixed(1),
      TICKS: TICKS.toFixed(1),
      RIPPLE_RATE: RIPPLE_RATE.toFixed(3),
    },
    uniforms: {
      uTime: VENUE_TIME,
      uMotion: motion,
      uCore: { value: new Color(CORE) },
      uEdge: { value: new Color(EDGE) },
      uHot: { value: new Color(HOT) },
      uYard: { value: new Color(YARD) },
    },
    vertexShader,
    fragmentShader,
    ...FLOOR_BLENDING,
  });
  const mesh = new InstancedMesh(geometry, material, MOST_RINGS);
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = RING_ORDER;
  return { mesh, motion, clock, phase, clocks: new Map() };
}

/** Puts a ring around every running stack and lets the rings of ended stacks fade away. */
export function updateStackRings(rings: StackRings, frame: StackRingFrame): void {
  stepStackClocks(rings.clocks, frame);
  rings.motion.value = frame.reducedMotion ? 0 : 1;
  const matrix = new Matrix4();
  let count = 0;
  for (const clock of rings.clocks.values()) {
    if (count === MOST_RINGS) break;
    const point = toFloorPoint(clock.stack, frame.room);
    const scale = calculateRingScale(clock);
    matrix.makeScale(scale, 1, scale);
    matrix.setPosition(point.x, findFloorHeight(point, frame.platforms) + SHADOW_HEIGHT, point.z);
    rings.mesh.setMatrixAt(count, matrix);
    const { share, presence, urgency } = clock;
    rings.clock.setXYZW(count, share, presence, urgency, calculatePulse(clock));
    rings.phase.setX(count, calculateRandomValue(clock.stack.id, SEED_PHASE));
    count += 1;
  }
  rings.mesh.count = count;
  rings.mesh.instanceMatrix.needsUpdate = true;
  rings.clock.needsUpdate = true;
  rings.phase.needsUpdate = true;
}
