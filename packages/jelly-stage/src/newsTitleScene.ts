/**
 * The 3D opening title of the Jelly-News as a scene of its own: the parts of `newsTitle.glb` in
 * the candy look of the cosmetics with ink rims, on the channel blue of the band they stand on,
 * filmed by a camera of their own. `newsTitleMotion.ts` says where everything is, this module only
 * applies it, so the title looks the same whatever the stage camera does.
 *
 * @module
 */

import {
  BackSide,
  Color,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";

import type { ScreenSize } from "./lens.ts";
import type { Rect } from "./newsBarLayout.ts";
import type { PartPose, TitlePose } from "./newsTitleMotion.ts";

import { CHANNEL_COLORS } from "./newsBarPaint.ts";
import { TITLE_AIM, TITLE_FIELD, TITLE_LAYOUT, TITLE_MODEL } from "./newsTitleLayout.ts";
import groundFragmentShader from "./shaders/newsTitleGround.frag.glsl?raw";
import groundVertexShader from "./shaders/newsTitleGround.vert.glsl?raw";
import inkFragmentShader from "./shaders/newsTitleInk.frag.glsl?raw";
import inkVertexShader from "./shaders/newsTitleInk.vert.glsl?raw";
import fragmentShader from "./shaders/newsTitle.frag.glsl?raw";
import vertexShader from "./shaders/newsTitle.vert.glsl?raw";

/** The ink of the rims: the darkest blue of the channel. */
const INK = CHANNEL_COLORS.strip;
/** Width of the ink rims in units of each part. The sparkle is small, its rim thinner. */
const RIMS = { usual: 0.022, ring: 0.014, sparkle: 0.06 };
/** How strongly the glint lights the plates and their letters. */
const GLINT_STRENGTH = 0.85;
const NEAR = 0.1;
const FAR = 200;

/** What the frame the title is filmed for looks like. */
export interface TitleView {
  /** Size of the picture in CSS pixels. */
  size: ScreenSize;
  /** What the page leaves free, the title sits in its middle. */
  free: Rect;
  /** How far the camera stands in front of the aim. */
  distance: number;
  /** Pixels of the picture the renderer draws, per CSS pixel. */
  pixelRatio: number;
}

/** The scene of the title and the handles its motion moves. */
export interface TitleScene {
  scene: Scene;
  camera: PerspectiveCamera;
  ground: ShaderMaterial;
  /** The globe leans in `tilt` and spins in `spin` around its own axis. */
  globe: { tilt: Object3D; spin: Object3D };
  rings: { root: Object3D; material: ShaderMaterial }[];
  /** JELLY and NEWS, each a plate with its letters. */
  plates: Object3D[];
  sparkles: Object3D[];
  /** Shared by every part the glint runs over. */
  glint: { value: number };
}

/** Creates the candy surface of a part. `glint` says how strongly the glint lights it. */
function createSurface(glint: { value: number }, strength: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uGlint: glint,
      uGlintStrength: { value: strength },
      uStreak: { value: 0 },
      uStreakStrength: { value: 0 },
    },
    vertexShader,
    fragmentShader,
  });
}

/** Creates the ink rim of a part, `width` wide in its own units. */
function createInk(width: number): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    uniforms: { uWidth: { value: width }, uInk: { value: new Color(INK) } },
    vertexShader: inkVertexShader,
    fragmentShader: inkFragmentShader,
  });
}

/** Returns a part with its surface and, unless `rim` is 0, its ink rim. */
function dress(geometry: BufferGeometry, surface: ShaderMaterial, rim: number): Object3D {
  const part = new Object3D();
  part.add(new Mesh(geometry, surface));
  if (rim > 0) part.add(new Mesh(geometry, createInk(rim)));
  return part;
}

