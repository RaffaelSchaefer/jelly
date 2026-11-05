/**
 * The rings around jellies that can be chosen on a personal screen: a glowing line on the floor with
 * a shimmer running around it and a low curtain of light above it. They draw after the desks and
 * before the jellies, so a ring stays visible behind a desk and every jelly stands in front of it.
 *
 * @module
 */

import {
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  type BufferGeometry,
} from "three";

import type { JellySpot } from "./jellies.ts";

import { stepRingPresence } from "./moves.ts";
import { PROP_ORDER, VENUE_TIME } from "./props.ts";
import { calculateRandomValue } from "./random.ts";
import curtainFragmentShader from "./shaders/choiceCurtain.frag.glsl?raw";
import ringFragmentShader from "./shaders/choiceRing.frag.glsl?raw";
import vertexShader from "./shaders/choiceRing.vert.glsl?raw";
import dustShader from "./shaders/dust.glsl?raw";
import { FLOOR_BLENDING, SHADOW_HEIGHT } from "./shadow.ts";

const RING_RADIUS = 1.4;
/** The plane under a ring also holds its glow and the wave that leaves it. */
const PLANE_RADIUS = 2.6;
const CURTAIN = { height: 1.3, around: 48 };
const GOLD = "#ffa60d";
const HOT = "#fff8d0";
/** Every ring has its own clock offset, so they do not pulse in step. */
const SEED_PHASE = 61;
const PHASE_SECONDS = 20;
/** How fast a ring comes and goes, per second, and how small it starts. */
const GROW_RATE = 9;
const SMALLEST_SCALE = 0.7;
/** Ponytail: more jellies than a hall holds. Further ones get no ring. */
const MOST_RINGS = 256;

/** Everything that draws the rings. */
export interface ChoiceRings {
  root: Object3D;
  rings: InstancedMesh;
  curtains: InstancedMesh;
  presence: InstancedBufferAttribute;
  phase: InstancedBufferAttribute;
  /** How far the ring of each jelly is there, by player ID. */
  shown: Map<number, number>;
}

/** What {@link updateChoiceRings} needs for a frame. */
export interface ChoiceRingFrame {
  spots: JellySpot[];
  /** The jellies that can be chosen right now. */
  lit: ReadonlySet<number>;
  seconds: number;
  reducedMotion: boolean;
}

/** Creates instances of one part of the rings, with attributes shared by both parts. */
function createPart(
  geometry: BufferGeometry,
  fragmentShader: string,
  attributes: { presence: InstancedBufferAttribute; phase: InstancedBufferAttribute },
): InstancedMesh {
  geometry.setAttribute("aPresence", attributes.presence);
  geometry.setAttribute("aPhase", attributes.phase);
  const material = new ShaderMaterial({
    defines: { RING_RADIUS: RING_RADIUS.toFixed(3) },
    uniforms: {
      uTime: VENUE_TIME,
      uGold: { value: new Color(GOLD) },
      uHot: { value: new Color(HOT) },
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    depthTest: false,
    ...FLOOR_BLENDING,
  });
  const part = new InstancedMesh(geometry, material, MOST_RINGS);
  part.count = 0;
  part.instanceMatrix.setUsage(DynamicDrawUsage);
  part.frustumCulled = false;
  part.renderOrder = PROP_ORDER + 1;
  return part;
}

/** Creates the rings, none shown at first. The root belongs into the scene. */
export function createChoiceRings(): ChoiceRings {
  const presence = new InstancedBufferAttribute(new Float32Array(MOST_RINGS), 1);
  presence.setUsage(DynamicDrawUsage);
  const phase = new InstancedBufferAttribute(new Float32Array(MOST_RINGS), 1);
  phase.setUsage(DynamicDrawUsage);
  const plane = new PlaneGeometry(2 * PLANE_RADIUS, 2 * PLANE_RADIUS).rotateX(-Math.PI / 2);
  const rings = createPart(plane, ringFragmentShader, { presence, phase });
  const cylinder = new CylinderGeometry(
    RING_RADIUS,
    RING_RADIUS,
    CURTAIN.height,
    CURTAIN.around,
    1,
    true,
  ).translate(0, CURTAIN.height / 2, 0);
  const curtains = createPart(cylinder, `${dustShader}\n${curtainFragmentShader}`, {
    presence,
    phase,
  });
  const root = new Object3D();
  root.add(rings, curtains);
  return { root, rings, curtains, presence, phase, shown: new Map() };
}

/** Puts a ring on every jelly that can be chosen and lets the others fade away. */
export function updateChoiceRings(parts: ChoiceRings, frame: ChoiceRingFrame): void {
  const step = frame.reducedMotion ? 1 : 1 - Math.exp(-GROW_RATE * frame.seconds);
  stepRingPresence(parts.shown, frame.lit, step);
  const matrix = new Matrix4();
  let count = 0;
  for (const spot of frame.spots) {
    const presence = parts.shown.get(spot.player.id);
    if (presence === undefined || count === MOST_RINGS) continue;
    const scale = SMALLEST_SCALE + (1 - SMALLEST_SCALE) * presence;
    matrix.makeScale(scale, scale, scale);
    matrix.setPosition(spot.feet.x, spot.feet.y + SHADOW_HEIGHT, spot.feet.z);
    parts.rings.setMatrixAt(count, matrix);
    parts.curtains.setMatrixAt(count, matrix);
    parts.presence.setX(count, presence);
    parts.phase.setX(count, calculateRandomValue(spot.player.id, SEED_PHASE) * PHASE_SECONDS);
    count += 1;
  }
  parts.rings.count = count;
  parts.curtains.count = count;
  parts.rings.instanceMatrix.needsUpdate = true;
  parts.curtains.instanceMatrix.needsUpdate = true;
  parts.presence.needsUpdate = true;
  parts.phase.needsUpdate = true;
}
