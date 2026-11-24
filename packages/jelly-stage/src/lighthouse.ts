/**
 * The lighthouse on a tower: while the top of a stack of at least two jellies is highlighted, a lamp
 * glows on its head and a cone of light circles from there through the hall. Where the cone meets the
 * floor it throws a patch of light that sweeps along with it, so the light reads on the bright floor
 * from every camera. It takes the color of the highlight and comes and goes with it. With reduced
 * motion only the lamp glows, still.
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
  Vector3,
  type BufferGeometry,
} from "three";

import type { StageEffect } from "./effects.ts";
import type { JellySpot } from "./jellies.ts";
import type { StageStack } from "./types.ts";

import { createLightMesh, paintLight, type LightUniforms } from "./beams.ts";
import { calculateSpotlightPresence } from "./effects.ts";
import { FIRST_JELLY_ORDER } from "./jellies.ts";
import { FLAT_ORDER, VENUE_TIME } from "./props.ts";
import { FLOOR_BLENDING, SHADOW_HEIGHT } from "./shadow.ts";
import dustShader from "./shaders/dust.glsl?raw";
import coneFragmentShader from "./shaders/lighthouseCone.frag.glsl?raw";
import coneVertexShader from "./shaders/lighthouseCone.vert.glsl?raw";
import patchFragmentShader from "./shaders/lighthousePatch.frag.glsl?raw";
import poolVertexShader from "./shaders/lightPool.vert.glsl?raw";
import {
  calculateSweepAngle,
  findLighthouses,
  measureReach,
  toSweepDirection,
  type Lighthouse,
} from "./stackMarks.ts";
import { toRoomRect, type RoomSize } from "./world.ts";
import { findFloorHeight, type Placement } from "./zones.ts";

/** The cone in jelly units: a narrow start at the lamp, wide where it meets the floor. */
const CONE = { start: 0.12, end: 2.2, around: 32 };
/** The lamp sits on the head. Turned to the viewer it flares up, with reduced motion it stays large. */
const LAMP = { radius: 0.55, lift: 0.45, segments: 24, flare: 0.9, still: 1.4 };
/** How far the light falls from the tower in the open. */
const REACH = 9;
/**
 * Half the size of the patch: along the light, and across it, where the trail runs back. The bright
 * spot in it is about as wide as the end of the cone.
 */
const PATCH = { length: 3.2, width: 5, spotLength: 2.6, spotWidth: 2 };
const YARD_COLOR = "#232a44";
/** The lamp burns white inside and takes the color of the light at its rim. */
const LAMP_COLOR = "#ffffff";
/** Both cameras look at the hall from +z: a light turned that way shines at the viewer. */
const FLARE_SHARPNESS = 6;
/** Ponytail: more lit towers than a hall sees at once. Further ones get no lighthouse. */
const MOST_LIGHTHOUSES = 4;
const UP = new Vector3(0, 1, 0);

/** The lighthouse of one tower. It only exists once and is reused for the next one. */
interface Tower {
  /** Cone and lamp, drawn after all jellies. */
  group: Group;
  cone: Mesh;
  lamp: Mesh;
  patch: Mesh;
  light: LightUniforms;
  /** Where the cone starts and where it points, in the world. */
  axis: { uStart: { value: Vector3 }; uAxis: { value: Vector3 } };
  /** The lamp flares on its own, with the colors of the light. */
  lampPresence: { value: number };
}

/** Everything that draws the lighthouses. */
export interface Lighthouses {
  root: Object3D;
  towers: Tower[];
}

/** What {@link updateLighthouses} needs for a frame. */
export interface LighthouseFrame {
  /** Sorted from back to front, the order the jellies are drawn in. */
  spots: JellySpot[];
  effects: StageEffect[];
  stacks: StageStack[];
  platforms: Placement[];
  room: RoomSize;
  /** Local time in milliseconds, as used by the effects. */
  now: number;
  reducedMotion: boolean;
}

/** The shapes all lighthouses share. */
interface TowerShapes {
  cone: BufferGeometry;
  ball: BufferGeometry;
  plane: BufferGeometry;
}

