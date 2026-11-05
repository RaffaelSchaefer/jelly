/**
 * Building blocks of the venue: materials that live for the whole page, the clock of the moving
 * props and helpers that place meshes. The stage, the lounge and the snack bar are built from them.
 *
 * @module
 */

import { JELLY_COLORS } from "@jelly/scene/colors";
import {
  BufferGeometry,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { FloorPoint, FloorRect, ScenePoint } from "./world.ts";

import ledFragmentShader from "./shaders/led.frag.glsl?raw";
import propVertexShader from "./shaders/prop.vert.glsl?raw";
import { createShadow } from "./shadow.ts";

/** Props are drawn after the shadows, so no shadow lies on top of them. */
export const PROP_ORDER = 3;
/** Flat things on the floor are drawn before the shadows, so jellies cast shadows onto them. */
export const FLAT_ORDER = 1;
const ROUND_SEGMENTS = 2;
const USUAL_ROUNDING = 0.04;
/** Rounding stays this far below half the thinnest side, or the box gets dents. */
const ROUNDING_MARGIN = 0.005;
const SHININESS = 60;
const ZONE_SHADOW = { radius: 0.2, softness: 0.4, strength: 0.18 };
const NO_SCALE = new Vector3(1, 1, 1);

/** Faces such as signs and screens sit this far in front of their board, so the two never flicker. */
export const FACE_LIFT = 0.003;

/** The glow colors of the jellies, the accent colors of the whole venue. */
export const GLOW_COLORS = Object.values(JELLY_COLORS).map((palette) => palette.glow);

/** Seconds since the page opened. Every moving prop reads this one uniform. */
export const VENUE_TIME = { value: 0 };

/** Materials shared by all props. Every other material belongs to a single mesh. */
const keptMaterials = new Set<Material>();

/** Keeps a material for the whole page, so freeing the venue frees only geometries using it. */
export function keepMaterial<Type extends Material>(material: Type): Type {
  keptMaterials.add(material);
  return material;
}

/** Says whether a material lives for the whole page. */
export function isKeptMaterial(material: Material): boolean {
  return keptMaterials.has(material);
}

/** Creates a matte surface, lit like the desks. */
export function createMatte(color: string): MeshLambertMaterial {
  return keepMaterial(new MeshLambertMaterial({ color, toneMapped: false }));
}

/** Creates a shiny surface such as metal or glazed plastic. */
export function createShiny(color: string, specular: string): MeshPhongMaterial {
  return keepMaterial(
    new MeshPhongMaterial({ color, specular, shininess: SHININESS, toneMapped: false }),
  );
}

/** Creates a surface that glows by itself, untouched by the lights. */
export function createGlow(color: string): MeshBasicMaterial {
  return keepMaterial(new MeshBasicMaterial({ color, toneMapped: false }));
}

/** Polished metal, for lamp feet, handles and machine parts. */
export const CHROME_MATERIAL = createShiny("#c8d0de", "#ffffff");

/** LED strips: the glow colors flow along them, the same wave on every strip of the hall. */
export const LED_MATERIAL = keepMaterial(
  new ShaderMaterial({
    uniforms: {
      uTime: VENUE_TIME,
      uColors: { value: GLOW_COLORS.map((color) => new Color(color)) },
    },
    vertexShader: propVertexShader,
    fragmentShader: ledFragmentShader,
    toneMapped: false,
  }),
);

/** Returns the middle of a rectangle. */
export function findMiddle(rect: FloorRect): FloorPoint {
  return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
}

/** Creates a soft shadow under a rectangle, on a floor of the given height. */
export function createZoneShadow(rect: FloorRect, floor = 0): Mesh {
  const shadow = createShadow({
    halfWidth: (rect.maxX - rect.minX) / 2,
    halfDepth: (rect.maxZ - rect.minZ) / 2,
    ...ZONE_SHADOW,
  });
  const middle = findMiddle(rect);
  shadow.position.set(middle.x, shadow.position.y + floor, middle.z);
  return shadow;
}

/** Places a mesh with its middle at a point of the room. */
export function placeMesh(geometry: BufferGeometry, material: Material, point: ScenePoint): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(point.x, point.y, point.z);
  mesh.renderOrder = PROP_ORDER;
  return mesh;
}

/** Marks a mesh as lying flat on the floor, so shadows fall onto it. */
export function layFlat(mesh: Mesh): Mesh {
  mesh.renderOrder = FLAT_ORDER;
  return mesh;
}

/** Size of a rounded box in jelly units. */
export interface BoxSize {
  width: number;
  height: number;
  depth: number;
  rounding?: number;
}

/** Creates a rounded box standing on `bottom`, centered over `spot`. */
export function createBox(
  size: BoxSize,
  material: Material,
  spot: FloorPoint,
  bottom: number,
): Mesh {
  const thinnest = Math.min(size.width, size.height, size.depth);
  const rounding = Math.min(size.rounding ?? USUAL_ROUNDING, thinnest / 2 - ROUNDING_MARGIN);
  const geometry = new RoundedBoxGeometry(
    size.width,
    size.height,
    size.depth,
    ROUND_SEGMENTS,
    Math.max(0, rounding),
  );
  return placeMesh(geometry, material, { x: spot.x, y: bottom + size.height / 2, z: spot.z });
}

/**
 * A small piece of a merged prop: its shape, where its middle sits and how it is turned. The turn
 * around y comes last, so a part laid flat with x still turns with its zone on the floor.
 */
export interface PropPart {
  geometry: BufferGeometry;
  at: ScenePoint;
  turn?: ScenePoint;
}

/** Merges many small parts of one material into one mesh, so they cost a single draw call. */
export function mergeParts(parts: PropPart[], material: Material): Mesh {
  const placed = parts.map(({ geometry, at, turn }) => {
    const rotation = new Quaternion().setFromEuler(new Euler(turn?.x, turn?.y, turn?.z, "YXZ"));
    const matrix = new Matrix4().compose(new Vector3(at.x, at.y, at.z), rotation, NO_SCALE);
    return geometry.applyMatrix4(matrix);
  });
  const merged = placed.length > 0 ? mergeGeometries(placed) : null;
  if (placed.length > 0 && !merged)
    console.warn("props: parts with different attributes not merged");
  for (const geometry of placed) geometry.dispose();
  return placeMesh(merged ?? new BufferGeometry(), material, { x: 0, y: 0, z: 0 });
}

/** Frees the geometries and own materials of a group of props. Materials kept for the page stay. */
export function disposeProps(props: Object3D): void {
  props.traverse((object) => {
    if (object instanceof InstancedMesh) object.dispose();
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const material = object.material as Material;
    if (!isKeptMaterial(material)) material.dispose();
  });
}
