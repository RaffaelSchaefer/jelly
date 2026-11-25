/**
 * A beamer screen of the stage: a frame on two legs around a picture that glows by itself. Between
 * broadcasts the picture shows the test card of the channel, and the equalizer of the venue until
 * the card is decoded. While the Jelly-News are on air it shows their broadcast instead
 * (`newsScreens.ts`). All screens share one material and its uniforms.
 *
 * @module
 */

import {
  Color,
  CylinderGeometry,
  Group,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  type Texture,
} from "three";

import type { FloorRect } from "./world.ts";

import {
  createBox,
  createMatte,
  FACE_LIFT,
  findMiddle,
  GLOW_COLORS,
  keepMaterial,
  placeMesh,
  VENUE_TIME,
} from "./props.ts";
import screenFragmentShader from "./shaders/screen.frag.glsl?raw";
import screenVertexShader from "./shaders/screen.vert.glsl?raw";
import { SCREEN_WIDTH } from "./zones.ts";

/** The picture hangs this high over the floor of the screen and is this tall. */
const SCREEN_BOTTOM = 0.55;
const SCREEN_HEIGHT = 2.3;
/** Width over height of the picture, for whatever is painted for it. */
export const SCREEN_ASPECT = SCREEN_WIDTH / SCREEN_HEIGHT;
const FRAME_BORDER = 0.12;
const FRAME_DEPTH = 0.12;
const LEG = { radius: 0.05, inset: 0.3, segments: 8 };

const FRAME_MATERIAL = createMatte("#2d3446");

/**
 * What the screens show: the test card once `uTestCardReady` is 1, cut to their shape by
 * `uTestCardShare`, with a slow scan line while `uLively` is 1, and the broadcast `uOnAir` of the
 * way from 0 to 1 over it. Until the card is decoded they play their equalizer.
 */
export const BROADCAST = {
  uBroadcast: { value: null as Texture | null },
  uOnAir: { value: 0 },
  uTestCard: { value: null as Texture | null },
  uTestCardShare: { value: new Vector2(1, 1) },
  uTestCardReady: { value: 0 },
  uLively: { value: 0 },
};

const SCREEN_MATERIAL = keepMaterial(
  new ShaderMaterial({
    defines: { SCREEN_ASPECT: SCREEN_ASPECT.toFixed(3) },
    uniforms: {
      uTime: VENUE_TIME,
      uSeed: { value: 0 },
      uBase: { value: new Color("#1b2242") },
      uColors: { value: GLOW_COLORS.map((color) => new Color(color)) },
      ...BROADCAST,
    },
    vertexShader: screenVertexShader,
    fragmentShader: screenFragmentShader,
    toneMapped: false,
  }),
);

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
    const leg = new CylinderGeometry(LEG.radius, LEG.radius, legHeight, LEG.segments);
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
