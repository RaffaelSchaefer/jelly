/**
 * The jellies on the stage: the same 3D jelly as in the app, one per player. Each one plays its
 * move, bounces when it gets XP and plays its emotes.
 *
 * @module
 */

import {
  animateJelly,
  BODY_BOTTOM,
  createJelly,
  createMotion,
  disposeJelly,
  HEAD,
  JELLY_COLORS,
  type Jelly,
  type JellyPalette,
  type Motion,
} from "@jelly/scene";
import { Euler, Group, Matrix4, Object3D, Quaternion, Vector3, type InstancedMesh } from "three";

import type { StageEffect } from "./effects.ts";
import type { StagePlayer } from "./types.ts";
import type { FloorPoint, FloorRect, ScenePoint } from "./world.ts";

import { findMotionPose } from "./effects.ts";
import { createShadowInstances, disposeShadow, SHADOW_HEIGHT } from "./shadow.ts";
import { calculateRandomValue } from "./random.ts";
import { calculateWalkPose, createWalker, stepWalker, type Walker } from "./walking.ts";
import { findFloorHeight } from "./zones.ts";

/** From the feet to the top of the head, in jelly units. */
const JELLY_HEIGHT = HEAD.y + HEAD.radius - BODY_BOTTOM;
/** Every jelly has its own clock offset, so they do not bob and blink in step. */
const SEED_ANIMATION = 98;
const ANIMATION_OFFSET_SECONDS = 10;
const JELLY_SHADOW = {
  halfWidth: 0.8,
  halfDepth: 0.55,
  radius: 0.55,
  softness: 0.3,
  strength: 0.3,
};
/** A jumping jelly casts a smaller shadow. */
const SHADOW_SHRINK = 0.3;
/** Shadows lie flat on the floor. */
const SHADOW_TURN = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
/** Room for this many shadows at first. More jellies get a larger mesh. */
const SHADOW_CAPACITY = 64;
const FIRST_JELLY_ORDER = 1;
/** How fast a jelly steps up onto the stage or down from it, per second. */
const STEP_RATE = 10;

/** One jelly on the stage. */
interface StageJelly {
  player: StagePlayer;
  /** Draws the jelly as a whole, so it can be sorted from back to front. */
  group: Group;
  jelly: Jelly;
  motion: Motion;
  pulse: number;
  timeOffset: number;
  walker: Walker;
  /** Size of the shadow right now, 1 when standing on the floor. */
  shadowScale: number;
  /** How high the floor under the jelly is, eased so it steps up instead of jumping. */
  elevation: number;
}

/** All jellies on the stage. */
export interface JellyCast {
  root: Object3D;
  jellies: Map<number, StageJelly>;
  /** One shadow per jelly, all drawn in one call. */
  shadows: InstancedMesh;
}

/** What {@link updateJellies} needs for a frame. */
export interface JellyFrame {
  /** Where the move of each jelly puts it in this frame, by player ID. */
  positions: Map<number, FloorPoint>;
  viewer: FloorPoint;
  camera: ScenePoint;
  effects: StageEffect[];
  /** Jellies on a snack run carry their snack with both hands. */
  visitors: Set<number>;
  /** Raised floors: jellies on them stand higher. */
  stages: FloorRect[];
  /** Seconds since the last frame and since the page opened. */
  seconds: number;
  time: number;
  /** Local time in milliseconds, as used by the effects. */
  now: number;
}

/** Where a jelly is, for the texts over it. */
export interface JellySpot {
  player: StagePlayer;
  feet: ScenePoint;
  head: ScenePoint;
}

/** Creates an empty cast. Its root belongs into the scene. */
export function createJellyCast(): JellyCast {
  const root = new Object3D();
  const shadows = createShadowInstances(JELLY_SHADOW, SHADOW_CAPACITY);
  root.add(shadows);
  return { root, jellies: new Map(), shadows };
}

/** Returns the colors of a jelly. Unknown colors look like mint. */
function findPalette(color: string): JellyPalette {
  return Object.entries(JELLY_COLORS).find(([key]) => key === color)?.[1] ?? JELLY_COLORS.mint;
}

/** Builds a jelly that appears where its move puts it. */
function addJelly(cast: JellyCast, player: StagePlayer, position: FloorPoint): void {
  const jelly = createJelly(findPalette(player.color));
  const group = new Group();
  group.add(jelly.root);
  cast.root.add(group);
  cast.jellies.set(player.id, {
    player,
    group,
    jelly,
    motion: createMotion(0),
    pulse: 0,
    timeOffset: calculateRandomValue(player.id, SEED_ANIMATION) * ANIMATION_OFFSET_SECONDS,
    walker: createWalker(position),
    shadowScale: 1,
    elevation: 0,
  });
}

