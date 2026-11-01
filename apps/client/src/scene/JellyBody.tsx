/**
 * Körper, Kopf und Hände des Pets als ein einziges geraymarchtes Jelly.
 *
 * Gezeichnet wird ein unsichtbarer Kasten um das ganze Pet. Der Fragment-Shader
 * (`shaders/jelly.frag.glsl`) sucht darin per Raymarching die Oberfläche, an der die Teile weich
 * ineinanderfließen. Gesicht und Cosmetics sind normale Meshes darüber.
 *
 * @module
 */

import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  BoxGeometry,
  Camera,
  Color,
  CustomBlending,
  Group,
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
  WebGLRenderer,
} from "three";

import { PET_COLORS, type PetColor } from "../pet";
import { HAND, HEAD } from "./jellyGeometry";
import fragmentShader from "./shaders/jelly.frag.glsl?raw";
import vertexShader from "./shaders/jelly.vert.glsl?raw";

/** Wie viel vom Desktop dort durchscheint, wo das Jelly dünn ist (0 = undurchsichtig). */
const CLARITY = 0.3;

/** Erzeugt das Shader-Material. Die Uniforms füllt {@link updateUniforms} vor jedem Bild. */
function createJellyMaterial() {
  return new ShaderMaterial({
    defines: {
      // Halbachsen des Kopf-Ellipsoids, siehe HEAD in jellyGeometry.ts.
      HEAD_R: `vec3(${HEAD.radius.toFixed(3)}, ${HEAD.radius.toFixed(3)}, ${(HEAD.radius * HEAD.depth).toFixed(3)})`,
    },
    uniforms: {
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
    },
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
  material: ShaderMaterial;
  renderer: WebGLRenderer;
  camera: Camera;
  head: Group | null;
  hands: (Group | null)[];
  drawingBuffer: Vector2;
}

/**
 * Überträgt Kamera, Kopf und Hände in die Uniforms. Läuft in `onBeforeRender`, also nach jedem
 * `useFrame`: Kopf und Hände stehen dann schon dort, wo die Animation sie hingesetzt hat.
 */
function updateUniforms({
  mesh,
  material,
  renderer,
  camera,
  head,
  hands,
  drawingBuffer,
}: FrameInput) {
  const u = material.uniforms;
  u.uModel.value.copy(mesh.matrixWorld);
  u.uInvModel.value.copy(mesh.matrixWorld).invert();
  u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  u.uCamObj.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(u.uInvModel.value);
  if (head) {
    u.uHead.value.copy(head.position);
    u.uTilt.value.set(Math.cos(head.rotation.z), Math.sin(head.rotation.z));
  }
  hands.forEach((hand, index) => {
    if (!hand) return;
    // Radius 0 schaltet eine versteckte Hand im Shader ab.
    const radius = hand.visible ? HAND.radius * hand.scale.x : 0;
    u.uHands.value[index].set(hand.position.x, hand.position.y, hand.position.z, radius);
  });
  // Größe eines Bildschirmpixels pro Abstandseinheit, für eine gleich breite Kantenglättung.
  renderer.getDrawingBufferSize(drawingBuffer);
  const fov = MathUtils.degToRad((camera as PerspectiveCamera).fov);
  u.uPixel.value = (2 * Math.tan(fov / 2)) / drawingBuffer.y;
  material.uniformsNeedUpdate = true;
}

/** Eigenschaften von {@link JellyBody}. */
interface JellyBodyProps {
  /** Farbvariante des Pets. */
  color: PetColor;
  /** Kopf-Gruppe, die die Animation bewegt. Das Jelly folgt ihr. */
  head: RefObject<Group | null>;
  /** Die zwei Hand-Gruppen, die die Animation ein- und ausfährt. */
  hands: RefObject<(Group | null)[]>;
}

/** Das Jelly. Liegt in der Wurzelgruppe des Pets und liest Kopf und Hände aus der Animation. */
export default function JellyBody({ color, head, hands }: JellyBodyProps) {
  const mesh = useRef<Mesh>(null);
  // Alles, was das Jelly erreichen kann: weit ausgestreckte Hände, der wippende Kopf, die Outline.
  const geometry = useMemo(() => new BoxGeometry(3.3, 2.7, 1.7).translate(0, 0.16, 0.03), []);
  const material = useMemo(createJellyMaterial, []);
  const drawingBuffer = useMemo(() => new Vector2(), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    const u = material.uniforms;
    const paint = PET_COLORS[color];
    u.uColor.value.set(paint.hex);
    u.uGlow.value.set(paint.glow);
    u.uInk.value.set(paint.outline);
  }, [color, material]);

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      onBeforeRender={(renderer, _scene, camera) => {
        if (!mesh.current) return;
        updateUniforms({
          mesh: mesh.current,
          material,
          renderer,
          camera,
          head: head.current,
          hands: hands.current,
          drawingBuffer,
        });
      }}
    />
  );
}
