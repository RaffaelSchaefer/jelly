/**
 * The garland of a conga line: a cord that sags from head to head along every follow of a line, hung
 * with bulbs in the colors of the two jellies it ties together, a large one on each head. The bulbs
 * light up one after another toward the head of the line, on the beat of the dance. With reduced
 * motion they all glow softly. All garlands draw in one call: the shader hangs cord and bulbs, a
 * frame only writes the two ends.
 *
 * @module
 */

import {
  BufferAttribute,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  Vector2,
} from "three";

import type { CongaLink } from "./congaLines.ts";
import type { JellySpot } from "./jellies.ts";

import { calculateCongaBeat, calculateSag, CONGA_CHASE } from "./congaLines.ts";
import { FIRST_JELLY_ORDER } from "./jellies.ts";
import { findPalette } from "./palette.ts";
import fragmentShader from "./shaders/conga.frag.glsl?raw";
import vertexShader from "./shaders/conga.vert.glsl?raw";
import { FLOOR_BLENDING } from "./shadow.ts";

/** The cord in jelly units: half its width, its least half width in pixels and its bends. */
const CORD = { half: 0.032, pixels: 1.1, segments: 14 };
const CORD_COLOR = "#232a44";
/**
 * The bulbs of one link. The first and the last sit on the two heads and are larger, the others hang
 * under the cord. All keep a least radius in pixels from far away and pop up from `pop` of their
 * size while their link appears.
 */
const BULB = {
  count: CONGA_CHASE.bulbs,
  radius: 0.16,
  onHead: 0.21,
  drop: 0.05,
  pixels: 4.2,
  pop: 0.4,
};
/** The look of a bulb, in shares of its radius: inked rim, glint and how far its halo reaches. */
const GLASS = {
  rim: 0.2,
  rimGlow: 0.6,
  glintSpot: 0.34,
  glintSize: 0.2,
  glintAlpha: 0.7,
  dark: 0.7,
  lit: 0.35,
  haloReach: 2.6,
  haloAlpha: 0.6,
};
/**
 * The bulb on a head sits this far above its top, about its radius. So it stays within the room the
 * news camera leaves over a head (`ROOM_OVER` in `newsCameraClear.ts`).
 */
const LIFT = 0.19;
/**
 * Between the heads the garland is as deep as if it hung this far behind where it hangs. So a face
 * up to this close behind it covers it, and the floor behind it never does. The push sets in over
 * `ramp` from each end, where the garland lies on the head it is tied to.
 */
const DEPTH_PUSH = { far: 1.8, ramp: 0.6 };
/** After every jelly and before the lighthouse, whose lamp glows over a cord. */
const AFTER_JELLIES = -0.5;
/** Marks a vertex of the cord in the attribute that numbers the bulbs. */
const NO_BULB = -1;
/** The corners of the square a bulb is drawn in. */
const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;
/** Ponytail: more follows than the lines of a full hall have. Further ones get no garland. */
const MOST_GARLANDS = 64;

/** What a frame writes for each garland. */
interface GarlandEnds {
  from: InstancedBufferAttribute;
  to: InstancedBufferAttribute;
  /** Sag in the middle, presence, and the ranks of the follower and of its target in their line. */
  hang: InstancedBufferAttribute;
  fromColor: InstancedBufferAttribute;
  toColor: InstancedBufferAttribute;
}

/** Everything that draws the garlands. */
export interface Garlands {
  /** Sorts the garlands after the jellies. It belongs into the scene. */
  root: Group;
  shape: InstancedBufferGeometry;
  ends: GarlandEnds;
  /** The beats of the conga so far. */
  beat: { value: number };
  /** 1 while the light runs along the bulbs, 0 with reduced motion. */
  motion: { value: number };
  /** The color of the bulbs by the color key of a jelly, parsed once. */
  tints: Map<string, Color>;
}

/** What {@link updateGarlands} needs for a frame. */
export interface GarlandFrame {
  /** Sorted from back to front, the order the jellies are drawn in. */
  spots: JellySpot[];
  /** The follows of all conga lines that show in this frame. */
  links: CongaLink[];
  /** Server time in milliseconds, the clock of the dance. */
  serverTime: number;
  reducedMotion: boolean;
}

/**
 * Creates the shape of one garland: a strip along the cord, then a square per bulb. A vertex holds
 * the share along the garland and its corner, the shader puts it between the two ends.
 */
function createGarlandShape(): InstancedBufferGeometry {
  const places: number[] = [];
  const bulbs: number[] = [];
  const corners: number[] = [];
  for (let bend = 0; bend <= CORD.segments; bend += 1) {
    const share = bend / CORD.segments;
    places.push(share, 0, -1, share, 0, 1);
    bulbs.push(NO_BULB, NO_BULB);
    if (bend > 0) corners.push(...listQuad(2 * bend - 2));
  }
  for (let bulb = 0; bulb < BULB.count; bulb += 1) {
    const share = bulb / (BULB.count - 1);
    corners.push(...listQuad(places.length / 3));
    for (const [across, up] of CORNERS) {
      places.push(share, across, up);
      bulbs.push(bulb);
    }
  }
  const shape = new InstancedBufferGeometry();
  shape.setAttribute("position", new BufferAttribute(new Float32Array(places), 3));
  shape.setAttribute("aBulb", new BufferAttribute(new Float32Array(bulbs), 1));
  shape.setIndex(corners);
  shape.instanceCount = 0;
  return shape;
}

/** Returns the two triangles of the four vertices from `first` on. */
function listQuad(first: number): number[] {
  return [first, first + 1, first + 2, first + 2, first + 1, first + 3];
}

