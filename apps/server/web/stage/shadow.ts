/**
 * Soft shadows on the floor under jellies and desks. They are drawn right after the floor, so
 * everything standing on them covers them.
 *
 * @module
 */

import {
  Color,
  CustomBlending,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector2,
} from "three";

import fragmentShader from "./shaders/shadow.frag.glsl?raw";
import vertexShader from "./shaders/shadow.vert.glsl?raw";

const SHADOW_COLOR = "#46566a";
/** Just above the cable ducts, so a shadow also falls on them. */
export const SHADOW_HEIGHT = 0.07;
const SHADOW_ORDER = 2;

/** Size and look of a shadow, in jelly units. */
export interface ShadowShape {
  halfWidth: number;
  halfDepth: number;
  radius: number;
  softness: number;
  strength: number;
}

/** Creates a shadow lying on the floor, centered on the origin of its mesh. */
export function createShadow(shape: ShadowShape): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(SHADOW_COLOR) },
      uHalfSize: { value: new Vector2(shape.halfWidth, shape.halfDepth) },
      uRadius: { value: shape.radius },
      uSoftness: { value: shape.softness },
      uStrength: { value: shape.strength },
    },
    vertexShader,
    fragmentShader,
    // Blended, but drawn with the solid objects, so it lies under the jellies and desks.
    blending: CustomBlending,
    blendSrc: SrcAlphaFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    depthWrite: false,
  });
  const size = (half: number) => 2 * (half + shape.softness);
  const shadow = new Mesh(
    new PlaneGeometry(size(shape.halfWidth), size(shape.halfDepth)),
    material,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = SHADOW_HEIGHT;
  shadow.renderOrder = SHADOW_ORDER;
  return shadow;
}

/** Frees what a shadow holds. */
export function disposeShadow(shadow: Mesh): void {
  shadow.geometry.dispose();
  (shadow.material as ShaderMaterial).dispose();
}
