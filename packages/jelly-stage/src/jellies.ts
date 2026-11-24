/**
 * The jellies on the stage: the same 3D jelly as in the app, one per player. Each one plays its
 * move, bounces when it gets XP and plays its emotes.
 *
 * @module
 */

import {
  animateJelly,
  BODY_BOTTOM,
  cosmeticLook,
  createJelly,
  createMotion,
  disposeJelly,
  HEAD,
  holdOf,
  loadCosmetic,
  pulseCosmetics,
  type Jelly,
  type Motion,
} from "@jelly/scene";
import { Group, Object3D } from "three";

import type { MotionPose, StageEffect } from "./effects.ts";
import type { StageMove, StagePlayer, StageStack } from "./types.ts";
import type { FloorPoint, ScenePoint } from "./world.ts";

import { findEmote, findMotionPose } from "./effects.ts";
import {
  createWearer,
  followHands,
  holdsModel,
  takeOff,
  wearCosmetic,
  WORN_SLOTS,
  type Wearer,
} from "./held.ts";
import { findPalette } from "./palette.ts";
import { calculateRandomValue } from "./random.ts";
import { createShadowCrowd, placeShadowCrowd, SHADOW_HEIGHT, type ShadowCrowd } from "./shadow.ts";
import {
  beginStacking,
  createStacking,
  forgetPerch,
  STANDING,
  stepPerch,
  type PerchPose,
  type Stacking,
} from "./stacking.ts";
import {
  calculateWalkPose,
  createWalker,
  stepWalker,
  type WalkPose,
  type Walker,
} from "./walking.ts";
import { syncWorn, type Worn, type WornWish } from "./worn.ts";
import { findFloorHeight, type Placement } from "./zones.ts";

/** From the feet to the top of the head, in jelly units. */
export const JELLY_HEIGHT = HEAD.y + HEAD.radius - BODY_BOTTOM;
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
/** Room for this many shadows at first. More jellies get a larger mesh. */
const SHADOW_CAPACITY = 64;
/** The draw order of the farthest jelly. Every nearer one draws one step later. */
export const FIRST_JELLY_ORDER = 1;
/** Within a tower the higher jelly draws later: it sits on the one below and overhangs its head. */
const TIER_ORDER = 0.001;
/** How fast a jelly steps up onto the stage or down from it, per second. */
const STEP_RATE = 10;
/** The winner of a ceremony grows to this size, and this fast per second. */
const WINNER_SCALE = 1.8;
const GROW_RATE = 2;
/** Higher than this over its floor a jelly is in the air or on a tower. */
const STEP_LIFT = 0.05;
/** With reduced motion a jelly glides along its move, without hopping or leaning. */
const STILL_WALK: WalkPose = { lift: 0, lean: 0 };

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
  /** How it stands in a tower, null when it has nothing to do with one. */
  perch: PerchPose | null;
  /** Distance to the camera for the draw order. A tower sorts as one, by its foot. */
  depth: number;
  /** Size of the jelly, 1 usually and larger for the winner of a ceremony. */
  scale: number;
  wearer: Wearer;
  worn: Worn<Object3D[]>;
}

/** All jellies on the stage. */
export interface JellyCast {
  root: Object3D;
  jellies: Map<number, StageJelly>;
  /** One shadow per jelly, all drawn in one call. */
  shadows: ShadowCrowd;
  stacking: Stacking;
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
  /** The stage platforms: jellies on them stand higher. */
  platforms: Placement[];
  /** The winner of a running ceremony, who grows on the stage. */
  winnerId: number | null;
  /** The newest move of each jelly, by player ID. Stack moves tell how high it sits. */
  moves: ReadonlyMap<number, StageMove>;
  /** The running stacks, as fresh as the last `stack.changed`. */
  stacks: StageStack[];
  /** Server time of this frame in milliseconds, as `ends_at` of a stack counts. */
  serverTime: number;
  /** Seconds since the last frame and since the page opened. */
  seconds: number;
  time: number;
  /** Local time in milliseconds, as used by the effects. */
  now: number;
  reducedMotion: boolean;
}

