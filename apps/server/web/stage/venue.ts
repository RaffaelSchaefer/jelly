/**
 * The front of the hall in 3D: the stage with its two beamer screens, the chillout lounge and the
 * snack bar. None of them are desks, each has a look of its own.
 *
 * @module
 */

import { JELLY_COLORS } from "@jelly/scene/colors";
import {
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { StageArea } from "./types.ts";
import type { FloorRect } from "./world.ts";

import { createBlock } from "./furniture.ts";
import fragmentShader from "./shaders/screen.frag.glsl?raw";
import vertexShader from "./shaders/screen.vert.glsl?raw";
import { createShadow, disposeShadow } from "./shadow.ts";
import { toFloorRect } from "./world.ts";
import { COUNTER_HEIGHT, listScreenRects, SCREEN_WIDTH, STAGE_HEIGHT } from "./zones.ts";

const ROUND_SEGMENTS = 2;
const PROP_ORDER = 3;
const STAGE_CORNER = 0.08;
const TRIM = { height: 0.06, depth: 0.12 };
/** The screen hangs this high over the stage floor and is this tall. */
const SCREEN_BOTTOM = 0.55;
const SCREEN_HEIGHT = 2.3;
const FRAME_BORDER = 0.12;
const FRAME_DEPTH = 0.12;
const SOCKET = { width: 0.32, height: 0.26, depth: 0.2, inset: 0.35 };
const RUG = { inset: 0.35, height: 0.03 };
const BEANBAG = { radius: 0.55, squash: 0.62 };
/** Beanbags sit along the back of the lounge and at its ends, so the middle stays free. */
const BEANBAG_SPOTS = [
  [0.12, 0.2],
  [0.38, 0.15],
  [0.62, 0.15],
  [0.88, 0.2],
  [0.08, 0.7],
  [0.92, 0.7],
];
const PLANT = { potRadius: 0.24, potHeight: 0.42, leafRadius: 0.45, inset: 0.4 };
const COUNTER = { corner: 0.06, topHeight: 0.08, overhang: 0.08 };
const SNACKS_PER_UNIT = 1.4;
const CUP = { radius: 0.09, height: 0.24 };
const BAG = { width: 0.24, height: 0.3, depth: 0.08 };
const ZONE_SHADOW = { radius: 0.2, softness: 0.4, strength: 0.18 };

const STAGE_MATERIAL = new MeshLambertMaterial({ color: "#56658a", toneMapped: false });
const TRIM_MATERIAL = new MeshLambertMaterial({ color: "#d5def0", toneMapped: false });
const FRAME_MATERIAL = new MeshLambertMaterial({ color: "#2d3446", toneMapped: false });
const SOCKET_MATERIAL = new MeshLambertMaterial({ color: "#e98a3a", toneMapped: false });
const RUG_MATERIAL = new MeshLambertMaterial({ color: "#e6def6", toneMapped: false });
const POT_MATERIAL = new MeshLambertMaterial({ color: "#d9875f", toneMapped: false });
const LEAF_MATERIAL = new MeshLambertMaterial({ color: "#73c48a", toneMapped: false });
const COUNTER_MATERIAL = new MeshLambertMaterial({ color: "#e3b582", toneMapped: false });
const COUNTER_TOP_MATERIAL = new MeshLambertMaterial({ color: "#fff6e8", toneMapped: false });
/** Beanbags, cups and snack bags in the light jelly colors. */
const PASTEL_MATERIALS = Object.values(JELLY_COLORS).map(
  (palette) => new MeshLambertMaterial({ color: palette.glow, toneMapped: false }),
);
const SCREEN_MATERIAL = new ShaderMaterial({
  defines: { SCREEN_ASPECT: (SCREEN_WIDTH / SCREEN_HEIGHT).toFixed(3) },
  uniforms: {
    uTime: { value: 0 },
    uSeed: { value: 0 },
    uBase: { value: new Color("#1b2242") },
    uColors: { value: Object.values(JELLY_COLORS).map((palette) => new Color(palette.glow)) },
  },
  vertexShader,
  fragmentShader,
  toneMapped: false,
});
/** Materials live for the whole page, only geometries and shadows are freed. */
const SHARED_MATERIALS = new Set<Material>([
  STAGE_MATERIAL,
  TRIM_MATERIAL,
  FRAME_MATERIAL,
  SOCKET_MATERIAL,
  RUG_MATERIAL,
  POT_MATERIAL,
  LEAF_MATERIAL,
  COUNTER_MATERIAL,
  COUNTER_TOP_MATERIAL,
  SCREEN_MATERIAL,
  ...PASTEL_MATERIALS,
]);

/** Returns the middle of a rectangle. */
function findMiddle(rect: FloorRect) {
  return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
}

/** Returns a pastel material, chosen by a running number. */
function pickPastel(index: number): MeshLambertMaterial {
  return PASTEL_MATERIALS[index % PASTEL_MATERIALS.length] ?? RUG_MATERIAL;
}

/** Creates a soft shadow under a rectangle. */
function createZoneShadow(rect: FloorRect): Mesh {
  const shadow = createShadow({
    halfWidth: (rect.maxX - rect.minX) / 2,
    halfDepth: (rect.maxZ - rect.minZ) / 2,
    ...ZONE_SHADOW,
  });
  const middle = findMiddle(rect);
  shadow.position.x = middle.x;
  shadow.position.z = middle.z;
  return shadow;
}

/** Builds a beamer screen in its frame, standing on the stage. */
function createScreen(rect: FloorRect, seed: number): Group {
  const screen = new Group();
  const middle = findMiddle(rect);
  const frame = new RoundedBoxGeometry(
    SCREEN_WIDTH + 2 * FRAME_BORDER,
    SCREEN_HEIGHT + 2 * FRAME_BORDER,
    FRAME_DEPTH,
    ROUND_SEGMENTS,
    FRAME_DEPTH / 2 - 0.01,
  );
  screen.add(
    createBlock(frame, FRAME_MATERIAL, middle, STAGE_HEIGHT + SCREEN_BOTTOM - FRAME_BORDER),
  );
  const legHeight = SCREEN_BOTTOM - FRAME_BORDER;
  for (const side of [-1, 1]) {
    const leg = new CylinderGeometry(0.05, 0.05, legHeight, 8);
    const spot = { x: middle.x + side * (SCREEN_WIDTH / 2 - 0.3), z: middle.z };
    screen.add(createBlock(leg, FRAME_MATERIAL, spot, STAGE_HEIGHT));
  }
  const picture = new Mesh(new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), SCREEN_MATERIAL);
  picture.position.set(middle.x, STAGE_HEIGHT + SCREEN_BOTTOM + SCREEN_HEIGHT / 2, middle.z);
  picture.position.z += FRAME_DEPTH / 2 + 0.005;
  // One material for both screens: each sets its own seed right before it is drawn.
  picture.onBeforeRender = () => {
    const seedUniform = SCREEN_MATERIAL.uniforms.uSeed;
    if (seedUniform) seedUniform.value = seed;
    SCREEN_MATERIAL.uniformsNeedUpdate = true;
  };
  screen.add(picture);
  return screen;
}

