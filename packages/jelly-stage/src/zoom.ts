/**
 * Zoom of the stage camera: how close it looks and which point of the floor sits in the middle of
 * the view. The fitted camera of `scene.ts` stays the starting point, the zoom only narrows its view
 * and slides it over the floor, so picking, labels and the lens work as before.
 *
 * The view glides: the zoom eases toward its goal, a drag keeps some swing after the release, and
 * the edge of the room gives a little before it pulls the view back in.
 *
 * @module
 */

import { MathUtils, type PerspectiveCamera, type Vector3 } from "three";

import type { ScreenPoint } from "./lens.ts";

import { toRoomRect, type FloorPoint, type RoomSize } from "./world.ts";

/** How close the view gets. 1 shows the whole room. */
export const ZOOM_RANGE = { lowest: 1, highest: 6 };
/** How fast the zoom reaches its goal and a released view springs back into the room, per second. */
const RATES = { zoom: 14, spring: 10, edgeBrake: 18 };
/** How fast the swing after a drag fades, per second. */
const GLIDE_FRICTION = 4.5;
/** Beyond the edge a drag moves the view this share of the way, and at most this share of a room. */
const RUBBER = { share: 0.3, give: 0.12 };
/** A drag that rested this long before its release leaves no swing. */
const STILL_DRAG_MS = 80;
/** The fastest swing, in views per second. */
const FASTEST_GLIDE = 3;
/** Below these, zoom, swing and spring count as done: in log units, units per second and units. */
const SETTLED = { zoom: 0.002, glide: 0.05, spring: 0.01 };
const NO_SWING: FloorPoint = { x: 0, z: 0 };

/** How the view is zoomed right now. */
export interface StageZoom {
  /** 1 shows the whole room, see {@link ZOOM_RANGE}. */
  factor: number;
  /** The factor the zoom eases toward. */
  goal: number;
  /** The floor point in the middle of the view. The middle of the room is the origin. */
  focus: FloorPoint;
  /** The own jelly stays in the middle. */
  followsOwn: boolean;
  /** The floor that stays under a point of the screen while the zoom eases, null keeps the middle. */
  anchor: { floor: FloorPoint; screen: ScreenPoint } | null;
  /** Units per second the view keeps sliding after a drag. */
  glide: FloorPoint;
  /** A running drag: where the view would be without the edge, and how fast it moved. */
  drag: { free: FloorPoint; at: number; velocity: FloorPoint } | null;
  /** The view may stand beyond the edge for a moment, then springs back. */
  loose: boolean;
}

/** What the zoom moves and measures with. */
export interface ZoomStage {
  camera: PerspectiveCamera;
  /** Where the camera stands when it shows the whole room. */
  home: Vector3;
  room: RoomSize;
  /** What the page leaves free of the screen, in CSS pixels. The focus sits under its middle. */
  free: { width: number; top: number; bottom: number };
  /** Returns the floor under a point in CSS pixels, for the camera as it stands. */
  findFloor: (point: ScreenPoint) => FloorPoint | null;
}

/** What keeps the view in the room at one zoom. */
export interface FocusBounds {
  room: RoomSize;
  /** The focus of the whole room. */
  home: FloorPoint;
  /** How far the free view reaches from its focus, in floor units. */
  reach: { left: number; right: number; back: number; front: number };
}

/** What a frame tells the zoom. */
export interface ZoomFrame {
  seconds: number;
  /** Where the own jelly stands, undefined when it is not in the room. */
  own: FloorPoint | undefined;
  reducedMotion: boolean;
}

/** One step of a drag: the floor under `from` moves under `to`, at `at` milliseconds. */
export interface PanMove {
  from: ScreenPoint;
  to: ScreenPoint;
  at: number;
}

/** The whole room, following the own jelly as soon as the view gets closer. */
export function createZoom(): StageZoom {
  return {
    factor: ZOOM_RANGE.lowest,
    goal: ZOOM_RANGE.lowest,
    focus: { x: 0, z: 0 },
    followsOwn: true,
    anchor: null,
    glide: NO_SWING,
    drag: null,
    loose: false,
  };
}

/** Share of the way a value moves toward its goal in `seconds` at `rate` per second. */
function approach(rate: number, seconds: number): number {
  return 1 - Math.exp(-rate * seconds);
}

/** Returns the middle of what the page leaves free. */
function findCenter(stage: ZoomStage): ScreenPoint {
  const { width, top, bottom } = stage.free;
  return { x: width / 2, y: (top + bottom) / 2 };
}

/** Returns the floor under the middle of the view, with the camera at home and zoomed by `factor`. */
function floorUnderCenter(stage: ZoomStage, factor: number): FloorPoint {
  const { camera, home } = stage;
  camera.zoom = factor;
  camera.updateProjectionMatrix();
  camera.position.copy(home);
  camera.updateMatrixWorld();
  return stage.findFloor(findCenter(stage)) ?? { x: 0, z: 0 };
}