/** Removes a jelly and frees what it holds. */
function removeJelly(cast: JellyCast, shown: StageJelly): void {
  cast.root.remove(shown.group);
  disposeJelly(shown.jelly);
  cast.jellies.delete(shown.player.id);
}

/** Adds new players, removes those who left and rebuilds jellies that changed their color. */
export function syncJellies(
  cast: JellyCast,
  players: StagePlayer[],
  positions: Map<number, FloorPoint>,
): void {
  const present = new Set(players.map((player) => player.id));
  for (const shown of cast.jellies.values()) {
    if (!present.has(shown.player.id)) removeJelly(cast, shown);
  }
  for (const player of players) {
    const shown = cast.jellies.get(player.id);
    if (shown && shown.player.color !== player.color) {
      removeJelly(cast, shown);
      addJelly(cast, player, shown.walker.position);
    } else if (shown) {
      shown.player = player;
    } else {
      addJelly(cast, player, positions.get(player.id) ?? { x: 0, z: 0 });
    }
  }
}

/** Lets a jelly bounce and beam, like the jelly in the app after a poke. */
export function pulseJelly(cast: JellyCast, playerId: number): void {
  const shown = cast.jellies.get(playerId);
  if (shown) shown.pulse += 1;
}

/** Walks, poses and animates one jelly. */
function updateJelly(shown: StageJelly, frame: JellyFrame): void {
  const { walker, group } = shown;
  stepWalker(walker, {
    target: frame.positions.get(shown.player.id) ?? walker.position,
    viewer: frame.viewer,
    seconds: frame.seconds,
  });
  const floor = findFloorHeight(walker.position, frame.stages);
  shown.elevation += (floor - shown.elevation) * (1 - Math.exp(-STEP_RATE * frame.seconds));
  const walk = calculateWalkPose(walker);
  const motion = findMotionPose(frame.effects, shown.player.id, frame.now);
  const lift = walk.lift + motion.lift * JELLY_HEIGHT;
  group.position.set(walker.position.x, shown.elevation - BODY_BOTTOM + lift, walker.position.z);
  group.rotation.set(walk.lean, walker.yaw + motion.turn, motion.tilt, "YXZ");
  shown.shadowScale = 1 - SHADOW_SHRINK * Math.min(1, lift / JELLY_HEIGHT);
  animateJelly(shown.jelly, shown.motion, {
    time: frame.time + shown.timeOffset,
    rawDelta: frame.seconds,
    pulse: shown.pulse,
    reducedMotion: false,
    holding: frame.visitors.has(shown.player.id),
  });
}

/** Puts every shadow under its jelly. A mesh that got too small is replaced by a larger one. */
function placeShadows(cast: JellyCast, shownJellies: StageJelly[]): void {
  if (shownJellies.length > cast.shadows.instanceMatrix.count) {
    cast.root.remove(cast.shadows);
    disposeShadow(cast.shadows);
    cast.shadows = createShadowInstances(JELLY_SHADOW, 2 * shownJellies.length);
    cast.root.add(cast.shadows);
  }
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  shownJellies.forEach((shown, index) => {
    const { x, z } = shown.walker.position;
    position.set(x, SHADOW_HEIGHT + shown.elevation, z);
    scale.setScalar(shown.shadowScale);
    cast.shadows.setMatrixAt(index, matrix.compose(position, SHADOW_TURN, scale));
  });
  cast.shadows.count = shownJellies.length;
  cast.shadows.instanceMatrix.needsUpdate = true;
}

/** Moves every jelly for one frame and returns where they are, from back to front. */
export function updateJellies(cast: JellyCast, frame: JellyFrame): JellySpot[] {
  const shownJellies = [...cast.jellies.values()];
  for (const shown of shownJellies) {
    updateJelly(shown, frame);
  }
  placeShadows(cast, shownJellies);
  const distanceOf = (shown: StageJelly) =>
    Math.hypot(
      shown.group.position.x - frame.camera.x,
      shown.group.position.y - frame.camera.y,
      shown.group.position.z - frame.camera.z,
    );
  shownJellies.sort((first, second) => distanceOf(second) - distanceOf(first));
  return shownJellies.map((shown, rank) => {
    // Each jelly draws completely before the next nearer one, so it blends over those behind.
    shown.group.renderOrder = FIRST_JELLY_ORDER + rank;
    const { x, z } = shown.walker.position;
    return {
      player: shown.player,
      feet: { x, y: shown.elevation, z },
      head: { x, y: shown.group.position.y + JELLY_HEIGHT + BODY_BOTTOM, z },
    };
  });
}
