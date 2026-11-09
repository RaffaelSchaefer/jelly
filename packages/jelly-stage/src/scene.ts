/**
 * Renderer, camera and light of the 3D stage. The camera looks at the room from the front and
 * above and moves back until the whole room fits the screen.
 *
 * @module
 */

import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Mesh,
} from "three";

import type { FloorPoint, RoomSize, ScenePoint } from "./world.ts";

import { BACKGROUND_COLOR, createFloor, fitFloor } from "./floor.ts";
import { bendToLens, type ScreenPoint, type ScreenSize } from "./lens.ts";
import { calculateCameraDistance, toRoomRect } from "./world.ts";

const FIELD_OF_VIEW_DEGREES = 30;
/** How steeply the camera looks down on the room. */
const PITCH_DEGREES = 50;
/** Leaves a little air around the room. */
const FRAME_MARGIN = 1.04;
/** The lens pushes the room outward, so the view widens by up to this factor to keep it whole. */
const WIDEST_VIEW = 1.8;
const FIT_STEPS = 12;
/** Rounding of the fit, in CSS pixels. */
const FIT_TOLERANCE = 0.5;
const NEAR_PLANE = 1;
const FAR_PLANE = 300;
/** Heights the camera keeps on screen: heads with signs at the back, names at the front. */
const SIGN_TOP = 3.2;
const NAME_REACH = 1.6;
const SKY_LIGHT = { sky: "#ffffff", ground: "#c7d3e0", intensity: 2.1 };
/** Same direction as the softbox the jelly shader reflects, so desks and jellies agree. */
const SUN = { color: "#ffffff", intensity: 1.3, direction: [-0.45, 0.8, 0.45] as const };

/** Everything that draws the stage. */
export interface StageScene {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  floor: Mesh;
}

/** Where the stage is shown: its size in CSS pixels and how it is drawn there. */
export interface StageScreen {
  size: ScreenSize;
  /** Drawing buffer pixels per CSS pixel. */
  pixelRatio: number;
  /** The fisheye the picture is shown through. */
  lensStrength: number;
}

/** Creates renderer, scene, camera, light and floor. The renderer draws into its own canvas. */
export function createStageScene(): StageScene {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  // Fiber does this for the app, plain three.js needs it set: the jelly shader expects both.
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  scene.background = new Color(BACKGROUND_COLOR);
  const sky = new HemisphereLight(SKY_LIGHT.sky, SKY_LIGHT.ground, SKY_LIGHT.intensity);
  const sun = new DirectionalLight(SUN.color, SUN.intensity);
  sun.position.set(...SUN.direction);
  const floor = createFloor();
  scene.add(sky, sun, floor);
  const camera = new PerspectiveCamera(FIELD_OF_VIEW_DEGREES, 1, NEAR_PLANE, FAR_PLANE);
  return { renderer, scene, camera, floor };
}

/** Lists the points of a room that must stay on screen. */
function listFramePoints(room: RoomSize): ScenePoint[] {
  const rect = toRoomRect(room);
  const points: ScenePoint[] = [];
  for (const x of [rect.minX, rect.maxX]) {
    points.push(
      { x, y: 0, z: rect.minZ },
      { x, y: SIGN_TOP, z: rect.minZ },
      { x, y: 0, z: rect.maxZ + NAME_REACH },
    );
  }
  return points;
}

/** Fits renderer, floor and camera to a screen and a room. The camera sees the whole room. */
export function resizeStageScene(stage: StageScene, screen: StageScreen, room: RoomSize): void {
  const { renderer, camera } = stage;
  const { size, pixelRatio } = screen;
  // The lens copies the picture into a texture, so it may not outgrow the largest one of the GPU.
  const largest = renderer.capabilities.maxTextureSize / Math.max(1, size.width, size.height);
  renderer.setPixelRatio(Math.min(pixelRatio, largest));
  renderer.setSize(size.width, size.height, false);
  fitFloor(stage.floor, room);
  camera.aspect = size.width / Math.max(1, size.height);
  const pitch = MathUtils.degToRad(PITCH_DEGREES);
  const view = {
    fov: MathUtils.degToRad(FIELD_OF_VIEW_DEGREES),
    pitch,
    aspect: camera.aspect,
    margin: FRAME_MARGIN,
  };
  // The room lies around the origin.
  const target = { x: 0, y: 0, z: 0 };
  const points = listFramePoints(room);
  const distance = calculateCameraDistance(points, target, view);
  camera.position.set(
    target.x,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(pitch) * distance,
  );
  camera.lookAt(target.x, target.y, target.z);
  // Nothing of the room lies farther away than its diagonal behind the target.
  camera.far = Math.max(FAR_PLANE, distance + Math.hypot(room.width, room.depth));
  fitThroughLens(camera, screen, points);
}

/**
 * Widens the view until the room stays on screen after the lens bends it. Widening also moves the
 * room toward the middle, so the smallest widening that fits is searched step by step.
 */
function fitThroughLens(camera: PerspectiveCamera, screen: StageScreen, points: ScenePoint[]) {
  const { size, lensStrength } = screen;
  const tangent = Math.tan(MathUtils.degToRad(FIELD_OF_VIEW_DEGREES) / 2);
  const fits = (widening: number) => {
    camera.fov = MathUtils.radToDeg(2 * Math.atan(tangent * widening));
    centerVertically(camera, size, points);
    return points.every((point) => {
      const bent = bendToLens(projectToScreen(camera, point, size), size, lensStrength);
      const reachX = Math.abs(bent.x - size.width / 2) - size.width / 2 / FRAME_MARGIN;
      const reachY = Math.abs(bent.y - size.height / 2) - size.height / 2 / FRAME_MARGIN;
      return Math.max(reachX, reachY) <= FIT_TOLERANCE;
    });
  };
  if (fits(1)) {
    return;
  }
  let narrowest = 1;
  let widest = WIDEST_VIEW;
  for (let step = 0; step < FIT_STEPS; step++) {
    const widening = (narrowest + widest) / 2;
    if (fits(widening)) {
      widest = widening;
    } else {
      narrowest = widening;
    }
  }
  fits(widest);
}

/**
 * Shifts the picture up or down so the room sits in the middle. Perspective makes the back of the
 * room smaller, so the fitted room would otherwise leave more space above it than below.
 */
function centerVertically(camera: PerspectiveCamera, size: ScreenSize, points: ScenePoint[]) {
  camera.clearViewOffset();
  camera.updateMatrixWorld();
  const heights = points.map((point) => new Vector3(point.x, point.y, point.z).project(camera).y);
  const middle = (Math.max(...heights) + Math.min(...heights)) / 2;
  camera.setViewOffset(
    size.width,
    size.height,
    0,
    (-middle * size.height) / 2,
    size.width,
    size.height,
  );
}

/** Returns where the camera stands, seen from above. Idle jellies look there. */
export function findViewer(camera: PerspectiveCamera): FloorPoint {
  return { x: camera.position.x, z: camera.position.z };
}

/** Projects a point of the scene onto the screen. */
export function projectToScreen(
  camera: PerspectiveCamera,
  point: ScenePoint,
  size: ScreenSize,
): ScreenPoint {
  const projected = new Vector3(point.x, point.y, point.z).project(camera);
  return {
    x: ((projected.x + 1) / 2) * size.width,
    y: ((1 - projected.y) / 2) * size.height,
  };
}
