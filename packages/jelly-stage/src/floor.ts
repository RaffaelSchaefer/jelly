/**
 * The floor of the hall: a large plane with light hexagon tiles that fades into the background.
 *
 * @module
 */

import { JELLY_COLORS } from "@jelly/scene/colors";
import { Color, Mesh, PlaneGeometry, ShaderMaterial, type Object3D } from "three";

import type { RoomSize } from "./world.ts";

import fragmentShader from "./shaders/floor.frag.glsl?raw";
import vertexShader from "./shaders/floor.vert.glsl?raw";

/** Color behind the floor. The edge of the floor fades into it. */
export const BACKGROUND_COLOR = "#eef4fa";
const TILE_COLOR = "#fbfcfd";
const GROUT_COLOR = "#dfe6ee";
/** The floor is this many times as wide and deep as the room, so its edge is never on screen. */
const FLOOR_REACH = 4;
/** Edge to edge width of a tile in jelly units, and how thick the grout looks. */
const TILE_SIZE = 1.6;
const GROUT_WIDTH = 0.035;
/** Share of tiles with a faint jelly color. */
const TINT_SHARE = 0.07;

/**
 * Creates the floor. It lies flat at height 0 and draws before everything else. It is a square of
 * one unit until {@link fitFloor} stretches it over the room.
 */
export function createFloor(): Mesh {
  const material = new ShaderMaterial({
    defines: {
      TILE_SIZE: TILE_SIZE.toFixed(3),
      GROUT: GROUT_WIDTH.toFixed(3),
      TINT_SHARE: TINT_SHARE.toFixed(3),
      FLOOR_REACH: FLOOR_REACH.toFixed(1),
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
  const floor = new Mesh(new PlaneGeometry(1, 1), material);
  floor.rotation.x = -Math.PI / 2;
  floor.renderOrder = 0;
  return floor;
}

/**
 * Stretches the floor over a room. The tiles keep their size, because the shader lays them out in
 * jelly units, and the floor fades out around the room.
 */
export function fitFloor(floor: Object3D, room: RoomSize): void {
  floor.scale.set(FLOOR_REACH * room.width, FLOOR_REACH * room.depth, 1);
}