/** Builds the stage: a platform with a light front edge, two beamers and the 32A sockets. */
function createStage(rect: FloorRect): Group {
  const stage = new Group();
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const middle = findMiddle(rect);
  const platform = new RoundedBoxGeometry(width, STAGE_HEIGHT, depth, ROUND_SEGMENTS, STAGE_CORNER);
  stage.add(createBlock(platform, STAGE_MATERIAL, middle, 0));
  const trim = new RoundedBoxGeometry(width, TRIM.height, TRIM.depth, ROUND_SEGMENTS, 0.02);
  const trimSpot = { x: middle.x, z: rect.maxZ - TRIM.depth / 2 };
  stage.add(createBlock(trim, TRIM_MATERIAL, trimSpot, STAGE_HEIGHT));
  listScreenRects(rect).forEach((screenRect, index) => stage.add(createScreen(screenRect, index)));
  for (const x of [rect.minX + SOCKET.inset, rect.maxX - SOCKET.inset]) {
    const socket = new RoundedBoxGeometry(SOCKET.width, SOCKET.height, SOCKET.depth, 1, 0.03);
    stage.add(
      createBlock(socket, SOCKET_MATERIAL, { x, z: rect.minZ + SOCKET.inset }, STAGE_HEIGHT),
    );
  }
  stage.add(createZoneShadow(rect));
  return stage;
}

