/**
 * The chillout lounge: a dotted rug with tassels, a couch under a neon sign and fairy lights, a lava
 * lamp, beanbags and plants. The middle of the rug stays free, the jellies chill there.
 *
 * @module
 */

import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  BoxGeometry,
} from "three";

import type { FloorPoint, FloorRect, ScenePoint } from "./world.ts";

import { createBulbs, type BulbLook } from "./bulbs.ts";
import { createCouch, COUCH_DEPTH } from "./couch.ts";
import { createBush, createSnakePlant } from "./plants.ts";
import {
  CHROME_MATERIAL,
  createBox,
  createMatte,
  FACE_LIFT,
  findMiddle,
  GLOW_COLORS,
  keepMaterial,
  layFlat,
  mergeParts,
  placeMesh,
  VENUE_TIME,
} from "./props.ts";
import lavaFragmentShader from "./shaders/lava.frag.glsl?raw";
import propVertexShader from "./shaders/prop.vert.glsl?raw";
import rugFragmentShader from "./shaders/rug.frag.glsl?raw";
import { createSignMaterial } from "./signs.ts";
import { shrinkRect } from "./world.ts";

/** The dots of the rug mix this share of a pale lilac into the glow colors. */
const RUG = { inset: 0.35, height: 0.02, pastel: 0.45 };
/** Tassels reach `tuck` under the rug. */
const TASSEL = { length: 0.16, width: 0.035, height: 0.02, gap: 0.14, corner: 0.45, tuck: 0.02 };
const COUCH = { share: 0.44, longest: 3.4, backGap: 0.1 };
const SIGN = { width: 2.7, height: 0.72, border: 0.05, depth: 0.06, bottom: 1.08, text: "chill" };
const POST = { radius: 0.04, height: 2.15, inset: 0.12 };
/** The fairy lights sag by this share of each span between two posts, with a few bulbs at least. */
const GARLAND = {
  gap: 0.27,
  sag: 0.08,
  wire: 0.01,
  bulb: 0.045,
  segments: 48,
  wireSides: 4,
  fewest: 2,
};
/** Scales share × (1 − share) so the sag is exactly 1 in the middle of a span. */
const SAG_PEAK = 4;
const SIDE_TABLE = { size: 0.52, height: 0.42, gap: 0.45 };
/** The cap sinks `capSink` over the top of the glass. */
const LAVA = {
  baseTop: 0.12,
  baseBottom: 0.2,
  baseHeight: 0.24,
  glassHeight: 0.64,
  glassRadius: 0.17,
  capTop: 0.06,
  capBottom: 0.1,
  capHeight: 0.14,
  capSink: 0.01,
};
/** Outline of the lava lamp glass from bottom to top, radius and height. */
const LAVA_PROFILE: [number, number][] = [
  [0.11, 0],
  [0.16, 0.15],
  [0.17, 0.26],
  [0.14, 0.48],
  [0.095, 0.64],
  [0.001, 0.64],
];
/** Outline of a beanbag from the floor to the dent on top, radius and height. */
const BEANBAG_PROFILE: [number, number][] = [
  [0.001, 0],
  [0.44, 0.01],
  [0.57, 0.1],
  [0.6, 0.24],
  [0.55, 0.4],
  [0.42, 0.53],
  [0.25, 0.6],
  [0.12, 0.55],
  [0.001, 0.52],
];
/** A seam runs around every beanbag a little above the floor. */
const SEAM = { radius: 0.585, tube: 0.025, height: 0.13 };
const BEANBAG_SHADE = { soften: 0.2, seam: 0.82 };
/** How far a beanbag leans to the side, so it never sits quite straight. */
const BEANBAG_TILT = 0.06;
/** Plants stand in the back corners of the rug, this far from its sides and its back. */
const PLANT = { snakeSide: 0.38, bushSide: 0.42, back: 0.42 };
const SEGMENTS = { post: 8, lampRound: 20, glass: 28, beanbag: 28, seamTube: 8, seamRing: 36 };
/** Beanbags in shares of the rug: across, from the back, size and color. */
const BEANBAG_SPOTS: [number, number, number, number][] = [
  [0.13, 0.4, 1, 0],
  [0.07, 0.82, 0.92, 1],
  [0.93, 0.8, 1.05, 2],
  [0.92, 0.42, 0.88, 1],
];

