/**
 * The stage at the back of the hall: a board floor with wandering spotlights, an LED strip and
 * steps at the front, two beamer screens, speaker stacks with lights in the back corners and the
 * tournament trophy between the screens. Every part stands on the floor of its own group, so a map
 * can place it alone or let the whole set put it on the platform.
 *
 * @module
 */

import {
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";

import type { FloorPoint, FloorRect } from "./world.ts";

import { createBulbs } from "./bulbs.ts";
import {
  createBox,
  createGlow,
  createMatte,
  createShiny,
  createZoneShadow,
  FACE_LIFT,
  findMiddle,
  fitIntoZone,
  GLOW_COLORS,
  keepMaterial,
  layFlat,
  LED_MATERIAL,
  placeMesh,
  VENUE_TIME,
} from "./props.ts";
import propVertexShader from "./shaders/prop.vert.glsl?raw";
import screenFragmentShader from "./shaders/screen.frag.glsl?raw";
import screenVertexShader from "./shaders/screen.vert.glsl?raw";
import speakerFragmentShader from "./shaders/speaker.frag.glsl?raw";
import speakerVertexShader from "./shaders/speaker.vert.glsl?raw";
import floorFragmentShader from "./shaders/stageFloor.frag.glsl?raw";
import {
  findPedestalRect,
  listScreenRects,
  listSpeakerRects,
  PEDESTAL,
  SCREEN_WIDTH,
  SPEAKER,
  STAGE_HEIGHT,
  toLocalRect,
} from "./zones.ts";

const STAGE_CORNER = 0.08;
/** The board floor lies just above the platform, so the two never fight over a pixel. */
const FLOOR_LIFT = 0.003;
const LED_STRIP = { height: 0.07, depth: 0.08 };
const STEP = { width: 2.4, depth: 0.32, count: 2 };
/** The screen hangs this high over the stage floor and is this tall. */
const SCREEN_BOTTOM = 0.55;
const SCREEN_HEIGHT = 2.3;
const FRAME_BORDER = 0.12;
const FRAME_DEPTH = 0.12;
const LEG = { radius: 0.05, inset: 0.3 };
const SOCKET = { width: 0.32, height: 0.26, depth: 0.2, inset: 0.35, rounding: 0.03 };
/** A cable ends this far behind the front of its speaker. */
const CABLE = { radius: 0.025, swing: 0.25, segments: 24, sides: 6, endInset: 0.15 };
/** The lower box of a speaker stack carries the bass, the upper one is a little smaller. */
const SUB_HEIGHT = 0.95;
const TOP_BOX = { share: 0.86, height: 0.62 };
const BEATS_PER_SECOND = 2;
/** Cone radii, and the heights of the mid and treble cones as shares of the upper box. */
const CONES = { bass: 0.34, mid: 0.17, midHeight: 0.34, treble: 0.08, trebleHeight: 0.79 };
/** Cones stand out of the box front by this much. */
const CONE_LIFT = 0.006;
/** A PAR can narrows to `back` of its radius, its lens covers `lens` of the radius. */
const PAR = { radius: 0.12, length: 0.3, tilt: 0.95, turn: 0.55, back: 0.8, lens: 0.85 };
/** The two PAR lights of a stack sit this share of its width left and right of the middle. */
const PAR_SPREAD = 0.22;
const PEDESTAL_HEIGHT = 0.62;
const TROPHY_PLATE = { height: 0.08, below: 0.14, overhang: 0.02 };
/** Outline of the trophy cup from foot to rim and back down inside, radius and height. */
const CUP_PROFILE: [number, number][] = [
  [0.001, 0],
  [0.22, 0],
  [0.22, 0.05],
  [0.08, 0.09],
  [0.05, 0.24],
  [0.08, 0.29],
  [0.05, 0.33],
  [0.13, 0.4],
  [0.28, 0.55],
  [0.32, 0.74],
  [0.34, 0.8],
  [0.3, 0.8],
  [0.25, 0.62],
  [0.001, 0.48],
];
/** The handles are half rings. */
const HANDLE = { radius: 0.14, tube: 0.035, height: 0.6, reach: 0.31, arc: Math.PI };
const GLINT = { radius: 0.035, spread: 0.45, height: 0.35, step: 0.25, front: 0.2 };
const GLINT_COLOR = "#ffffff";
/** Glints sit at these shares of the spread around the cup, every other one a step higher. */
const GLINT_SHARES = [-1, -0.4, 0.5, 1];
const SEGMENTS = { leg: 8, cone: 28, can: 16, lens: 20, cup: 32, handleTube: 10, handleRing: 20 };

const PLATFORM_MATERIAL = createMatte("#56658a");
const STEP_MATERIAL = createMatte("#6f7fa6");
const FRAME_MATERIAL = createMatte("#2d3446");
const SOCKET_MATERIAL = createMatte("#e98a3a");
const CABLE_MATERIAL = createMatte("#2b3140");
const SPEAKER_MATERIAL = createMatte("#353b4e");
const PAR_MATERIAL = createMatte("#262b38");
const PEDESTAL_MATERIAL = createMatte("#f3f5fb");
const GOLD_MATERIAL = createShiny("#f2c14e", "#fff1c2");
GOLD_MATERIAL.side = DoubleSide;
GOLD_MATERIAL.emissive = new Color("#4a3208");
const LENS_MATERIALS = GLOW_COLORS.map((color) => createGlow(color));
const SCREEN_MATERIAL = keepMaterial(
  new ShaderMaterial({
    defines: { SCREEN_ASPECT: (SCREEN_WIDTH / SCREEN_HEIGHT).toFixed(3) },
    uniforms: {
      uTime: VENUE_TIME,
      uSeed: { value: 0 },
      uBase: { value: new Color("#1b2242") },
      uColors: { value: GLOW_COLORS.map((color) => new Color(color)) },
    },
    vertexShader: screenVertexShader,
    fragmentShader: screenFragmentShader,
    toneMapped: false,
  }),
);
const CONE_MATERIAL = keepMaterial(
  new ShaderMaterial({
    defines: { BEATS_PER_SECOND: BEATS_PER_SECOND.toFixed(2) },
    uniforms: {
      uTime: VENUE_TIME,
      uCone: { value: new Color("#1f2330") },
      uSurround: { value: new Color("#4a5168") },
      uCap: { value: new Color("#5d6580") },
    },
    vertexShader: speakerVertexShader,
    fragmentShader: speakerFragmentShader,
    toneMapped: false,
  }),
);

/** Creates the board floor of one stage. It knows the stage size, so it belongs to that stage. */
function createFloorMaterial(width: number, depth: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: VENUE_TIME,
      uSize: { value: new Vector2(width, depth) },
      uBoard: { value: new Color("#5b6a92") },
      uJoint: { value: new Color("#47536f") },
      uSpots: { value: GLOW_COLORS.map((color) => new Color(color)) },
    },
    vertexShader: propVertexShader,
    fragmentShader: floorFragmentShader,
    toneMapped: false,
  });
}