/** Adds an attribute with `size` numbers per garland to the shape. */
function addEnds(
  shape: InstancedBufferGeometry,
  name: string,
  size: number,
): InstancedBufferAttribute {
  const ends = new InstancedBufferAttribute(new Float32Array(MOST_GARLANDS * size), size);
  ends.setUsage(DynamicDrawUsage);
  shape.setAttribute(name, ends);
  return ends;
}

/** Returns the numbers the shaders take from here. */
function listDefines(): Record<string, string> {
  return {
    LAST_BULB: (BULB.count - 1).toFixed(1),
    HEAD_BULB_RADIUS: BULB.onHead.toFixed(3),
    BULB_RADIUS: BULB.radius.toFixed(3),
    BULB_DROP: BULB.drop.toFixed(3),
    BULB_PIXELS: BULB.pixels.toFixed(2),
    BULB_POP: BULB.pop.toFixed(2),
    CORD_HALF: CORD.half.toFixed(3),
    CORD_PIXELS: CORD.pixels.toFixed(2),
    RIM_WIDTH: GLASS.rim.toFixed(2),
    RIM_GLOW: GLASS.rimGlow.toFixed(2),
    GLINT_SPOT: GLASS.glintSpot.toFixed(2),
    GLINT_SIZE: GLASS.glintSize.toFixed(2),
    GLINT_ALPHA: GLASS.glintAlpha.toFixed(2),
    DARK_SHARE: GLASS.dark.toFixed(2),
    LIT_WHITE: GLASS.lit.toFixed(2),
    HALO_REACH: GLASS.haloReach.toFixed(2),
    HALO_ALPHA: GLASS.haloAlpha.toFixed(2),
    CHASE_STEPS: CONGA_CHASE.steps.toFixed(1),
    CHASE_GROUP: CONGA_CHASE.group.toFixed(1),
    CHASE_FADE: CONGA_CHASE.fade.toFixed(2),
    STILL_LIGHT: CONGA_CHASE.still.toFixed(2),
    DEPTH_PUSH: DEPTH_PUSH.far.toFixed(2),
    PUSH_RAMP: DEPTH_PUSH.ramp.toFixed(2),
  };
}

/** Creates the garlands, none shown at first. The root belongs into the scene. */
export function createGarlands(): Garlands {
  const shape = createGarlandShape();
  const ends: GarlandEnds = {
    from: addEnds(shape, "aFrom", 3),
    to: addEnds(shape, "aTo", 3),
    hang: addEnds(shape, "aHang", 4),
    fromColor: addEnds(shape, "aFromColor", 3),
    toColor: addEnds(shape, "aToColor", 3),
  };
  const beat = { value: 0 };
  const motion = { value: 1 };
  const pixel = { value: 0 };
  const material = new ShaderMaterial({
    defines: listDefines(),
    uniforms: {
      uBeat: beat,
      uMotion: motion,
      uPixel: pixel,
      uCord: { value: new Color(CORD_COLOR) },
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    toneMapped: false,
    ...FLOOR_BLENDING,
  });
  const mesh = new Mesh(shape, material);
  mesh.frustumCulled = false;
  const size = new Vector2();
  mesh.onBeforeRender = (renderer) => {
    pixel.value = 2 / renderer.getDrawingBufferSize(size).y;
  };
  const root = new Group();
  root.add(mesh);
  root.visible = false;
  return { root, shape, ends, beat, motion, tints: new Map() };
}

/** Returns the color of the body of a jelly, parsed once into `tints`. */
export function findTint(tints: Map<string, Color>, spot: JellySpot): Color {
  const key = spot.player.color;
  const tint = tints.get(key) ?? new Color(findPalette(key).hex);
  tints.set(key, tint);
  return tint;
}

/** A link with the two jellies it ties together. */
interface LinkEnds {
  link: CongaLink;
  follower: JellySpot;
  target: JellySpot;
}

/** Hangs the garland at `index` from the follower of a link to the jelly it follows. */
function hangLink(garlands: Garlands, index: number, spots: LinkEnds): void {
  const { link } = spots;
  const { ends } = garlands;
  const from = spots.follower.crown;
  const to = spots.target.crown;
  ends.from.setXYZ(index, from.x, from.y + LIFT, from.z);
  ends.to.setXYZ(index, to.x, to.y + LIFT, to.z);
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  ends.hang.setXYZW(index, calculateSag(length), link.presence, link.rank, link.targetRank);
  const fromTint = findTint(garlands.tints, spots.follower);
  const toTint = findTint(garlands.tints, spots.target);
  ends.fromColor.setXYZ(index, fromTint.r, fromTint.g, fromTint.b);
  ends.toColor.setXYZ(index, toTint.r, toTint.g, toTint.b);
}

/** Hangs a garland along every link of a conga line and takes down the rest. */
export function updateGarlands(garlands: Garlands, frame: GarlandFrame): void {
  const { root, shape, ends } = garlands;
  root.visible = frame.links.length > 0;
  if (!root.visible) return;
  root.renderOrder = FIRST_JELLY_ORDER + frame.spots.length + AFTER_JELLIES;
  garlands.beat.value = calculateCongaBeat(frame.serverTime);
  garlands.motion.value = frame.reducedMotion ? 0 : 1;
  let count = 0;
  for (const link of frame.links) {
    if (count === MOST_GARLANDS) break;
    const follower = frame.spots.find((spot) => spot.player.id === link.followerId);
    const target = frame.spots.find((spot) => spot.player.id === link.targetId);
    if (!follower || !target) continue;
    hangLink(garlands, count, { link, follower, target });
    count += 1;
  }
  shape.instanceCount = count;
  for (const attribute of Object.values(ends)) attribute.needsUpdate = true;
}
