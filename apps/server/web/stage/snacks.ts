/**
 * What stands on the snack bar: a slush machine with two turning flavors, a popcorn machine, a
 * stack of pizza boxes with an open pizza, donuts on a stand and cups with straws.
 *
 * @module
 */

import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  type Object3D,
} from "three";

import type { FloorPoint } from "./world.ts";

import {
  createBox,
  createMatte,
  createShiny,
  FACE_LIFT,
  GLOW_COLORS,
  keepMaterial,
  mergeParts,
  placeMesh,
  VENUE_TIME,
  type PropPart,
} from "./props.ts";
import propVertexShader from "./shaders/prop.vert.glsl?raw";
import slushFragmentShader from "./shaders/slush.frag.glsl?raw";
import { createSignMaterial } from "./signs.ts";

/** A snack on the counter: how much of the counter it takes and how it is built. */
export interface Snack {
  width: number;
  build: (spot: FloorPoint, bottom: number) => Object3D;
}

const FULL_TURN = 2 * Math.PI;
const SLUSH = {
  width: 0.62,
  base: 0.24,
  depth: 0.46,
  tank: 0.135,
  tankHeight: 0.44,
  spread: 0.155,
};
const TAP = { width: 0.06, height: 0.09, depth: 0.06, reach: 0.02, lift: 0.08 };
/** Slush fills the tank up to this far below its top. */
const SLUSH_HEADROOM = 0.08;
const POPCORN = {
  width: 0.58,
  depth: 0.46,
  cabinet: 0.26,
  glass: 0.46,
  roof: 0.1,
  trim: 0.035,
  overhang: 0.06,
  trimOverhang: 0.1,
  post: 0.04,
};
/** The kettle hangs under the roof, where the corn pops. */
const KETTLE = { top: 0.1, bottom: 0.075, height: 0.1, hang: 0.12 };
const KERNELS = { count: 40, radius: 0.05, heap: 0.17 };
const GOLDEN_ANGLE = 2.399963;
const PIZZA = {
  size: 0.56,
  box: 0.06,
  lid: 0.02,
  open: 1.75,
  radius: 0.21,
  crust: 0.03,
  thickness: 0.025,
  rounding: 0.01,
  /** The middle box sits a little turned, and the stack needs room for it on the counter. */
  messyTurn: 0.12,
  turnRoom: 0.06,
};
/** One slice is already gone. */
const PIZZA_LEFT = 7 / 8;
/** The crust shows as a rim: a disc a little wider than the cheese and a little lower. */
const CRUST = { height: 1.4, middle: 0.7 };
/** Pepperoni lie in two rings, the inner one at this share of the reach. */
const PEPPERONI = { count: 7, radius: 0.04, reach: 0.14, inner: 0.55, thickness: 0.012 };
const STAND = {
  plate: 0.25,
  plateHeight: 0.03,
  rim: 0.02,
  stem: 0.16,
  stemTop: 0.035,
  stemBottom: 0.05,
  foot: 0.13,
  footHeight: 0.02,
};
/** Three donuts lie around the plate, turned this far apart, and a fourth on top of them. */
const DONUT = { radius: 0.075, tube: 0.035, ring: 0.12, spacing: 2.1, start: 0.4 };
/** Icing is a thinner, flatter ring on top of the dough. */
const ICING = { tube: 0.8, lift: 0.45, flatness: 0.6 };
const CUP = {
  top: 0.075,
  bottom: 0.058,
  height: 0.22,
  lid: 0.004,
  lidHeight: 0.02,
  straw: 0.012,
  strawHeight: 0.2,
  strawShift: 0.02,
  strawDip: 0.04,
  lean: 0.25,
};
const CUPS_WIDTH = 0.36;
/** Cups stand in a little group: x and z from the middle. */
const CUP_SPOTS: [number, number][] = [
  [-0.11, 0.05],
  [0.11, -0.03],
  [0.01, 0.13],
];