/** Builds the platform: sides, board floor, LED strip along the front and steps up. */
function createPlatform(rect: FloorRect): Group {
  const platform = new Group();
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const middle = findMiddle(rect);
  const size = { width, height: STAGE_HEIGHT, depth, rounding: STAGE_CORNER };
  platform.add(layFlat(createBox(size, PLATFORM_MATERIAL, middle, 0)));
  const boards = new PlaneGeometry(width - 2 * STAGE_CORNER, depth - 2 * STAGE_CORNER);
  const floorPoint = { x: middle.x, y: STAGE_HEIGHT + FLOOR_LIFT, z: middle.z };
  const floor = layFlat(placeMesh(boards, createFloorMaterial(width, depth), floorPoint));
  floor.rotation.x = -Math.PI / 2;
  const strip = { width: width - 2 * STAGE_CORNER, ...LED_STRIP };
  const stripSpot = { x: middle.x, z: rect.maxZ - LED_STRIP.depth / 2 };
  platform.add(floor, createBox(strip, LED_MATERIAL, stripSpot, STAGE_HEIGHT - strip.height / 2));
  for (let index = 0; index < STEP.count; index++) {
    const height = (STAGE_HEIGHT * (index + 1)) / (STEP.count + 1);
    const stepDepth = STEP.depth * (STEP.count - index);
    const spot = { x: middle.x, z: rect.maxZ + stepDepth / 2 };
    platform.add(
      createBox({ width: STEP.width, height, depth: stepDepth }, STEP_MATERIAL, spot, 0),
    );
    const nose = { width: STEP.width, height: LED_STRIP.height / 2, depth: LED_STRIP.depth / 2 };
    const noseSpot = { x: middle.x, z: rect.maxZ + stepDepth - nose.depth / 2 };
    platform.add(createBox(nose, LED_MATERIAL, noseSpot, height - nose.height / 2));
  }
  return platform;
}