/** Where a jelly is, for the texts over it. */
export interface JellySpot {
  player: StagePlayer;
  /** Under the body, also up in a swaying tower or thrown out of one. */
  feet: ScenePoint;
  head: ScenePoint;
  /** Which level of a standing tower it sits on, 0 at the bottom. Missing outside a tower. */
  tier?: number;
}

/** Creates an empty cast. Its root belongs into the scene. */
export function createJellyCast(): JellyCast {
  const root = new Object3D();
  const shadows = createShadowCrowd(root, JELLY_SHADOW, SHADOW_CAPACITY);
  return { root, jellies: new Map(), shadows, stacking: createStacking(JELLY_HEIGHT) };
}

export { findPalette };

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
    perch: null,
    depth: 0,
    scale: 1,
    wearer: createWearer(jelly),
    worn: new Map(),
  });
}

/** Removes a jelly and frees what it holds. */
function removeJelly(cast: JellyCast, shown: StageJelly): void {
  cast.root.remove(shown.group);
  shown.worn.clear();
  disposeJelly(shown.jelly);
  cast.jellies.delete(shown.player.id);
  forgetPerch(cast.stacking, shown.player.id);
}

/** Dresses a jelly in what its player wears, without building the jelly again. */
function dressJelly({ wearer, player, worn }: StageJelly): void {
  const wanted = new Map<string, WornWish>();
  for (const slot of WORN_SLOTS) {
    const equipped = player.equipped[slot];
    if (equipped?.key) wanted.set(slot, { key: equipped.key, color: equipped.color ?? null });
  }
  syncWorn(worn, wanted, {
    load: loadCosmetic,
    put: (model, { key, color }, slot) =>
      wearCosmetic(wearer, model, findPalette(player.color).outline, {
        key,
        slot,
        look: { ...cosmeticLook(key), tint: color },
      }),
    remove: takeOff,
  });
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
    const current = cast.jellies.get(player.id);
    if (current) dressJelly(current);
  }
}

/** Lets a jelly bounce and beam, like the jelly in the app after a poke. */
export function pulseJelly(cast: JellyCast, playerId: number): void {
  const shown = cast.jellies.get(playerId);
  if (shown) shown.pulse += 1;
}

/** Puts a jelly where its walk, its effects and its tower put it, squashed as its tower wants. */
function placeJelly(
  shown: StageJelly,
  pose: Readonly<PerchPose>,
  walk: WalkPose,
  motion: MotionPose,
) {
  const { group, walker } = shown;
  // Squashed jellies keep their volume and their feet on the ground.
  const tall = shown.scale * pose.stretch;
  const wide = shown.scale / Math.sqrt(pose.stretch);
  group.scale.set(wide, tall, wide);
  const lift = walk.lift + motion.lift * JELLY_HEIGHT;
  const bottom = shown.elevation + pose.rise - BODY_BOTTOM * tall + lift;
  const { x, z } = walker.position;
  group.position.set(x + pose.offsetX + pose.swayX, bottom, z + pose.offsetZ + pose.swayZ);
  const yaw = walker.yaw + motion.turn + pose.spin;
  // The tower leans in the room, so its lean is turned into the frame of the turned jelly.
  const forward = pose.leanX * Math.sin(yaw) + pose.leanZ * Math.cos(yaw);
  const right = pose.leanX * Math.cos(yaw) - pose.leanZ * Math.sin(yaw);
  group.rotation.set(walk.lean + forward + pose.flip, yaw, motion.tilt - right, "YXZ");
  const hop = 1 - SHADOW_SHRINK * Math.min(1, lift / JELLY_HEIGHT);
  shown.shadowScale = shown.scale * pose.shadow * hop;
}