const TASSEL_MATERIAL = createMatte("#f7f0e3");
const BOARD_MATERIAL = createMatte("#252a48");
const POST_MATERIAL = createMatte("#5b4636");
const WIRE_MATERIAL = createMatte("#3f5a49");
const TABLE_MATERIAL = createMatte("#e9c89c");
/** Beanbags take the glow colors a little softer, with a darker seam. */
const BEANBAG_COLORS = GLOW_COLORS.map((color) =>
  new Color(color).lerp(new Color("#ffffff"), BEANBAG_SHADE.soften),
);
const BEANBAG_MATERIALS = BEANBAG_COLORS.map((color) => createMatte(`#${color.getHexString()}`));
const SEAM_MATERIALS = BEANBAG_COLORS.map((color) =>
  createMatte(`#${color.clone().multiplyScalar(BEANBAG_SHADE.seam).getHexString()}`),
);
const NEON_MATERIAL = createSignMaterial({
  text: SIGN.text,
  width: SIGN.width,
  height: SIGN.height,
  board: "#1d2140",
  ink: "#fff3fe",
  weight: 800,
  glow: "#f07de8",
  frame: "#7ff6e6",
});
const LAVA_MATERIAL = keepMaterial(
  new ShaderMaterial({
    defines: {
      GLASS_HEIGHT: LAVA.glassHeight.toFixed(3),
      GLASS_RADIUS: LAVA.glassRadius.toFixed(3),
    },
    uniforms: {
      uTime: VENUE_TIME,
      uLiquid: { value: new Color("#b65ad8") },
      uWax: { value: new Color("#ffd27a") },
    },
    vertexShader: propVertexShader,
    fragmentShader: lavaFragmentShader,
    toneMapped: false,
  }),
);

/** Creates the rug of one lounge. It knows the rug size, so it belongs to that rug. */
function createRugMaterial(width: number, depth: number): ShaderMaterial {
  const pastel = (color: string) => new Color(color).lerp(new Color("#f3ecfb"), RUG.pastel);
  return new ShaderMaterial({
    uniforms: {
      uHalfSize: { value: new Vector2(width / 2, depth / 2) },
      uField: { value: new Color("#ece3f8") },
      uBorder: { value: new Color("#c7b2ee") },
      uLine: { value: new Color("#fbf7ff") },
      uDots: { value: GLOW_COLORS.map(pastel) },
    },
    vertexShader: propVertexShader,
    fragmentShader: rugFragmentShader,
    toneMapped: false,
  });
}

/** Builds the rug with its tassels at both ends. */
function createRug(rug: FloorRect): Group {
  const width = rug.maxX - rug.minX;
  const depth = rug.maxZ - rug.minZ;
  const middle = findMiddle(rug);
  const carpet = placeMesh(new PlaneGeometry(width, depth), createRugMaterial(width, depth), {
    x: middle.x,
    y: RUG.height,
    z: middle.z,
  });
  carpet.rotation.x = -Math.PI / 2;
  const count = Math.max(0, Math.floor((depth - 2 * TASSEL.corner) / TASSEL.gap));
  const parts = [rug.minX, rug.maxX].flatMap((edge) =>
    Array.from({ length: count }, (_, index) => ({
      geometry: new BoxGeometry(TASSEL.length, TASSEL.height, TASSEL.width),
      at: {
        x: edge + Math.sign(edge - middle.x) * (TASSEL.length / 2 - TASSEL.tuck),
        y: TASSEL.height / 2,
        z: rug.minZ + TASSEL.corner + (index + 0.5) * TASSEL.gap,
      },
    })),
  );
  const rugGroup = new Group();
  rugGroup.add(layFlat(carpet), layFlat(mergeParts(parts, TASSEL_MATERIAL)));
  return rugGroup;
}

/** Returns bulbs hanging between two points, sagging in the middle. */
function listGarlandPoints(from: ScenePoint, to: ScenePoint): ScenePoint[] {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const count = Math.max(GARLAND.fewest, Math.round(length / GARLAND.gap));
  return Array.from({ length: count + 1 }, (_, index) => {
    const share = index / count;
    return {
      x: from.x + share * (to.x - from.x),
      y: from.y + share * (to.y - from.y) - GARLAND.sag * length * SAG_PEAK * share * (1 - share),
      z: from.z + share * (to.z - from.z),
    };
  });
}

/** Builds the neon sign on two posts and the fairy lights from the back corners to its posts. */
function createSignWall(rug: FloorRect, middle: FloorPoint): Group {
  const wall = new Group();
  const z = rug.minZ + POST.inset;
  const posts = [
    rug.minX + POST.inset,
    middle.x - SIGN.width / 2 - POST.radius,
    middle.x + SIGN.width / 2 + POST.radius,
    rug.maxX - POST.inset,
  ];
  for (const x of posts) {
    const post = new CylinderGeometry(POST.radius, POST.radius, POST.height, SEGMENTS.post);
    wall.add(placeMesh(post, POST_MATERIAL, { x, y: POST.height / 2, z }));
  }
  const board = {
    width: SIGN.width + 2 * SIGN.border,
    height: SIGN.height + 2 * SIGN.border,
    depth: SIGN.depth,
  };
  wall.add(createBox(board, BOARD_MATERIAL, { x: middle.x, z }, SIGN.bottom - SIGN.border));
  const face = placeMesh(new PlaneGeometry(SIGN.width, SIGN.height), NEON_MATERIAL, {
    x: middle.x,
    y: SIGN.bottom + SIGN.height / 2,
    z: z + SIGN.depth / 2 + FACE_LIFT,
  });
  wall.add(face);
  const tops = posts.map((x) => ({ x, y: POST.height, z }));
  const points = tops.slice(1).flatMap((top, index) => listGarlandPoints(tops[index] ?? top, top));
  const wire = new TubeGeometry(
    new CatmullRomCurve3(points.map((point) => new Vector3(point.x, point.y, point.z))),
    GARLAND.segments,
    GARLAND.wire,
    GARLAND.wireSides,
  );
  wall.add(placeMesh(wire, WIRE_MATERIAL, { x: 0, y: 0, z: 0 }));
  const look: BulbLook = {
    radius: GARLAND.bulb,
    colors: [...GLOW_COLORS, "#fff4d6"],
    pattern: "twinkle",
  };
  wall.add(createBulbs(points, look));
  return wall;
}

