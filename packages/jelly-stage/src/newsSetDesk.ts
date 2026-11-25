/**
 * The anchor desk of the Jelly-News: a curved desk in front of the presenter with a light top and a
 * front in the look of the channel, its blue band between light lines. It is built once around a
 * presenter of the usual size and grows with it, its shape stands in `DESK` of `newsSetPlan.ts`.
 * `newsSet.ts` places it and fades its materials together.
 *
 * @module
 */

import {
  CanvasTexture,
  CustomBlending,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Shape,
  SrcAlphaFactor,
  SRGBColorSpace,
  type Material,
} from "three";

import type { Rect } from "./newsBarLayout.ts";

import { CHANNEL_COLORS } from "./newsBarPaint.ts";
import { DESK } from "./newsSetPlan.ts";

/**
 * Blended like the body of a jelly: drawn in order with the solid things, so the view can put it
 * right after the presenter, and still able to fade.
 */
const FADING = {
  blending: CustomBlending,
  blendSrc: SrcAlphaFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
  toneMapped: false,
} as const;
const ARC_SEGMENTS = 64;
/** Pixels of the painted front per jelly unit of the desk. */
const FACE_PIXELS = 720;
/**
 * The front from its top down, as shares of its height above the floor: a light line, the band of
 * the channel, a second line and the dark lower panel. It carries no lettering: the close shot sees
 * the front only through the gaps between the bands of the lower third, where letters would show as
 * stray pieces. The logo stays on the screens.
 */
const BAND = { line: 0.035, bottom: 0.42, lowerLine: 0.02 };
/** Slanted stripes over the band, like the ground of the card: width and gap as shares of its height. */
const STRIPES = { width: 0.12, gap: 0.22, alpha: 0.1 };
/** How far the light lines glow, as a share of the height above the floor. */
const LINE_GLOW = 0.05;
const ANISOTROPY = 8;

/** The desk and the materials it fades with. */
export interface NewsDesk {
  /** The only group: the view sets its draw order, everything inside follows it. */
  group: Group;
  materials: Material[];
}

/** Returns the outline of a ring piece in the plane of a shape: y runs toward the hall. */
function traceSector(inner: number, outer: number): Shape {
  const ahead = Math.PI / 2;
  const shape = new Shape();
  shape.absarc(0, 0, outer, ahead - DESK.angle, ahead + DESK.angle, false);
  shape.absarc(0, 0, inner, ahead + DESK.angle, ahead - DESK.angle, true);
  shape.closePath();
  return shape;
}

/** Builds a curved slab of the desk from `bottom` up by `height`. */
function buildSlab(
  ring: { inner: number; outer: number },
  bottom: number,
  height: number,
): ExtrudeGeometry {
  const geometry = new ExtrudeGeometry(traceSector(ring.inner, ring.outer), {
    depth: height,
    bevelEnabled: false,
    curveSegments: ARC_SEGMENTS,
  });
  // Turned upright, the y of the shape runs toward the hall and the extrusion runs down.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, bottom + height, DESK.center);
  return geometry;
}

/** Paints a light line across the front that glows onto the panel around it. */
function paintLine(context: CanvasRenderingContext2D, band: Rect, glow: number): void {
  context.save();
  context.shadowColor = CHANNEL_COLORS.accent;
  context.shadowBlur = glow;
  context.fillStyle = CHANNEL_COLORS.accent;
  context.fillRect(band.x, band.y, band.width, band.height);
  context.restore();
}

/** Paints the band of the channel: its blue, darker toward both ends, with slanted stripes. */
function paintBand(context: CanvasRenderingContext2D, band: Rect): void {
  const across = context.createLinearGradient(band.x, 0, band.x + band.width, 0);
  across.addColorStop(0, CHANNEL_COLORS.deep);
  across.addColorStop(0.5, CHANNEL_COLORS.brand);
  across.addColorStop(1, CHANNEL_COLORS.deep);
  context.fillStyle = across;
  context.fillRect(band.x, band.y, band.width, band.height);
  context.save();
  context.beginPath();
  context.rect(band.x, band.y, band.width, band.height);
  context.clip();
  context.strokeStyle = CHANNEL_COLORS.accent;
  context.globalAlpha = STRIPES.alpha;
  context.lineWidth = band.height * STRIPES.width;
  context.beginPath();
  const step = band.height * (STRIPES.width + STRIPES.gap);
  for (let x = band.x - band.height; x < band.x + band.width; x += step) {
    context.moveTo(x, band.y + band.height);
    context.lineTo(x + band.height, band.y);
  }
  context.stroke();
  context.restore();
}

/**
 * Paints the front from its top down: a light line, the band of the channel, a second line and the
 * dark lower panel down to the floor. `floorShare` is the part under the floor.
 */
function paintFace(context: CanvasRenderingContext2D, floorShare: number): void {
  const { width, height } = context.canvas;
  const above = height * (1 - floorShare);
  const lower = context.createLinearGradient(0, above * BAND.bottom, 0, above);
  lower.addColorStop(0, CHANNEL_COLORS.deep);
  lower.addColorStop(1, CHANNEL_COLORS.strip);
  context.fillStyle = lower;
  context.fillRect(0, 0, width, height);
  paintBand(context, { x: 0, y: 0, width, height: above * BAND.bottom });
  const glow = above * LINE_GLOW;
  paintLine(context, { x: 0, y: 0, width, height: above * BAND.line }, glow);
  const lowerLine = above * BAND.lowerLine;
  paintLine(context, { x: 0, y: above * BAND.bottom, width, height: lowerLine }, glow);
}

/** Creates the painted front: the canvas is made here, when the view starts, never on import. */
function createFaceMaterial(skirt: number): MeshBasicMaterial {
  const height = DESK.top.bottom + skirt;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(2 * DESK.angle * DESK.face * FACE_PIXELS);
  canvas.height = Math.round(height * FACE_PIXELS);
  const context = canvas.getContext("2d");
  if (context) paintFace(context, skirt / height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  return new MeshBasicMaterial({ map: texture, ...FADING });
}

/** Builds the front: a curved strip just in front of the panel, from under the floor up to the top. */
function buildFace(skirt: number): CylinderGeometry {
  const height = DESK.top.bottom + skirt;
  const geometry = new CylinderGeometry(
    DESK.face,
    DESK.face,
    height,
    ARC_SEGMENTS,
    1,
    true,
    -DESK.angle,
    2 * DESK.angle,
  );
  geometry.translate(0, height / 2 - skirt, DESK.center);
  return geometry;
}

/**
 * Creates the desk around a presenter of the usual size, hidden at first. Panel and front reach
 * `skirt` under the floor, so the desk also stands where it reaches past the edge of the stage.
 */
export function createNewsDesk(skirt: number): NewsDesk {
  const body = new MeshLambertMaterial({ color: CHANNEL_COLORS.deep, ...FADING });
  const top = new MeshPhongMaterial({
    color: CHANNEL_COLORS.paperShade,
    specular: "#ffffff",
    shininess: 50,
    ...FADING,
  });
  const face = createFaceMaterial(skirt);
  const meshes = [
    new Mesh(buildSlab(DESK.panel, -skirt, DESK.top.bottom + skirt), body),
    new Mesh(buildFace(skirt), face),
    new Mesh(buildSlab(DESK.top, DESK.top.bottom, DESK.top.height), top),
  ];
  // Inside the desk the panel goes first, the front over it, the top last.
  meshes.forEach((mesh, index) => {
    mesh.renderOrder = index;
  });
  const group = new Group();
  group.add(...meshes);
  group.visible = false;
  return { group, materials: [body, face, top] };
}