/** Walks, poses and animates one jelly. */
function updateJelly(cast: JellyCast, shown: StageJelly, frame: JellyFrame): void {
  const { walker } = shown;
  const playerId = shown.player.id;
  stepWalker(walker, {
    target: frame.positions.get(playerId) ?? walker.position,
    viewer: frame.viewer,
    seconds: frame.seconds,
  });
  const floor = findFloorHeight(walker.position, frame.platforms);
  shown.elevation += (floor - shown.elevation) * (1 - Math.exp(-STEP_RATE * frame.seconds));
  shown.perch = stepPerch(cast.stacking, playerId, frame.moves.get(playerId), walker.position);
  const pose = shown.perch ?? STANDING;
  // In the air or on a tower it does not hop along its move.
  const isPerched = frame.reducedMotion || pose.rise > STEP_LIFT;
  const walk = isPerched ? STILL_WALK : calculateWalkPose(walker);
  const motion = findMotionPose(frame.reducedMotion ? [] : frame.effects, playerId, frame.now);
  const wantedScale = frame.winnerId === playerId ? WINNER_SCALE : 1;
  shown.scale += (wantedScale - shown.scale) * (1 - Math.exp(-GROW_RATE * frame.seconds));
  placeJelly(shown, pose, walk, motion);
  // On a snack run it carries the snack like a board; a held cosmetic the way that one wants.
  const visiting = frame.visitors.has(playerId);
  const hold = holdOf(shown.player.equipped.hands?.key);
  animateJelly(shown.jelly, shown.motion, {
    time: frame.time + shown.timeOffset,
    rawDelta: frame.seconds,
    pulse: shown.pulse,
    reducedMotion: frame.reducedMotion,
    holding: visiting || holdsModel(shown.player),
    hold: visiting ? undefined : hold,
    emote: findEmote(frame.effects, playerId, frame.now),
  });
  followHands(shown.wearer, hold);
  pulseCosmetics(shown.jelly.root, frame.time + shown.timeOffset, frame.reducedMotion);
}

/** Puts every shadow on the floor under its jelly, never on the jelly below it in a tower. */
function placeShadows(cast: JellyCast, shownJellies: StageJelly[]): void {
  placeShadowCrowd(cast.shadows, shownJellies, (shown, spot) => {
    const { offsetX, offsetZ } = shown.perch ?? STANDING;
    spot.x = shown.walker.position.x + offsetX;
    spot.y = SHADOW_HEIGHT + shown.elevation;
    spot.z = shown.walker.position.z + offsetZ;
    spot.scale = shown.shadowScale;
  });
}

/** Measures how far a jelly is from the camera. A tower counts at its foot, its top draws last. */
function measureDepth(shown: StageJelly, camera: ScenePoint): number {
  const { group, walker } = shown;
  const tier = shown.perch?.tier;
  if (tier === undefined) {
    const { x, y, z } = group.position;
    return Math.hypot(x - camera.x, y - camera.y, z - camera.z);
  }
  const { x, z } = walker.position;
  const middle = shown.elevation - BODY_BOTTOM * shown.scale;
  return Math.hypot(x - camera.x, middle - camera.y, z - camera.z) - tier * TIER_ORDER;
}

/** Returns where a jelly is, for texts, rings and the camera. */
function locateSpot(shown: StageJelly): JellySpot {
  const { group, walker } = shown;
  const pose = shown.perch ?? STANDING;
  const up = (JELLY_HEIGHT + BODY_BOTTOM) * group.scale.y;
  const feet = {
    x: walker.position.x + pose.offsetX + pose.swayX,
    y: shown.elevation + pose.rise,
    z: walker.position.z + pose.offsetZ + pose.swayZ,
  };
  const head = {
    x: group.position.x + pose.leanX * up,
    y: group.position.y + up,
    z: group.position.z + pose.leanZ * up,
  };
  return { player: shown.player, feet, head, tier: pose.tier };
}

/** Moves every jelly for one frame and returns where they are, from back to front. */
export function updateJellies(cast: JellyCast, frame: JellyFrame): JellySpot[] {
  const { time, serverTime, seconds, reducedMotion } = frame;
  beginStacking(cast.stacking, frame.stacks, { time, serverTime, seconds, reducedMotion });
  const shownJellies = [...cast.jellies.values()];
  for (const shown of shownJellies) {
    updateJelly(cast, shown, frame);
    shown.depth = measureDepth(shown, frame.camera);
  }
  placeShadows(cast, shownJellies);
  shownJellies.sort((first, second) => second.depth - first.depth);
  return shownJellies.map((shown, rank) => {
    // Each jelly draws completely before the next nearer one, so it blends over those behind.
    shown.group.renderOrder = FIRST_JELLY_ORDER + rank;
    return locateSpot(shown);
  });
}