/** Builds a potted plant. */
function createPlant(spot: { x: number; z: number }): Group {
  const plant = new Group();
  const pot = new CylinderGeometry(PLANT.potRadius, PLANT.potRadius * 0.8, PLANT.potHeight, 16);
  plant.add(createBlock(pot, POT_MATERIAL, spot, 0));
  const leaves = new Mesh(new SphereGeometry(PLANT.leafRadius, 16, 12), LEAF_MATERIAL);
  leaves.position.set(spot.x, PLANT.potHeight + PLANT.leafRadius * 0.8, spot.z);
  plant.add(leaves);
  return plant;
}

/** Builds the lounge: a soft rug, beanbags along its back and ends, plants in the back corners. */
function createLounge(rect: FloorRect): Group {
  const lounge = new Group();
  const width = rect.maxX - rect.minX - 2 * RUG.inset;
  const depth = rect.maxZ - rect.minZ - 2 * RUG.inset;
  const rug = new RoundedBoxGeometry(width, RUG.height, depth, ROUND_SEGMENTS, RUG.height / 2);
  lounge.add(createBlock(rug, RUG_MATERIAL, findMiddle(rect), 0));
  BEANBAG_SPOTS.forEach(([shareX = 0, shareZ = 0], index) => {
    const beanbag = new Mesh(new SphereGeometry(BEANBAG.radius, 20, 14), pickPastel(index));
    beanbag.scale.y = BEANBAG.squash;
    beanbag.position.set(
      rect.minX + RUG.inset + shareX * width,
      BEANBAG.radius * BEANBAG.squash,
      rect.minZ + RUG.inset + shareZ * depth,
    );
    lounge.add(beanbag);
  });
  lounge.add(createPlant({ x: rect.minX + PLANT.inset, z: rect.minZ + PLANT.inset }));
  lounge.add(createPlant({ x: rect.maxX - PLANT.inset, z: rect.minZ + PLANT.inset }));
  return lounge;
}

/** Builds the snack bar: a wooden counter with a light top, cups and snack bags on it. */
function createSnackBar(rect: FloorRect): Group {
  const bar = new Group();
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const middle = findMiddle(rect);
  const bodyHeight = COUNTER_HEIGHT - COUNTER.topHeight;
  const body = new RoundedBoxGeometry(width, bodyHeight, depth, ROUND_SEGMENTS, COUNTER.corner);
  bar.add(createBlock(body, COUNTER_MATERIAL, middle, 0));
  const top = new RoundedBoxGeometry(
    width + 2 * COUNTER.overhang,
    COUNTER.topHeight,
    depth + 2 * COUNTER.overhang,
    ROUND_SEGMENTS,
    COUNTER.topHeight / 2 - 0.005,
  );
  bar.add(createBlock(top, COUNTER_TOP_MATERIAL, middle, bodyHeight));
  const count = Math.max(2, Math.floor(width * SNACKS_PER_UNIT));
  for (let index = 0; index < count; index++) {
    const spot = { x: rect.minX + ((index + 0.5) / count) * width, z: middle.z };
    const snack =
      index % 2 === 0
        ? new CylinderGeometry(CUP.radius, CUP.radius * 0.8, CUP.height, 12)
        : new RoundedBoxGeometry(BAG.width, BAG.height, BAG.depth, 1, 0.03);
    bar.add(createBlock(snack, pickPastel(index), spot, COUNTER_HEIGHT));
  }
  bar.add(createZoneShadow(rect));
  return bar;
}

/** Builds the stage, lounges and snack bars of the room. */
export function createVenue(areas: StageArea[]): Group {
  const venue = new Group();
  for (const area of areas) {
    const rect = toFloorRect(area);
    if (area.kind === "stage") venue.add(createStage(rect));
    if (area.kind === "lounge") venue.add(createLounge(rect));
    if (area.kind === "snackbar") venue.add(createSnackBar(rect));
  }
  venue.traverse((object) => {
    if (object instanceof Mesh && SHARED_MATERIALS.has(object.material as Material)) {
      object.renderOrder = PROP_ORDER;
    }
  });
  return venue;
}

/** Lets the beamer screens play on. */
export function updateVenue(time: number): void {
  const timeUniform = SCREEN_MATERIAL.uniforms.uTime;
  if (timeUniform) timeUniform.value = time;
}

/** Frees the geometries and shadows of the venue. The shared materials stay. */
export function disposeVenue(venue: Group): void {
  venue.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (SHARED_MATERIALS.has(object.material as Material)) {
      object.geometry.dispose();
      return;
    }
    disposeShadow(object);
  });
}