const WHITE_MATERIAL = createShiny("#f6f7fb", "#ffffff");
const DARK_MATERIAL = createMatte("#3a4052");
const RED_MATERIAL = createMatte("#e5534b");
const YELLOW_MATERIAL = createMatte("#ffd45c");
const KERNEL_MATERIALS = [createMatte("#fff6d8"), createMatte("#ffe39a")];
const CHROME_MATERIAL = createShiny("#c8d0de", "#ffffff");
const CARDBOARD_MATERIAL = createMatte("#efdcb5");
const CHEESE_MATERIAL = createMatte("#f6c453");
const CRUST_MATERIAL = createMatte("#dc9a4c");
const PEPPERONI_MATERIAL = createMatte("#c8423a");
const DOUGH_MATERIAL = createMatte("#d9a066");
const ICING_MATERIALS = [createMatte("#f59ac9"), createMatte("#8ef0dd"), createMatte("#7a4a2e")];
const CUP_MATERIALS = GLOW_COLORS.map((color) => createMatte(color));
const SLUSH_MATERIALS = [GLOW_COLORS[0], "#ff6fae"].map((color) =>
  keepMaterial(
    new ShaderMaterial({
      defines: { FILL_TOP: (SLUSH.tankHeight / 2 - SLUSH_HEADROOM).toFixed(3) },
      uniforms: { uTime: VENUE_TIME, uSlush: { value: new Color(color) } },
      vertexShader: propVertexShader,
      fragmentShader: slushFragmentShader,
      toneMapped: false,
    }),
  ),
);
const POPCORN_SIGN = { width: POPCORN.width, height: POPCORN.roof * 0.9 };
const POPCORN_SIGN_MATERIAL = createSignMaterial({
  text: "POPCORN",
  ...POPCORN_SIGN,
  board: "#e5534b",
  ink: "#fff5d6",
  weight: 900,
});

/** Builds the slush machine: a white base with two tanks of turning slush. */
function createSlushMachine(spot: FloorPoint, bottom: number): Group {
  const machine = new Group();
  const base = { width: SLUSH.width, height: SLUSH.base, depth: SLUSH.depth };
  machine.add(createBox(base, WHITE_MATERIAL, spot, bottom));
  SLUSH_MATERIALS.forEach((material, index) => {
    const x = spot.x + (index === 0 ? -1 : 1) * SLUSH.spread;
    const tankBottom = bottom + SLUSH.base;
    const tank = new CylinderGeometry(SLUSH.tank, SLUSH.tank * 0.92, SLUSH.tankHeight, 24);
    const lid = new SphereGeometry(SLUSH.tank * 1.03, 20, 8, 0, FULL_TURN, 0, Math.PI / 2);
    const tap = { width: TAP.width, height: TAP.height, depth: TAP.depth };
    machine.add(
      placeMesh(tank, material, { x, y: tankBottom + SLUSH.tankHeight / 2, z: spot.z }),
      placeMesh(lid, WHITE_MATERIAL, { x, y: tankBottom + SLUSH.tankHeight, z: spot.z }),
      createBox(
        tap,
        DARK_MATERIAL,
        { x, z: spot.z + SLUSH.depth / 2 + TAP.reach },
        bottom + TAP.lift,
      ),
    );
  });
  return machine;
}

/** Returns popcorn kernels heaped in a mound, highest in the middle. */
function listKernels(spot: FloorPoint, floor: number): PropPart[] {
  const reach = POPCORN.width / 2 - POPCORN.post - KERNELS.radius;
  return Array.from({ length: KERNELS.count }, (_, index) => {
    const share = Math.sqrt((index + 0.5) / KERNELS.count);
    const angle = index * GOLDEN_ANGLE;
    return {
      geometry: new SphereGeometry(KERNELS.radius * (0.85 + (0.3 * ((index * 7) % 5)) / 5), 8, 6),
      at: {
        x: spot.x + Math.cos(angle) * share * reach,
        y: floor + KERNELS.radius + (1 - share) * KERNELS.heap,
        z: spot.z + Math.sin(angle) * share * (POPCORN.depth / 2 - KERNELS.radius),
      },
    };
  });
}