/** Builds a beamer screen in its frame, standing in the middle of its rectangle. */
export function createScreen(rect: FloorRect, seed: number): Group {
  const screen = new Group();
  const middle = findMiddle(rect);
  const frame = {
    width: SCREEN_WIDTH + 2 * FRAME_BORDER,
    height: SCREEN_HEIGHT + 2 * FRAME_BORDER,
    depth: FRAME_DEPTH,
    rounding: FRAME_DEPTH / 2,
  };
  screen.add(createBox(frame, FRAME_MATERIAL, middle, SCREEN_BOTTOM - FRAME_BORDER));
  const legHeight = SCREEN_BOTTOM - FRAME_BORDER;
  for (const side of [-1, 1]) {
    const leg = new CylinderGeometry(LEG.radius, LEG.radius, legHeight, SEGMENTS.leg);
    const x = middle.x + side * (SCREEN_WIDTH / 2 - LEG.inset);
    screen.add(placeMesh(leg, FRAME_MATERIAL, { x, y: legHeight / 2, z: middle.z }));
  }
  const picture = placeMesh(new PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), SCREEN_MATERIAL, {
    x: middle.x,
    y: SCREEN_BOTTOM + SCREEN_HEIGHT / 2,
    z: middle.z + FRAME_DEPTH / 2 + FACE_LIFT,
  });
  // One material for both screens: each sets its own seed right before it is drawn.
  picture.onBeforeRender = () => {
    const seedUniform = SCREEN_MATERIAL.uniforms.uSeed;
    if (seedUniform) seedUniform.value = seed;
    SCREEN_MATERIAL.uniformsNeedUpdate = true;
  };
  screen.add(picture);
  return screen;
}

/** Builds a speaker cone facing the hall. */
function createCone(radius: number, point: { x: number; y: number; z: number }): Mesh {
  return placeMesh(new CircleGeometry(radius, SEGMENTS.cone), CONE_MATERIAL, point);
}

/** Builds a PAR light, aimed up and at the hall, turned by `side` toward the middle of the stage. */
export function createParLight(
  spot: FloorPoint,
  bottom: number,
  side: number,
  color: number,
): Group {
  const light = new Group();
  const can = new CylinderGeometry(PAR.radius, PAR.radius * PAR.back, PAR.length, SEGMENTS.can);
  light.add(placeMesh(can, PAR_MATERIAL, { x: 0, y: 0, z: 0 }));
  const lensMaterial = LENS_MATERIALS[color % LENS_MATERIALS.length] ?? FRAME_MATERIAL;
  const lens = placeMesh(new CircleGeometry(PAR.radius * PAR.lens, SEGMENTS.lens), lensMaterial, {
    x: 0,
    y: PAR.length / 2 + FACE_LIFT,
    z: 0,
  });
  lens.rotation.x = -Math.PI / 2;
  light.add(lens);
  light.position.set(spot.x, bottom + PAR.radius, spot.z);
  light.rotation.set(PAR.tilt, 0, side * PAR.turn);
  return light;
}

/** Builds a speaker stack in a zone: a bass box with a smaller box on top and two lights. */
export function createSpeakerStack(rect: FloorRect, side: number): Group {
  return fitIntoZone(buildSpeakerStack(toLocalRect(SPEAKER), side), SPEAKER, rect);
}

/** Builds a speaker stack at its own size, filling `rect`. */
function buildSpeakerStack(rect: FloorRect, side: number): Group {
  const stack = new Group();
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const middle = findMiddle(rect);
  const top = {
    width: width * TOP_BOX.share,
    height: TOP_BOX.height,
    depth: depth * TOP_BOX.share,
  };
  const topBottom = SUB_HEIGHT;
  stack.add(
    createBox({ width, height: SUB_HEIGHT, depth }, SPEAKER_MATERIAL, middle, 0),
    createBox(top, SPEAKER_MATERIAL, middle, topBottom),
    createCone(CONES.bass, {
      x: middle.x,
      y: SUB_HEIGHT / 2,
      z: rect.maxZ + CONE_LIFT,
    }),
  );
  const topFront = middle.z + top.depth / 2 + CONE_LIFT;
  stack.add(
    createCone(CONES.mid, {
      x: middle.x,
      y: topBottom + top.height * CONES.midHeight,
      z: topFront,
    }),
    createCone(CONES.treble, {
      x: middle.x,
      y: topBottom + top.height * CONES.trebleHeight,
      z: topFront,
    }),
  );
  for (const [index, offset] of [-PAR_SPREAD, PAR_SPREAD].entries()) {
    const spot = { x: middle.x + offset * width, z: middle.z };
    stack.add(createParLight(spot, topBottom + top.height, side, index + (side > 0 ? 1 : 0)));
  }
  stack.add(createZoneShadow(rect));
  return stack;
}

