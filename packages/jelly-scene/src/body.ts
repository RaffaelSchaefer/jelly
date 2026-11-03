/**
 * Körper, Kopf und Hände des Jellys als ein einziges geraymarchtes Jelly.
 *
 * Gezeichnet wird ein unsichtbarer Kasten um das ganze Jelly. Der Fragment-Shader
 * (`shaders/jelly.frag.glsl`) sucht darin per Raymarching die Oberfläche, an der die Teile weich
 * ineinanderfließen. Gesicht und Cosmetics sind normale Meshes darüber.
 *
 * @module
 */

import {
  BoxGeometry,
  Color,
  CustomBlending,
  MathUtils,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PerspectiveCamera,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type Object3D,
  type WebGLRenderer,
} from "three";

import type { JellyPalette } from "./colors.ts";

import { HAND, HEAD } from "./jellyGeometry.ts";
import fragmentShader from "./shaders/jelly.frag.glsl?raw";
import vertexShader from "./shaders/jelly.vert.glsl?raw";

/** Wie viel vom Hintergrund dort durchscheint, wo das Jelly dünn ist (0 = undurchsichtig). */
const CLARITY = 0.3;

/**
 * Alles, was das Jelly erreichen kann: weit ausgestreckte Hände, der wippende Kopf, die Outline.
 * Alle Jellies teilen sich diesen Kasten.
 */
const BOUNDS = new BoxGeometry(3.3, 2.7, 1.7).translate(0, 0.16, 0.03);
/**
 * Derselbe Kasten ohne die Hände. Meist sind sie eingezogen, und jedes Pixel des Kastens kostet
 * einen Raymarch, auch wo nur Hintergrund ist.
 */
const BOUNDS_WITHOUT_HANDS = new BoxGeometry(2.0, 2.7, 1.7).translate(0, 0.16, 0.03);

/** Die Teile, deren Lage der Shader pro Bild übernimmt. Sie liegen neben dem Körper im Jelly. */
export interface BodyParts {
  head: Object3D;
  hands: Object3D[];
}

/** Uniforms des Shaders. Als eigener Typ, damit jeder Zugriff ohne Index-Signatur typsicher ist. */
function createUniforms() {
  return {
    uModel: { value: new Matrix4() },
    uInvModel: { value: new Matrix4() },
    uViewProj: { value: new Matrix4() },
    uCamObj: { value: new Vector3() },
    uHead: { value: new Vector3(HEAD.x, HEAD.y, HEAD.z) },
    uTilt: { value: new Vector2(1, 0) },
    uHands: { value: [new Vector4(), new Vector4()] },
    uColor: { value: new Color() },
    uGlow: { value: new Color() },
    uInk: { value: new Color() },
    uPixel: { value: 0.01 },
    uClarity: { value: CLARITY },
  };
}

/** Die Uniforms eines Jellys. */
type JellyUniforms = ReturnType<typeof createUniforms>;

/** Erzeugt das Shader-Material. Die Uniforms füllt {@link updateUniforms} vor jedem Bild. */
function createJellyMaterial(uniforms: JellyUniforms) {
  return new ShaderMaterial({
    defines: {
      // Halbachsen des Kopf-Ellipsoids, siehe HEAD in jellyGeometry.ts.
      HEAD_R: `vec3(${HEAD.radius.toFixed(3)}, ${HEAD.radius.toFixed(3)}, ${(HEAD.radius * HEAD.depth).toFixed(3)})`,
    },
    uniforms,
    vertexShader,
    fragmentShader,
    // Mit Alpha gemischt, aber zusammen mit den undurchsichtigen Meshes gezeichnet, damit Gesicht
    // und Cosmetics trotzdem obenauf liegen.
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  });
}

/** Was {@link updateUniforms} pro Bild braucht. */
interface FrameInput {
  mesh: Mesh;
  uniforms: JellyUniforms;
  renderer: WebGLRenderer;
  camera: Camera;
  parts: BodyParts;
  drawingBuffer: Vector2;
}

/**
 * Überträgt Kamera, Kopf und Hände in die Uniforms. Läuft in `onBeforeRender`, also nach der
 * Animation: Kopf und Hände stehen dann schon dort, wo sie hingesetzt wurden.
 */
function updateUniforms({ mesh, uniforms: u, renderer, camera, parts, drawingBuffer }: FrameInput) {
  u.uModel.value.copy(mesh.matrixWorld);
  u.uInvModel.value.copy(mesh.matrixWorld).invert();
  u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  u.uCamObj.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(u.uInvModel.value);
  u.uHead.value.copy(parts.head.position);
  u.uTilt.value.set(Math.cos(parts.head.rotation.z), Math.sin(parts.head.rotation.z));
  parts.hands.forEach((hand, index) => {
    // Radius 0 schaltet eine versteckte Hand im Shader ab.
    const radius = hand.visible ? HAND.radius * hand.scale.x : 0;
    u.uHands.value[index]?.set(hand.position.x, hand.position.y, hand.position.z, radius);
  });
  // Größe eines Bildschirmpixels pro Abstandseinheit, für eine gleich breite Kantenglättung.
  renderer.getDrawingBufferSize(drawingBuffer);
  const fov = MathUtils.degToRad((camera as PerspectiveCamera).fov);
  u.uPixel.value = (2 * Math.tan(fov / 2)) / drawingBuffer.y;
}

/**
 * Das Jelly in den Farben `palette`. Liegt in der Wurzel des Jellys neben Kopf und Händen und liest
 * deren Lage aus `parts`. Die Kamera muss eine `PerspectiveCamera` sein.
 */
export function createJellyBody(palette: JellyPalette, parts: BodyParts): Mesh {
  const uniforms = createUniforms();
  uniforms.uColor.value.set(palette.hex);
  uniforms.uGlow.value.set(palette.glow);
  uniforms.uInk.value.set(palette.outline);
  const material = createJellyMaterial(uniforms);
  const mesh = new Mesh(BOUNDS, material);
  const drawingBuffer = new Vector2();
  mesh.onBeforeRender = (renderer, _scene, camera) => {
    mesh.geometry = parts.hands.some((hand) => hand.visible) ? BOUNDS : BOUNDS_WITHOUT_HANDS;
    updateUniforms({ mesh, uniforms, renderer, camera, parts, drawingBuffer });
    material.uniformsNeedUpdate = true;
  };
  return mesh;
}
