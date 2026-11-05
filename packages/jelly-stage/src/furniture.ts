/**
 * Desks and cable ducts built from the zones with the props `desk` and `cable`. Seats stay
 * invisible: the jellies standing there show where a group is. All desk tops share one mesh, all
 * legs another and the shadows one per desk size, so a hall full of desks costs a handful of draw
 * calls. A turned desk turns before it merges: every part gets its place in the room and the turn
 * of its zone.
 *
 * @module
 */

import { BoxGeometry, Group, Mesh, type BufferGeometry, type Material } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { StageArea } from "./types.ts";
import type { FloorPoint } from "./world.ts";

import { createMatte, FLAT_ORDER, mergeParts, type PropPart } from "./props.ts";
import {
  createShadowGeometry,
  createShadowMaterial,
  SHADOW_HEIGHT,
  SHADOW_ORDER,
  type ShadowShape,
} from "./shadow.ts";
import { findFloorHeight, listPlatforms, placeArea, toRoomPoint, type Placement } from "./zones.ts";

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
/** Shadow planes lie flat: turned from the xy plane onto the floor. */
const FLAT_TURN = { x: -Math.PI / 2, y: 0, z: 0 };

const TOP_MATERIAL = createMatte("#fbf6ec");
const LEG_MATERIAL = createMatte("#b8c3d0");
const CABLE_MATERIAL = createMatte("#9aa6b5");

/** Where a desk stands: its zone and the floor under it. */
interface DeskSpot {
  placement: Placement;
  floor: number;
}

/** Creates a box mesh whose bottom sits on the floor of its spot, turned with its zone. */
function createBlock(geometry: BufferGeometry, material: Material, spot: DeskSpot): Mesh {
  geometry.computeBoundingBox();
  const height = geometry.boundingBox ? geometry.boundingBox.max.y : 0;
  const block = new Mesh(geometry, material);
  const { middle, turn } = spot.placement;
  block.position.set(middle.x, spot.floor + height, middle.z);
  block.rotation.y = turn;
  return block;
}

/** Where a part sits in its desk: beside the middle, at a height, and laid flat by `lay` or not. */
interface PartOffset {
  local: FloorPoint;
  y: number;
  lay?: number;
}

/** Returns a part of a desk: built around the desk's middle, moved and turned into the room. */
function placePart(geometry: BufferGeometry, offset: PartOffset, spot: DeskSpot): PropPart {
  const { x, z } = toRoomPoint(offset.local, spot.placement);
  const turn = { x: offset.lay ?? 0, y: spot.placement.turn, z: 0 };
  return { geometry, at: { x, y: spot.floor + offset.y, z }, turn };
}

/** Returns the positions of the leg panels along the longer side of a desk. */
function listLegOffsets(length: number): number[] {
  const gaps = Math.max(1, Math.ceil(length / LONGEST_LEG_GAP));
  const reach = length / 2 - LEG_THICKNESS;
  return Array.from({ length: gaps + 1 }, (_, index) => -reach + (2 * reach * index) / gaps);
}

/** The parts of all desks, gathered before they are merged. */
interface DeskParts {
  tops: PropPart[];
  legs: PropPart[];
  /** Shadows by desk size: the shape is a uniform, so only shadows of one size share a mesh. */
  shadows: Map<string, { shape: ShadowShape; planes: PropPart[] }>;
}

/** Adds the top and the legs of one desk to the parts. */
function addDeskBlocks(parts: DeskParts, spot: DeskSpot): void {
  const { width, depth } = spot.placement;
  const top = new RoundedBoxGeometry(
    width - DESK_SEAM,
    DESK_TOP_THICKNESS,
    depth - DESK_SEAM,
    ROUND_SEGMENTS,
    DESK_CORNER,
  );
  const topOffset = { local: { x: 0, z: 0 }, y: DESK_HEIGHT - DESK_TOP_THICKNESS / 2 };
  parts.tops.push(placePart(top, topOffset, spot));
  const isWide = width >= depth;
  const legHeight = DESK_HEIGHT - DESK_TOP_THICKNESS;
  for (const offset of listLegOffsets(isWide ? width : depth)) {
    const leg = isWide
      ? new BoxGeometry(LEG_THICKNESS, legHeight, depth * LEG_DEPTH_SHARE)
      : new BoxGeometry(width * LEG_DEPTH_SHARE, legHeight, LEG_THICKNESS);
    const local = isWide ? { x: offset, z: 0 } : { x: 0, z: offset };
    parts.legs.push(placePart(leg, { local, y: legHeight / 2 }, spot));
  }
}

/** Adds the shadow of one desk to the shadows of its size. */
function addDeskShadow(parts: DeskParts, spot: DeskSpot): void {
  const shape: ShadowShape = {
    halfWidth: spot.placement.width / 2 + DESK_SHADOW.margin,
    halfDepth: spot.placement.depth / 2 + DESK_SHADOW.margin,
    radius: DESK_SHADOW.radius,
    softness: DESK_SHADOW.softness,
    strength: DESK_SHADOW.strength,
  };
  const key = `${shape.halfWidth}x${shape.halfDepth}`;
  const shadows = parts.shadows.get(key) ?? { shape, planes: [] };
  parts.shadows.set(key, shadows);
  const plane = createShadowGeometry(shape);
  const offset = { local: { x: 0, z: 0 }, y: SHADOW_HEIGHT, lay: FLAT_TURN.x };
  shadows.planes.push(placePart(plane, offset, spot));
}

/** Builds a flat cable duct. */
function createCable(spot: DeskSpot): Mesh {
  const { width, depth } = spot.placement;
  const corner = Math.min(width, depth, CABLE_HEIGHT) / 2;
  const geometry = new RoundedBoxGeometry(width, CABLE_HEIGHT, depth, ROUND_SEGMENTS, corner);
  const cable = createBlock(geometry, CABLE_MATERIAL, spot);
  cable.renderOrder = FLAT_ORDER;
  return cable;
}

/** Returns where the furniture of a zone stands, on the platform there if any. */
function findSpot(area: StageArea, platforms: Placement[]): DeskSpot {
  const placement = placeArea(area);
  return { placement, floor: findFloorHeight(placement.middle, platforms) };
}

/** Builds all desks and cables of the room. */
export function createFurniture(areas: StageArea[]): Group {
  const furniture = new Group();
  const parts: DeskParts = { tops: [], legs: [], shadows: new Map() };
  const platforms = listPlatforms(areas);
  for (const area of areas) {
    if (area.prop === "desk") {
      const spot = findSpot(area, platforms);
      addDeskBlocks(parts, spot);
      addDeskShadow(parts, spot);
    }
    if (area.prop === "cable") furniture.add(createCable(findSpot(area, platforms)));
  }
  if (parts.tops.length > 0) {
    furniture.add(mergeParts(parts.tops, TOP_MATERIAL), mergeParts(parts.legs, LEG_MATERIAL));
  }
  for (const { shape, planes } of parts.shadows.values()) {
    const shadow = mergeParts(planes, createShadowMaterial(shape));
    shadow.renderOrder = SHADOW_ORDER;
    furniture.add(shadow);
  }
  return furniture;
}