/** Creates the ground: the channel blue over the whole picture, drawn first and without depth. */
function createGround(): { mesh: Mesh; material: ShaderMaterial } {
  // The canvas mixes its colours as sRGB, so the ground takes them as they are written.
  const srgb = (hex: string) => new Color().setStyle(hex, "srgb-linear");
  const material = new ShaderMaterial({
    uniforms: {
      uMiddle: { value: new Vector2() },
      uReach: { value: 1 },
      uInner: { value: srgb(CHANNEL_COLORS.brand) },
      uOuter: { value: srgb(CHANNEL_COLORS.deep) },
      uLight: { value: srgb(CHANNEL_COLORS.accent) },
      uGlobe: { value: new Vector3() },
      uHalo: { value: 0 },
      uTurn: { value: 0 },
    },
    vertexShader: groundVertexShader,
    fragmentShader: groundFragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, material };
}

/** Returns the geometry of a part of the model, or throws: without it the title cannot stand. */
function need(parts: ReadonlyMap<string, BufferGeometry>, name: string): BufferGeometry {
  const geometry = parts.get(name);
  if (!geometry) throw new Error(`newsTitle.glb: the part ${name} is missing`);
  return geometry;
}

/** Builds the plates: JELLY and NEWS, each with its letters standing out of it. */
function buildPlates(parts: ReadonlyMap<string, BufferGeometry>, glint: { value: number }) {
  const surface = createSurface(glint, GLINT_STRENGTH);
  return ["jelly", "news"].map((word) => {
    const plate = new Object3D();
    plate.add(dress(need(parts, word), surface, RIMS.usual));
    // The letters stand inside the outline of their plate: a rim of their own would ink only one
    // side of every stroke.
    plate.add(dress(need(parts, `${word}-letters`), surface, 0));
    return plate;
  });
}

/** Builds the orbit rings, each with a light that runs round it. */
function buildRings(parts: ReadonlyMap<string, BufferGeometry>, glint: { value: number }) {
  return ["ring-inner", "ring-outer"].map((name) => {
    const material = createSurface(glint, 0);
    material.uniforms.uStreakStrength = { value: 1 };
    return { root: dress(need(parts, name), material, RIMS.ring), material };
  });
}

/**
 * Builds the title from the parts of its model, each as `loadModelParts` of @jelly/scene merges
 * them. Throws when a part is missing.
 */
export function buildTitleScene(parts: ReadonlyMap<string, BufferGeometry>): TitleScene {
  const scene = new Scene();
  const ground = createGround();
  const glint = { value: 0 };
  const globe = {
    tilt: new Object3D(),
    spin: dress(need(parts, "globe"), createSurface(glint, 0), RIMS.usual),
  };
  globe.tilt.add(globe.spin);
  const rings = buildRings(parts, glint);
  const plates = buildPlates(parts, glint);
  const sparkle = createSurface(glint, 0);
  const sparkles = TITLE_LAYOUT.sparkles.map(() =>
    dress(need(parts, "sparkle"), sparkle, RIMS.sparkle),
  );
  scene.add(ground.mesh, globe.tilt, ...rings.map((ring) => ring.root), ...plates, ...sparkles);
  const camera = new PerspectiveCamera(30, 1, NEAR, FAR);
  return { scene, camera, ground: ground.material, globe, rings, plates, sparkles, glint };
}

/** Puts a part where its pose says. */
function place(object: Object3D, pose: PartPose): void {
  object.position.set(pose.at.x, pose.at.y, pose.at.z);
  object.rotation.set(pose.turn.x, pose.turn.y, pose.turn.z);
  object.scale.setScalar(pose.scale);
  object.visible = pose.scale > 0;
}

/** Aims the camera at the title: the free height spans its field of view, centred in the free area. */
function aim(camera: PerspectiveCamera, view: TitleView): void {
  const { size, free } = view;
  camera.aspect = size.width / Math.max(1, size.height);
  const tangent = (Math.tan(TITLE_FIELD / 2) * size.height) / Math.max(1, free.height);
  camera.fov = (2 * Math.atan(tangent) * 180) / Math.PI;
  const middle = free.y + free.height / 2;
  camera.setViewOffset(
    size.width,
    size.height,
    0,
    size.height / 2 - middle,
    size.width,
    size.height,
  );
  camera.position.set(TITLE_AIM.x, TITLE_AIM.y, TITLE_AIM.z + view.distance);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** Tells the ground where the free area and the globe are, in pixels of the picture. */
function lightGround(title: TitleScene, pose: TitlePose, view: TitleView): void {
  const { size, free, pixelRatio } = view;
  const uniforms = title.ground.uniforms;
  const middle = { x: free.x + free.width / 2, y: size.height - free.y - free.height / 2 };
  uniforms.uMiddle?.value.set(middle.x * pixelRatio, middle.y * pixelRatio);
  if (uniforms.uReach)
    uniforms.uReach.value = (Math.hypot(free.width, free.height) / 2) * pixelRatio;
  const center = new Vector3(pose.globe.at.x, pose.globe.at.y, pose.globe.at.z);
  const edge = center.clone().setX(center.x + TITLE_MODEL.globe.radius * pose.globe.scale);
  center.project(title.camera);
  edge.project(title.camera);
  const toPixels = (ndc: number, extent: number) => ((ndc + 1) / 2) * extent * pixelRatio;
  const radius = Math.abs(toPixels(edge.x, size.width) - toPixels(center.x, size.width));
  uniforms.uGlobe?.value.set(
    toPixels(center.x, size.width),
    toPixels(center.y, size.height),
    radius,
  );
  if (uniforms.uHalo) uniforms.uHalo.value = pose.halo.strength;
  if (uniforms.uTurn) uniforms.uTurn.value = pose.halo.turn;
}

/** Moves the title into a pose and aims its camera for a view. */
export function poseTitleScene(title: TitleScene, pose: TitlePose, view: TitleView): void {
  aim(title.camera, view);
  place(title.globe.tilt, { at: pose.globe.at, turn: pose.globe.turn, scale: pose.globe.scale });
  title.globe.spin.rotation.set(0, pose.globe.spin, 0);
  title.rings.forEach((ring, index) => {
    const ringPose = pose.rings[index];
    if (!ringPose) return;
    place(ring.root, ringPose);
    if (ring.material.uniforms.uStreak) ring.material.uniforms.uStreak.value = ringPose.streak;
  });
  title.plates.forEach((plate, index) => {
    const platePose = pose.plates[index];
    if (platePose) place(plate, platePose);
  });
  title.sparkles.forEach((sparkle, index) => {
    const spot = TITLE_LAYOUT.sparkles[index];
    const share = pose.sparkles[index] ?? 0;
    if (!spot) return;
    place(sparkle, { at: spot, turn: { x: 0, y: 0, z: index * 0.6 }, scale: spot.size * share });
  });
  // Far away from the logo, the glint lights nothing.
  title.glint.value = pose.glint ?? 1e4;
  lightGround(title, pose, view);
}
