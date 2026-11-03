/**
 * The floor of the hall: a large plane with light hexagon tiles that fades into the background.
 *
 * @module
 */

import { JELLY_COLORS } from "@jelly/scene/colors";
import { Color, Mesh, PlaneGeometry, ShaderMaterial } from "three";

import fragmentShader from "./shaders/floor.frag.glsl?raw";
import vertexShader from "./shaders/floor.vert.glsl?raw";
import { ROOM_DEPTH, ROOM_WIDTH } from "./world.ts";

/** Color behind the floor. The edge of the floor fades into it. */
export const BACKGROUND_COLOR = "#eef4fa";
const TILE_COLOR = "#fbfcfd";
const GROUT_COLOR = "#dfe6ee";
/** Large enough that its edge is never on screen. */
const FLOOR_SIZE = 160;
/** Edge to edge width of a tile in jelly units, and how thick the grout looks. */
const TILE_SIZE = 1.6;
const GROUT_WIDTH = 0.035;
/** Share of tiles with a faint jelly color. */
const TINT_SHARE = 0.07;

/** Creates the floor. It lies flat at height 0 and draws before everything else. */
export function createFloor(): Mesh {
  const material = new ShaderMaterial({
    defines: {
      TILE_SIZE: TILE_SIZE.toFixed(3),
      GROUT: GROUT_WIDTH.toFixed(3),
      TINT_SHARE: TINT_SHARE.toFixed(3),
      ROOM_WIDTH: ROOM_WIDTH.toFixed(1),
      ROOM_DEPTH: ROOM_DEPTH.toFixed(1),
    },
    uniforms: {
      uTile: { value: new Color(TILE_COLOR) },
      uGrout: { value: new Color(GROUT_COLOR) },
      uBackground: { value: new Color(BACKGROUND_COLOR) },
      uTints: { value: Object.values(JELLY_COLORS).map((palette) => new Color(palette.glow)) },
    },
    vertexShader,
    fragmentShader,
  });
  const floor = new Mesh(new PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE), material);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = 0;
  return floor;
}
