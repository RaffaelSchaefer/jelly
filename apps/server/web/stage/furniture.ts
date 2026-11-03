/**
 * Desks and cable ducts built from the areas of the room. Seats stay invisible: the jellies
 * standing there show where a group is.
 *
 * @module
 */

import {
  BoxGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  type BufferGeometry,
  type Material,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { StageArea } from "./types.ts";
import type { FloorRect } from "./world.ts";

import { createShadow, disposeShadow } from "./shadow.ts";
import { toFloorRect } from "./world.ts";

/** Desk sizes in jelly units. A jelly is about 2.3 units tall. */
const DESK_HEIGHT = 0.95;
const DESK_TOP_THICKNESS = 0.12;
const DESK_CORNER = 0.05;
/** Desks standing side by side show a thin seam, so every place has its own table. */
const DESK_SEAM = 0.05;
const LEG_THICKNESS = 0.1;
/** Share of the desk depth a leg panel covers. */
const LEG_DEPTH_SHARE = 0.8;
/** Desks longer than this get legs in between, too. */
const LONGEST_LEG_GAP = 6;
const CABLE_HEIGHT = 0.04;
const ROUND_SEGMENTS = 2;
const DESK_SHADOW = { margin: 0.12, radius: 0.15, softness: 0.35, strength: 0.22 };
const CABLE_ORDER = 1;
const DESK_ORDER = 3;

const TOP_MATERIAL = new MeshLambertMaterial({ color: "#fbf6ec", toneMapped: false });
const LEG_MATERIAL = new MeshLambertMaterial({ color: "#b8c3d0", toneMapped: false });
const CABLE_MATERIAL = new MeshLambertMaterial({ color: "#9aa6b5", toneMapped: false });
/** Materials are shared by all furniture and stay for the whole page. */
const SHARED_MATERIALS = new Set<Material>([TOP_MATERIAL, LEG_MATERIAL, CABLE_MATERIAL]);

/** Creates a box mesh whose bottom sits at `bottom`. */
function createBlock(
  geometry: BufferGeometry,
  material: Material,
  center: { x: number; z: number },
  bottom: number,
): Mesh {
  geometry.computeBoundingBox();
  const height = geometry.boundingBox ? geometry.boundingBox.max.y : 0;
  const block = new Mesh(geometry, material);
  block.position.set(center.x, bottom + height, center.z);
  return block;
}

/** Returns the positions of the leg panels along the longer side of a desk. */
function listLegOffsets(length: number): number[] {
  const gaps = Math.max(1, Math.ceil(length / LONGEST_LEG_GAP));
  const reach = length / 2 - LEG_THICKNESS;
  return Array.from({ length: gaps + 1 }, (_, index) => -reach + (2 * reach * index) / gaps);
}

/** Builds one desk: a rounded top on panel legs, with its shadow. */
function createDesk(rect: FloorRect): Group {
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const center = { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
  const desk = new Group();
  const top = new RoundedBoxGeometry(
    width - DESK_SEAM,
    DESK_TOP_THICKNESS,
    depth - DESK_SEAM,
    ROUND_SEGMENTS,
    DESK_CORNER,
  );
  desk.add(createBlock(top, TOP_MATERIAL, center, DESK_HEIGHT - DESK_TOP_THICKNESS));
  const isWide = width >= depth;
  const legHeight = DESK_HEIGHT - DESK_TOP_THICKNESS;
  for (const offset of listLegOffsets(isWide ? width : depth)) {
    const leg = isWide
      ? new BoxGeometry(LEG_THICKNESS, legHeight, depth * LEG_DEPTH_SHARE)
      : new BoxGeometry(width * LEG_DEPTH_SHARE, legHeight, LEG_THICKNESS);
    const spot = isWide
      ? { x: center.x + offset, z: center.z }
      : { x: center.x, z: center.z + offset };
    desk.add(createBlock(leg, LEG_MATERIAL, spot, 0));
  }
  const shadow = createShadow({
    halfWidth: width / 2 + DESK_SHADOW.margin,
    halfDepth: depth / 2 + DESK_SHADOW.margin,
    radius: DESK_SHADOW.radius,
    softness: DESK_SHADOW.softness,
    strength: DESK_SHADOW.strength,
  });
  shadow.position.x = center.x;
  shadow.position.z = center.z;
  desk.add(shadow);
  for (const child of desk.children) {
    if (child !== shadow) child.renderOrder = DESK_ORDER;
  }
  return desk;
}

/** Builds a flat cable duct. */
function createCable(rect: FloorRect): Mesh {
  const width = rect.maxX - rect.minX;
  const depth = rect.maxZ - rect.minZ;
  const corner = Math.min(width, depth, CABLE_HEIGHT) / 2;
  const geometry = new RoundedBoxGeometry(width, CABLE_HEIGHT, depth, ROUND_SEGMENTS, corner);
  const center = { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
  const cable = createBlock(geometry, CABLE_MATERIAL, center, 0);
  cable.renderOrder = CABLE_ORDER;
  return cable;
}

/** Builds all furniture of the room. */
export function createFurniture(areas: StageArea[]): Group {
  const furniture = new Group();
  for (const area of areas) {
    if (area.kind === "desk") furniture.add(createDesk(toFloorRect(area)));
    if (area.kind === "cable") furniture.add(createCable(toFloorRect(area)));
  }
  return furniture;
}

/** Frees the geometries of the furniture. The shared materials stay. */
export function disposeFurniture(furniture: Group): void {
  furniture.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if (SHARED_MATERIALS.has(object.material as Material)) {
      object.geometry.dispose();
      return;
    }
    disposeShadow(object);
  });
}