/** Builds the popcorn machine: a red cabinet, an open case full of popcorn and a roof sign. */
function createPopcornMachine(spot: FloorPoint, bottom: number): Group {
  const machine = new Group();
  const { width, depth } = POPCORN;
  const caseBottom = bottom + POPCORN.cabinet;
  const roofBottom = caseBottom + POPCORN.glass;
  const posts = [-1, 1].flatMap((sideX) =>
    [-1, 1].map((sideZ) => ({
      geometry: new BoxGeometry(POPCORN.post, POPCORN.glass, POPCORN.post),
      at: {
        x: spot.x + sideX * (width / 2 - POPCORN.post / 2),
        y: caseBottom + POPCORN.glass / 2,
        z: spot.z + sideZ * (depth / 2 - POPCORN.post / 2),
      },
    })),
  );
  const kernels = listKernels(spot, caseBottom);
  const kettle = new CylinderGeometry(KETTLE.top, KETTLE.bottom, KETTLE.height, 16);
  const roof = {
    width: width + POPCORN.overhang,
    height: POPCORN.roof,
    depth: depth + POPCORN.overhang,
  };
  // A yellow band runs around the bottom of the roof.
  const trim = {
    width: width + POPCORN.trimOverhang,
    height: POPCORN.trim,
    depth: depth + POPCORN.trimOverhang,
  };
  const sign = placeMesh(
    new PlaneGeometry(POPCORN_SIGN.width, POPCORN_SIGN.height),
    POPCORN_SIGN_MATERIAL,
    {
      x: spot.x,
      y: roofBottom + POPCORN.roof / 2,
      z: spot.z + roof.depth / 2 + FACE_LIFT,
    },
  );
  machine.add(
    createBox({ width, height: POPCORN.cabinet, depth }, RED_MATERIAL, spot, bottom),
    mergeParts(posts, RED_MATERIAL),
    mergeParts(
      kernels.filter((_, index) => index % 3 !== 0),
      KERNEL_MATERIALS[0] ?? RED_MATERIAL,
    ),
    mergeParts(
      kernels.filter((_, index) => index % 3 === 0),
      KERNEL_MATERIALS[1] ?? RED_MATERIAL,
    ),
    placeMesh(kettle, CHROME_MATERIAL, { x: spot.x, y: roofBottom - KETTLE.hang, z: spot.z }),
    createBox(roof, RED_MATERIAL, spot, roofBottom),
    createBox(trim, YELLOW_MATERIAL, spot, roofBottom - POPCORN.trim / 2),
    sign,
  );
  return machine;
}

/** Builds two closed pizza boxes and an open one on top, with a pizza that misses a slice. */
function createPizzaStack(spot: FloorPoint, bottom: number): Group {
  const stack = new Group();
  const box = { width: PIZZA.size, height: PIZZA.box, depth: PIZZA.size, rounding: PIZZA.rounding };
  const tilted = createBox(box, CARDBOARD_MATERIAL, spot, bottom + PIZZA.box);
  tilted.rotation.y = PIZZA.messyTurn;
  const trayTop = bottom + 3 * PIZZA.box;
  const lid = placeMesh(new BoxGeometry(PIZZA.size, PIZZA.lid, PIZZA.size), CARDBOARD_MATERIAL, {
    x: spot.x,
    y: trayTop + (PIZZA.size / 2) * Math.sin(PIZZA.open),
    z: spot.z - PIZZA.size / 2 + (PIZZA.size / 2) * Math.cos(PIZZA.open),
  });
  lid.rotation.x = -PIZZA.open;
  const slice = (radius: number, height: number) =>
    new CylinderGeometry(radius, radius, height, 32, 1, false, 0, FULL_TURN * PIZZA_LEFT);
  // The crust is a slightly larger disc under the cheese, so it shows as a rim around it.
  const crust = slice(PIZZA.radius + PIZZA.crust, PIZZA.thickness * CRUST.height);
  const pepperoni = Array.from({ length: PEPPERONI.count }, (_, index) => {
    const angle = ((index + 0.5) / PEPPERONI.count) * FULL_TURN * PIZZA_LEFT;
    const reach = PEPPERONI.reach * (index % 2 === 0 ? 1 : PEPPERONI.inner);
    return {
      geometry: new CylinderGeometry(PEPPERONI.radius, PEPPERONI.radius, PEPPERONI.thickness, 14),
      at: {
        x: spot.x + Math.sin(angle) * reach,
        y: trayTop + 1.5 * PIZZA.thickness + PEPPERONI.thickness / 2,
        z: spot.z + Math.cos(angle) * reach,
      },
    };
  });
  stack.add(
    createBox(box, CARDBOARD_MATERIAL, spot, bottom),
    tilted,
    createBox(box, CARDBOARD_MATERIAL, spot, bottom + 2 * PIZZA.box),
    lid,
    placeMesh(crust, CRUST_MATERIAL, {
      x: spot.x,
      y: trayTop + PIZZA.thickness * CRUST.middle,
      z: spot.z,
    }),
    placeMesh(slice(PIZZA.radius, PIZZA.thickness), CHEESE_MATERIAL, {
      x: spot.x,
      y: trayTop + PIZZA.thickness,
      z: spot.z,
    }),
    mergeParts(pepperoni, PEPPERONI_MATERIAL),
  );
  return stack;
}

