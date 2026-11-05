/**
 * The light on a highlighted jelly, in the room itself: a beam falling from above, a halo behind the
 * jelly and a pool of light on the floor. Beam and pool stay on the floor when the jelly stands on a
 * stack, the halo goes up with it.
 *
 * @module
 */

import {
  Color,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Side,
} from "three";

import type { StageEffect } from "./effects.ts";
import type { JellySpot } from "./jellies.ts";

import { calculateSpotlightPresence } from "./effects.ts";
import { FIRST_JELLY_ORDER, JELLY_HEIGHT } from "./jellies.ts";
import { FLAT_ORDER, VENUE_TIME } from "./props.ts";
import beamFragmentShader from "./shaders/beam.frag.glsl?raw";
import beamVertexShader from "./shaders/beam.vert.glsl?raw";
import dustShader from "./shaders/dust.glsl?raw";
import poolFragmentShader from "./shaders/lightPool.frag.glsl?raw";
import poolVertexShader from "./shaders/lightPool.vert.glsl?raw";
import { FLOOR_BLENDING, SHADOW_HEIGHT } from "./shadow.ts";
import { findFloorHeight, type Placement } from "./zones.ts";

/** Sizes of the beam in jelly units. Its top lies high above the jellies, where it has faded out. */
const BEAM = { top: 0.8, bottom: 1.35, height: 13, around: 48, alpha: 1, softness: 0.85 };
const HALO = { radius: 1.9, segments: 32, alpha: 0.75, softness: 3 };
const POOL_RADIUS = 4.5;
/** Ripples per second that run through the pool. */
const RIPPLE_RATE = 0.5;
/** The hue differs per player. Saturation and lightness keep every color readable on the floor. */
const LIGHT_SATURATION = 1;
const CORE_LIGHTNESS = 0.66;
const EDGE_LIGHTNESS = 0.5;
const YARD_COLOR = "#232a44";
/** A beam draws right before its jelly: over all jellies behind it, under it and all in front. */
const BEFORE_JELLY = 0.5;
/** Ponytail: enough for about one highlight per second. Further ones get no light. */
const MOST_BEAMS = 16;

/** Clock, brightness and colors of one light, shared by its beam, halo and pool. */
interface LightUniforms {
  uTime: { value: number };
  uPresence: { value: number };
  uCore: { value: Color };
  uEdge: { value: Color };
}

/** The light of one jelly. It only exists once and is reused for the next jelly. */
interface Beam {
  group: Group;
  halo: Mesh;
  pool: Mesh;
  light: LightUniforms;
}

/** The shapes all lights share. */
interface BeamShapes {
  cone: BufferGeometry;
  ball: BufferGeometry;
  plane: BufferGeometry;
}

/** Everything that draws the light. */
export interface StageBeams {
  root: Object3D;
  beams: Beam[];
}

/** What {@link updateBeams} needs for a frame. */
export interface BeamFrame {
  /** Sorted from back to front, the order the jellies are drawn in. */
  spots: JellySpot[];
  effects: StageEffect[];
  /** The stage platforms, where the floor is raised. */
  platforms: Placement[];
  /** Local time in milliseconds, as used by the effects. */
  now: number;
}