/** Builds a side table with a lava lamp on it. */
function createLavaLamp(spot: FloorPoint): Group {
  const lamp = new Group();
  const table = { width: SIDE_TABLE.size, height: SIDE_TABLE.height, depth: SIDE_TABLE.size };
  lamp.add(createBox(table, TABLE_MATERIAL, spot, 0));
  const base = new CylinderGeometry(
    LAVA.baseTop,
    LAVA.baseBottom,
    LAVA.baseHeight,
    SEGMENTS.lampRound,
  );
  const glassBottom = SIDE_TABLE.height + LAVA.baseHeight;
  const glassTop = glassBottom + LAVA.glassHeight;
  const outline = LAVA_PROFILE.map(([radius, height]) => new Vector2(radius, height));
  const cap = new CylinderGeometry(LAVA.capTop, LAVA.capBottom, LAVA.capHeight, SEGMENTS.lampRound);
  lamp.add(
    placeMesh(base, CHROME_MATERIAL, { ...spot, y: SIDE_TABLE.height + LAVA.baseHeight / 2 }),
    placeMesh(new LatheGeometry(outline, SEGMENTS.glass), LAVA_MATERIAL, {
      ...spot,
      y: glassBottom,
    }),
    placeMesh(cap, CHROME_MATERIAL, { ...spot, y: glassTop + LAVA.capHeight / 2 - LAVA.capSink }),
  );
  return lamp;
}

/** Builds a beanbag with a dent where someone sat and a seam around it. */
function createBeanbag(spot: FloorPoint, size: number, color: number): Group {
  const beanbag = new Group();
  const outline = BEANBAG_PROFILE.map(([radius, height]) => new Vector2(radius, height));
  const index = color % BEANBAG_MATERIALS.length;
  const seam = placeMesh(
    new TorusGeometry(SEAM.radius, SEAM.tube, SEGMENTS.seamTube, SEGMENTS.seamRing),
    SEAM_MATERIALS[index] ?? TABLE_MATERIAL,
    { x: 0, y: SEAM.height, z: 0 },
  );
  seam.rotation.x = Math.PI / 2;
  beanbag.add(
    placeMesh(
      new LatheGeometry(outline, SEGMENTS.beanbag),
      BEANBAG_MATERIALS[index] ?? TABLE_MATERIAL,
      {
        x: 0,
        y: 0,
        z: 0,
      },
    ),
    seam,
  );
  beanbag.position.set(spot.x, 0, spot.z);
  beanbag.scale.setScalar(size);
  beanbag.rotation.z = (index - 1) * BEANBAG_TILT;
  return beanbag;
}

/** Builds the lounge. */
export function createLounge(rect: FloorRect): Group {
  const lounge = new Group();
  const rug = shrinkRect(rect, RUG.inset);
  const width = rug.maxX - rug.minX;
  const depth = rug.maxZ - rug.minZ;
  const middle = findMiddle(rug);
  const couchWidth = Math.min(COUCH.longest, width * COUCH.share);
  const couchSpot = { x: middle.x, z: rug.minZ + COUCH.backGap + COUCH_DEPTH / 2 };
  const tableSpot = {
    x: middle.x + couchWidth / 2 + SIDE_TABLE.gap,
    z: rug.minZ + SIDE_TABLE.gap,
  };
  lounge.add(
    createRug(rug),
    createCouch(couchSpot, couchWidth),
    createSignWall(rug, middle),
    createLavaLamp(tableSpot),
    createSnakePlant({ x: rug.minX + PLANT.snakeSide, z: rug.minZ + PLANT.back }),
    createBush({ x: rug.maxX - PLANT.bushSide, z: rug.minZ + PLANT.back }),
  );
  for (const [across, fromBack, size, color] of BEANBAG_SPOTS) {
    const spot = { x: rug.minX + across * width, z: rug.minZ + fromBack * depth };
    lounge.add(createBeanbag(spot, size, color));
  }
  return lounge;
}