/** Builds a cake stand with four donuts, one on top of the others. */
function createDonutStand(spot: FloorPoint, bottom: number): Group {
  const stand = new Group();
  const plateTop = bottom + STAND.stem + STAND.plateHeight;
  const foot = new CylinderGeometry(STAND.foot, STAND.foot + STAND.rim / 2, STAND.footHeight, 24);
  const stem = new CylinderGeometry(STAND.stemTop, STAND.stemBottom, STAND.stem, 12);
  const plate = new CylinderGeometry(STAND.plate, STAND.plate - STAND.rim, STAND.plateHeight, 32);
  stand.add(
    placeMesh(foot, WHITE_MATERIAL, { ...spot, y: bottom + STAND.footHeight / 2 }),
    placeMesh(stem, WHITE_MATERIAL, { ...spot, y: bottom + STAND.stem / 2 }),
    placeMesh(plate, WHITE_MATERIAL, { ...spot, y: plateTop - STAND.plateHeight / 2 }),
  );
  const spots = [0, 1, 2].map((index) => ({
    x: spot.x + Math.cos(index * DONUT.spacing + DONUT.start) * DONUT.ring,
    y: plateTop + DONUT.tube,
    z: spot.z + Math.sin(index * DONUT.spacing + DONUT.start) * DONUT.ring,
  }));
  spots.push({ x: spot.x, y: plateTop + 3 * DONUT.tube, z: spot.z });
  spots.forEach((point, index) => {
    const dough = new TorusGeometry(DONUT.radius, DONUT.tube, 10, 22);
    const icing = new TorusGeometry(DONUT.radius, DONUT.tube * ICING.tube, 10, 22);
    const icingMaterial = ICING_MATERIALS[index % ICING_MATERIALS.length] ?? DOUGH_MATERIAL;
    const icingPoint = { ...point, y: point.y + DONUT.tube * ICING.lift };
    const meshes = [
      placeMesh(dough, DOUGH_MATERIAL, point),
      placeMesh(icing, icingMaterial, icingPoint),
    ];
    // A torus stands upright, so both rings are laid flat.
    for (const mesh of meshes) mesh.rotation.x = Math.PI / 2;
    meshes[1]?.scale.setZ(ICING.flatness);
    stand.add(...meshes);
  });
  return stand;
}

/** Builds three cups with lids and straws. */
function createCups(spot: FloorPoint, bottom: number): Group {
  const cups = new Group();
  CUP_SPOTS.forEach(([offsetX, offsetZ], index) => {
    const x = spot.x + offsetX;
    const z = spot.z + offsetZ;
    const material = CUP_MATERIALS[index % CUP_MATERIALS.length] ?? WHITE_MATERIAL;
    const cup = new CylinderGeometry(CUP.top, CUP.bottom, CUP.height, 16);
    const lid = new CylinderGeometry(CUP.top + CUP.lid, CUP.top + CUP.lid, CUP.lidHeight, 16);
    const straw = placeMesh(
      new CylinderGeometry(CUP.straw, CUP.straw, CUP.strawHeight, 8),
      material,
      {
        x: x + CUP.strawShift,
        y: bottom + CUP.height + CUP.strawHeight / 2 - CUP.strawDip,
        z,
      },
    );
    straw.rotation.z = -CUP.lean;
    cups.add(
      placeMesh(cup, material, { x, y: bottom + CUP.height / 2, z }),
      placeMesh(lid, WHITE_MATERIAL, { x, y: bottom + CUP.height, z }),
      straw,
    );
  });
  return cups;
}

/** Lists the snacks from left to right. The counter drops the last ones when it is short. */
export function listSnacks(): Snack[] {
  return [
    { width: SLUSH.width, build: createSlushMachine },
    { width: POPCORN.width + POPCORN.trimOverhang, build: createPopcornMachine },
    { width: PIZZA.size + PIZZA.turnRoom, build: createPizzaStack },
    { width: 2 * STAND.plate, build: createDonutStand },
    { width: CUPS_WIDTH, build: createCups },
  ];
}