/** Builds the pedestal of the tournament with the trophy on it, in a zone. */
export function createPedestal(rect: FloorRect): Group {
  return fitIntoZone(buildPedestal(toLocalRect(PEDESTAL)), PEDESTAL, rect);
}

/** Builds the pedestal at its own size, filling the shorter side of `rect`. */
function buildPedestal(rect: FloorRect): Group {
  const pedestal = new Group();
  const middle = findMiddle(rect);
  const size = Math.min(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
  const block = { width: size, height: PEDESTAL_HEIGHT, depth: size };
  const plateSize = size + TROPHY_PLATE.overhang;
  const plate = { width: plateSize, height: TROPHY_PLATE.height, depth: plateSize };
  pedestal.add(
    createBox(block, PEDESTAL_MATERIAL, middle, 0),
    createBox(plate, GOLD_MATERIAL, middle, PEDESTAL_HEIGHT - TROPHY_PLATE.below),
    createTrophy(middle, PEDESTAL_HEIGHT),
  );
  return pedestal;
}

/** Builds the trophy of the tournament standing on `base`, with a few glints around the cup. */
export function createTrophy(middle: FloorPoint, base: number): Group {
  const trophy = new Group();
  const outline = CUP_PROFILE.map(([radius, height]) => new Vector2(radius, height));
  trophy.add(
    placeMesh(new LatheGeometry(outline, SEGMENTS.cup), GOLD_MATERIAL, { ...middle, y: base }),
  );
  for (const side of [-1, 1]) {
    const handle = new TorusGeometry(
      HANDLE.radius,
      HANDLE.tube,
      SEGMENTS.handleTube,
      SEGMENTS.handleRing,
      HANDLE.arc,
    );
    const point = { x: middle.x + side * HANDLE.reach, y: base + HANDLE.height, z: middle.z };
    const mesh = placeMesh(handle, GOLD_MATERIAL, point);
    // The half ring opens toward the cup.
    mesh.rotation.z = -side * (Math.PI / 2);
    trophy.add(mesh);
  }
  const glints = GLINT_SHARES.map((share, index) => ({
    x: middle.x + share * GLINT.spread,
    y: base + GLINT.height + GLINT.step * (index % 2),
    z: middle.z + GLINT.front,
  }));
  trophy.add(
    createBulbs(glints, { radius: GLINT.radius, colors: [GLINT_COLOR], pattern: "twinkle" }),
  );
  return trophy;
}

/** Builds the 32A sockets in the back corners and, with speakers, their cables to the speakers. */
export function createSockets(rect: FloorRect, speakers: FloorRect[]): Mesh[] {
  const corners = [rect.minX + SOCKET.inset, rect.maxX - SOCKET.inset];
  return corners.flatMap((x, index) => {
    const spot = { x, z: rect.minZ + SOCKET.inset };
    const socket = createBox(SOCKET, SOCKET_MATERIAL, spot, 0);
    const speaker = speakers[index];
    if (!speaker) return [socket];
    const end = { x: index === 0 ? speaker.minX : speaker.maxX, z: speaker.maxZ - CABLE.endInset };
    return [socket, createCable({ x, z: spot.z + SOCKET.depth / 2 }, end)];
  });
}

/** Builds a cable lying on the floor between two points. */
function createCable(from: FloorPoint, to: FloorPoint): Mesh {
  const height = CABLE.radius;
  const bend = { x: (from.x + to.x) / 2, z: Math.max(from.z, to.z) + CABLE.swing };
  const curve = new CatmullRomCurve3(
    [from, bend, to].map((point) => new Vector3(point.x, height, point.z)),
  );
  const tube = new TubeGeometry(curve, CABLE.segments, CABLE.radius, CABLE.sides);
  return placeMesh(tube, CABLE_MATERIAL, { x: 0, y: 0, z: 0 });
}

/** Builds the platform alone, with its shadow on the floor. */
export function createStagePlatform(rect: FloorRect): Group {
  const platform = createPlatform(rect);
  platform.add(createZoneShadow(rect));
  return platform;
}

/** Builds a whole stage: the platform and everything on it, standing on its raised floor. */
export function createStage(rect: FloorRect): Group {
  const stage = createStagePlatform(rect);
  const top = new Group();
  top.position.y = STAGE_HEIGHT;
  const speakers = listSpeakerRects(rect);
  listScreenRects(rect).forEach((screenRect, index) => top.add(createScreen(screenRect, index)));
  speakers.forEach((speaker, index) => top.add(createSpeakerStack(speaker, index * 2 - 1)));
  top.add(createPedestal(findPedestalRect(rect)), ...createSockets(rect, speakers));
  stage.add(top);
  return stage;
}