/** Creates a mesh of light that is not culled, since it moves every frame. */
function createGlowMesh(geometry: BufferGeometry, material: ShaderMaterial): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** Creates one lighthouse, dark at first. */
function createTower(shapes: TowerShapes): Tower {
  const light: LightUniforms = {
    uTime: VENUE_TIME,
    uPresence: { value: 0 },
    uCore: { value: new Color() },
    uEdge: { value: new Color() },
  };
  const axis = { uStart: { value: new Vector3() }, uAxis: { value: new Vector3(0, 1, 0) } };
  const cone = createGlowMesh(
    shapes.cone,
    new ShaderMaterial({
      defines: { CONE_START: CONE.start.toFixed(3), CONE_END: CONE.end.toFixed(3) },
      uniforms: { ...light, ...axis },
      vertexShader: coneVertexShader,
      fragmentShader: `${dustShader}\n${coneFragmentShader}`,
      side: DoubleSide,
      ...FLOOR_BLENDING,
    }),
  );
  const patch = createGlowMesh(
    shapes.plane,
    new ShaderMaterial({
      defines: {
        PATCH_LENGTH: PATCH.length.toFixed(3),
        PATCH_WIDTH: PATCH.width.toFixed(3),
        SPOT_LENGTH: PATCH.spotLength.toFixed(3),
        SPOT_WIDTH: PATCH.spotWidth.toFixed(3),
      },
      uniforms: { ...light, uYard: { value: new Color(YARD_COLOR) } },
      vertexShader: poolVertexShader,
      fragmentShader: patchFragmentShader,
      ...FLOOR_BLENDING,
    }),
  );
  patch.renderOrder = FLAT_ORDER;
  patch.visible = false;
  const lampPresence = { value: 0 };
  const lamp = createLightMesh(
    shapes.ball,
    {
      ...light,
      uPresence: lampPresence,
      uCore: { value: new Color(LAMP_COLOR) },
      uEdge: light.uCore,
    },
    { defines: { LIGHT_ALPHA: "1.00", EDGE_SOFTNESS: "1.20" }, side: FrontSide },
  );
  const group = new Group();
  group.add(cone, lamp);
  group.visible = false;
  return { group, cone, lamp, patch, light, axis, lampPresence };
}

/** Creates the lighthouses, dark at first. The root belongs into the scene. */
export function createLighthouses(): Lighthouses {
  const shapes = {
    // The start of the cone lies at the origin and its length is 1, so a scale sets its length.
    cone: new CylinderGeometry(CONE.end, CONE.start, 1, CONE.around, 1, true).translate(0, 0.5, 0),
    ball: new SphereGeometry(LAMP.radius, LAMP.segments, LAMP.segments),
    plane: new PlaneGeometry(2 * PATCH.length, 2 * PATCH.width).rotateX(-Math.PI / 2),
  };
  const towers = Array.from({ length: MOST_LIGHTHOUSES }, () => createTower(shapes));
  const root = new Object3D();
  root.add(...towers.flatMap((tower) => [tower.patch, tower.group]));
  return { root, towers };
}

/** Turns cone and patch to where the light falls now and lets the lamp flare toward the viewer. */
function sweepTower(
  tower: Tower,
  frame: LighthouseFrame,
  light: Lighthouse,
  presence: number,
): void {
  const lamp = tower.lamp.position;
  const angle = calculateSweepAngle(light, frame.now);
  const direction = toSweepDirection(angle);
  const reach = measureReach({ x: lamp.x, z: lamp.z }, angle, toRoomRect(frame.room), REACH);
  const target = { x: lamp.x + direction.x * reach, z: lamp.z + direction.z * reach };
  const floor = findFloorHeight(target, frame.platforms);
  const toTarget = new Vector3(target.x, floor, target.z).sub(lamp);
  tower.cone.position.copy(lamp);
  tower.cone.scale.set(1, toTarget.length(), 1);
  tower.cone.quaternion.setFromUnitVectors(UP, toTarget.normalize());
  tower.axis.uStart.value.copy(lamp);
  tower.axis.uAxis.value.copy(toTarget);
  tower.patch.position.set(target.x, floor + SHADOW_HEIGHT, target.z);
  tower.patch.rotation.y = -angle;
  const flare = Math.max(0, direction.z) ** FLARE_SHARPNESS;
  tower.lamp.scale.setScalar(1 + LAMP.flare * flare);
  tower.lampPresence.value = presence * (0.7 + 0.3 * flare);
}

/** Lights the lighthouse on the head of the top jelly `spot`. */
function placeTower(
  tower: Tower,
  frame: LighthouseFrame,
  light: Lighthouse,
  spot: JellySpot,
): void {
  const presence = calculateSpotlightPresence(light, frame.now);
  paintLight(tower.light, light.hue);
  tower.light.uPresence.value = presence;
  tower.lamp.position.set(spot.head.x, spot.head.y + LAMP.lift, spot.head.z);
  // Over every jelly: the light shines through the hall in front of them.
  tower.group.renderOrder = FIRST_JELLY_ORDER + frame.spots.length;
  tower.group.visible = true;
  tower.cone.visible = !frame.reducedMotion;
  tower.patch.visible = !frame.reducedMotion;
  if (frame.reducedMotion) {
    tower.lamp.scale.setScalar(LAMP.still);
    tower.lampPresence.value = presence;
    return;
  }
  sweepTower(tower, frame, light, presence);
}

/** Lights a lighthouse on every highlighted tower top and switches off the rest. */
export function updateLighthouses(lighthouses: Lighthouses, frame: LighthouseFrame): void {
  let count = 0;
  for (const light of findLighthouses(frame.effects, frame.stacks)) {
    const tower = lighthouses.towers[count];
    const spot = frame.spots.find((candidate) => candidate.player.id === light.playerId);
    if (!tower || !spot) continue;
    placeTower(tower, frame, light, spot);
    count += 1;
  }
  for (const tower of lighthouses.towers.slice(count)) {
    tower.group.visible = false;
    tower.patch.visible = false;
  }
}