/** Measures what keeps the view in the room at `factor`. Moves the camera, so place it after. */
export function measureBounds(stage: ZoomStage, factor: number): FocusBounds {
  const home = floorUnderCenter(stage, ZOOM_RANGE.lowest);
  const middle = floorUnderCenter(stage, factor);
  const center = findCenter(stage);
  const { width, top, bottom } = stage.free;
  const floorAt = (x: number, y: number) => stage.findFloor({ x, y }) ?? middle;
  return {
    room: stage.room,
    home,
    reach: {
      left: middle.x - floorAt(0, center.y).x,
      right: floorAt(width, center.y).x - middle.x,
      back: middle.z - floorAt(center.x, top).z,
      front: floorAt(center.x, bottom).z - middle.z,
    },
  };
}

/** Returns the floor in the middle of the view while it shows the whole room. */
export function findHomeFocus(stage: ZoomStage): FloorPoint {
  return floorUnderCenter(stage, ZOOM_RANGE.lowest);
}

/**
 * Keeps a focus between the range of the zoom and the range of the edges. Where the view is larger
 * than the room, the edges swap: then the focus stays where the whole room is in view. Should the
 * ranges not meet, the zoom wins.
 */
function clampBoth(value: number, zoomed: [number, number], edges: [number, number]): number {
  const low = Math.max(zoomed[0], Math.min(...edges));
  const high = Math.min(zoomed[1], Math.max(...edges));
  return low <= high
    ? MathUtils.clamp(value, low, high)
    : MathUtils.clamp(value, zoomed[0], zoomed[1]);
}

/**
 * Keeps the focus so far inside the room that the view does not slide off it. Two rules hold: the
 * edge of the view stays inside the room, or the room inside the view where the view is larger, and
 * the closer the zoom, the farther the focus may leave `home`, the focus of the whole room. So
 * zooming out always ends at the fitted view.
 */
export function limitFocus(focus: FloorPoint, factor: number, bounds: FocusBounds): FloorPoint {
  const { home, reach } = bounds;
  const rect = toRoomRect(bounds.room);
  const free = 1 - 1 / factor;
  const around = (middle: number, low: number, high: number): [number, number] => [
    middle + (low - middle) * free,
    middle + (high - middle) * free,
  ];
  return {
    x: clampBoth(focus.x, around(home.x, rect.minX, rect.maxX), [
      rect.minX + reach.left,
      rect.maxX - reach.right,
    ]),
    z: clampBoth(focus.z, around(home.z, rect.minZ, rect.maxZ), [
      rect.minZ + reach.back,
      rect.maxZ - reach.front,
    ]),
  };
}

/** Puts the camera so the focus lies under the middle of the view. Picking reads it right away. */
export function placeCamera(stage: ZoomStage, zoom: StageZoom): void {
  const under = floorUnderCenter(stage, zoom.factor);
  const { camera, home } = stage;
  camera.position.set(home.x + zoom.focus.x - under.x, home.y, home.z + zoom.focus.z - under.z);
  camera.updateMatrixWorld();
}

/** Moves the zoom toward its goal. Returns whether it has arrived. */
function easeFactor(zoom: StageZoom, frame: ZoomFrame): boolean {
  const gap = Math.log(zoom.goal / zoom.factor);
  if (frame.reducedMotion || Math.abs(gap) < SETTLED.zoom) {
    zoom.factor = zoom.goal;
    return true;
  }
  zoom.factor *= Math.exp(gap * approach(RATES.zoom, frame.seconds));
  return false;
}

/** Lets the view slide on after a drag, slower and slower. */
function slide(zoom: StageZoom, seconds: number): void {
  const { glide } = zoom;
  if (Math.hypot(glide.x, glide.z) < SETTLED.glide) {
    zoom.glide = NO_SWING;
    return;
  }
  zoom.focus = { x: zoom.focus.x + glide.x * seconds, z: zoom.focus.z + glide.z * seconds };
  const keep = Math.exp(-GLIDE_FRICTION * seconds);
  zoom.glide = { x: glide.x * keep, z: glide.z * keep };
}

/** Keeps the view in the room. A swinging view may go beyond the edge, then springs back. */
function keepInRoom(zoom: StageZoom, bounds: FocusBounds, frame: ZoomFrame): void {
  const inside = limitFocus(zoom.focus, zoom.factor, bounds);
  const off = { x: inside.x - zoom.focus.x, z: inside.z - zoom.focus.z };
  const isOut = Math.hypot(off.x, off.z) > SETTLED.spring;
  const isSwinging = zoom.loose || zoom.glide !== NO_SWING;
  if (!isOut || !isSwinging || frame.reducedMotion) {
    zoom.focus = inside;
    zoom.loose = false;
    return;
  }
  zoom.loose = true;
  const brake = Math.exp(-RATES.edgeBrake * frame.seconds);
  zoom.glide = { x: zoom.glide.x * brake, z: zoom.glide.z * brake };
  const step = approach(RATES.spring, frame.seconds);
  zoom.focus = { x: zoom.focus.x + off.x * step, z: zoom.focus.z + off.z * step };
}