/** Creates a mesh of soft light. It blends, but draws in the order of the jellies. */
function createLightMesh(
  geometry: BufferGeometry,
  light: LightUniforms,
  look: { defines: Record<string, string>; side: Side },
): Mesh {
  const material = new ShaderMaterial({
    defines: look.defines,
    uniforms: { ...light },
    vertexShader: beamVertexShader,
    fragmentShader: `${dustShader}\n${beamFragmentShader}`,
    side: look.side,
    ...FLOOR_BLENDING,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** Creates a pool of light. It draws with the flat things on the floor, so everything stands on it. */
function createPool(plane: BufferGeometry, light: LightUniforms): Mesh {
  const material = new ShaderMaterial({
    defines: {
      POOL_RADIUS: POOL_RADIUS.toFixed(3),
      RIM_RADIUS: BEAM.bottom.toFixed(3),
      RIPPLE_RATE: RIPPLE_RATE.toFixed(3),
    },
    uniforms: { ...light, uYard: { value: new Color(YARD_COLOR) } },
    vertexShader: poolVertexShader,
    fragmentShader: poolFragmentShader,
    ...FLOOR_BLENDING,
  });
  const pool = new Mesh(plane, material);
  pool.frustumCulled = false;
  pool.renderOrder = FLAT_ORDER;
  pool.visible = false;
  return pool;
}

/** Creates one light with its beam, halo and pool, switched off. */
function createBeam(shapes: BeamShapes): Beam {
  const light: LightUniforms = {
    uTime: VENUE_TIME,
    uPresence: { value: 0 },
    uCore: { value: new Color() },
    uEdge: { value: new Color() },
  };
  const halo = createLightMesh(shapes.ball, light, {
    defines: { LIGHT_ALPHA: HALO.alpha.toFixed(2), EDGE_SOFTNESS: HALO.softness.toFixed(2) },
    side: FrontSide,
  });
  const beam = createLightMesh(shapes.cone, light, {
    defines: {
      BEAM: "1",
      LIGHT_ALPHA: BEAM.alpha.toFixed(2),
      EDGE_SOFTNESS: BEAM.softness.toFixed(2),
    },
    side: DoubleSide,
  });
  const group = new Group();
  group.add(beam, halo);
  group.visible = false;
  return { group, halo, pool: createPool(shapes.plane, light), light };
}

/** Creates the light, dark at first. Its root belongs into the scene. */
export function createBeams(): StageBeams {
  const shapes = {
    cone: new CylinderGeometry(BEAM.top, BEAM.bottom, BEAM.height, BEAM.around, 1, true).translate(
      0,
      BEAM.height / 2,
      0,
    ),
    ball: new SphereGeometry(HALO.radius, HALO.segments, HALO.segments),
    plane: new PlaneGeometry(2 * POOL_RADIUS, 2 * POOL_RADIUS).rotateX(-Math.PI / 2),
  };
  const beams = Array.from({ length: MOST_BEAMS }, () => createBeam(shapes));
  const root = new Object3D();
  root.add(...beams.flatMap((beam) => [beam.pool, beam.group]));
  return { root, beams };
}

/** Puts one light on the jelly at `rank` in the drawing order. */
function placeBeam(beam: Beam, frame: BeamFrame, rank: number): void {
  const spot = frame.spots[rank];
  if (!spot) return;
  const { x, y, z } = spot.feet;
  const floor = findFloorHeight(spot.feet, frame.platforms);
  beam.group.visible = true;
  beam.group.renderOrder = FIRST_JELLY_ORDER + rank - BEFORE_JELLY;
  beam.group.position.set(x, floor, z);
  beam.halo.position.y = y - floor + JELLY_HEIGHT / 2;
  beam.pool.visible = true;
  beam.pool.position.set(x, floor + SHADOW_HEIGHT, z);
}

/** Gives a light the color of the player who asked for it. */
function paintBeam(beam: Beam, hue: number): void {
  const { uCore, uEdge } = beam.light;
  uCore.value.setHSL(hue, LIGHT_SATURATION, CORE_LIGHTNESS, SRGBColorSpace);
  uEdge.value.setHSL(hue, LIGHT_SATURATION, EDGE_LIGHTNESS, SRGBColorSpace);
}

/** Lights up every jelly that is highlighted right now and switches off the rest. */
export function updateBeams(lights: StageBeams, frame: BeamFrame): void {
  let count = 0;
  for (const effect of frame.effects) {
    const beam = lights.beams[count];
    if (effect.kind !== "spotlight" || !beam) continue;
    const rank = frame.spots.findIndex((spot) => spot.player.id === effect.playerId);
    if (rank < 0) continue;
    placeBeam(beam, frame, rank);
    paintBeam(beam, effect.hue);
    beam.light.uPresence.value = calculateSpotlightPresence(effect, frame.now);
    count += 1;
  }
  for (const beam of lights.beams.slice(count)) {
    beam.group.visible = false;
    beam.pool.visible = false;
  }
}