/** Slides the focus so the anchored floor lies under its point of the screen again. */
function holdAnchor(zoom: StageZoom, stage: ZoomStage, bounds: FocusBounds): void {
  const { anchor } = zoom;
  const now = anchor && stage.findFloor(anchor.screen);
  if (!anchor || !now) {
    return;
  }
  const focus = {
    x: zoom.focus.x + anchor.floor.x - now.x,
    z: zoom.focus.z + anchor.floor.z - now.z,
  };
  zoom.focus = limitFocus(focus, zoom.factor, bounds);
  placeCamera(stage, zoom);
}

/** Moves the view one frame on and puts the camera there. A followed own jelly stays in the middle. */
export function stepZoom(zoom: StageZoom, stage: ZoomStage, frame: ZoomFrame): void {
  const hasArrived = easeFactor(zoom, frame);
  const bounds = measureBounds(stage, zoom.factor);
  if (zoom.followsOwn && frame.own) {
    zoom.focus = { x: frame.own.x, z: frame.own.z };
  } else if (!zoom.drag) {
    slide(zoom, frame.seconds);
  }
  if (!zoom.drag) {
    keepInRoom(zoom, bounds, frame);
  }
  placeCamera(stage, zoom);
  if (zoom.anchor && !zoom.followsOwn) {
    holdAnchor(zoom, stage, bounds);
  }
  if (hasArrived) {
    zoom.anchor = null;
  }
}

/**
 * Zooms by a factor. While the own jelly is followed it stays in the middle, otherwise the floor
 * under `at` stays where it is.
 */
export function zoomAt(zoom: StageZoom, stage: ZoomStage, factor: number, at?: ScreenPoint): void {
  zoom.goal = MathUtils.clamp(zoom.goal * factor, ZOOM_RANGE.lowest, ZOOM_RANGE.highest);
  const floor = at && !zoom.followsOwn ? stage.findFloor(at) : null;
  zoom.anchor = floor && at ? { floor, screen: at } : null;
}

/** Returns where the view stands for a drag that would be at `free`: beyond the edge it gives less. */
function stretchFocus(free: FloorPoint, factor: number, bounds: FocusBounds): FloorPoint {
  const inside = limitFocus(free, factor, bounds);
  const give = (bounds.room.width / factor) * RUBBER.give;
  const stretch = (beyond: number) =>
    (beyond * RUBBER.share) / (1 + (Math.abs(beyond) * RUBBER.share) / give);
  return { x: inside.x + stretch(free.x - inside.x), z: inside.z + stretch(free.z - inside.z) };
}

/** Slides the view so the floor under `from` lies under `to`. Ends following the own jelly. */
export function panBetween(zoom: StageZoom, stage: ZoomStage, move: PanMove): void {
  const grabbed = stage.findFloor(move.from);
  const target = stage.findFloor(move.to);
  if (!grabbed || !target) {
    return;
  }
  const shift = { x: grabbed.x - target.x, z: grabbed.z - target.z };
  const drag = zoom.drag ?? { free: { ...zoom.focus }, at: move.at, velocity: NO_SWING };
  const seconds = (move.at - drag.at) / 1000;
  if (seconds > 0) {
    // Half the old speed smooths the jitter of single pointer events.
    drag.velocity = {
      x: (drag.velocity.x + shift.x / seconds) / 2,
      z: (drag.velocity.z + shift.z / seconds) / 2,
    };
  }
  drag.free = { x: drag.free.x + shift.x, z: drag.free.z + shift.z };
  drag.at = move.at;
  Object.assign(zoom, { drag, followsOwn: false, anchor: null, glide: NO_SWING });
  zoom.focus = stretchFocus(drag.free, zoom.factor, measureBounds(stage, zoom.factor));
  placeCamera(stage, zoom);
}

/** Ends a drag. The view keeps the swing it had, unless it rested before the release. */
export function releasePan(zoom: StageZoom, room: RoomSize, at: number, reducedMotion: boolean) {
  const { drag } = zoom;
  if (!drag) {
    return;
  }
  zoom.drag = null;
  zoom.loose = true;
  const speed = Math.hypot(drag.velocity.x, drag.velocity.z);
  const fastest = (room.width / zoom.factor) * FASTEST_GLIDE;
  const isStill = at - drag.at > STILL_DRAG_MS || speed === 0;
  const scale = Math.min(1, fastest / Math.max(speed, Number.EPSILON));
  zoom.glide =
    isStill || reducedMotion
      ? NO_SWING
      : { x: drag.velocity.x * scale, z: drag.velocity.z * scale };
}
