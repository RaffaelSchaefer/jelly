/**
 * Soft shadows on the floor under jellies and desks. They are drawn right after the floor, so
 * everything standing on them covers them.
 *
 * @module
 */

import {
  Color,
  CustomBlending,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector2,
  Vector3,
  type Object3D,
} from "three";

import fragmentShader from "./shaders/shadow.frag.glsl?raw";
import vertexShader from "./shaders/shadow.vert.glsl?raw";

const SHADOW_COLOR = "#46566a";
/** Just above the cable ducts, so a shadow also falls on them. */
export const SHADOW_HEIGHT = 0.07;
/** Shadows draw after the floor and flat things, before everything standing on them. */
export const SHADOW_ORDER = 2;
/** Blended, but drawn with the solid objects, so it lies under the jellies and desks. */
export const FLOOR_BLENDING = {
  blending: CustomBlending,
  blendSrc: SrcAlphaFactor,
  blendDst: OneMinusSrcAlphaFactor,
  blendSrcAlpha: OneFactor,
  blendDstAlpha: OneMinusSrcAlphaFactor,
  depthWrite: false,
};

/** Shadows lie flat on the floor. */
const SHADOW_TURN = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
/** Reused for every shadow of a crowd, so placing them allocates nothing. */
const SCRATCH = { matrix: new Matrix4(), position: new Vector3(), scale: new Vector3() };

/** Size and look of a shadow, in jelly units. */
export interface ShadowShape {
  halfWidth: number;
  halfDepth: number;
  radius: number;
  softness: number;
  strength: number;
}

/** Returns the edge length of a shadow plane: the rectangle and the soft border around it. */
function measureExtent(half: number, shape: ShadowShape): number {
  return 2 * (half + shape.softness);
}

/** Creates the material of a shadow. Its shape is fixed, so shadows of one shape can share it. */
export function createShadowMaterial(shape: ShadowShape): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(SHADOW_COLOR) },
      uHalfSize: { value: new Vector2(shape.halfWidth, shape.halfDepth) },
      uExtent: {
        value: new Vector2(
          measureExtent(shape.halfWidth, shape),
          measureExtent(shape.halfDepth, shape),
        ),
      },
      uRadius: { value: shape.radius },
      uSoftness: { value: shape.softness },
      uStrength: { value: shape.strength },
    },
    vertexShader,
    fragmentShader,
    ...FLOOR_BLENDING,
  });
}

/** Creates the flat plane of a shadow, lying in the xy plane like every `PlaneGeometry`. */
export function createShadowGeometry(shape: ShadowShape): PlaneGeometry {
  return new PlaneGeometry(
    measureExtent(shape.halfWidth, shape),
    measureExtent(shape.halfDepth, shape),
  );
}

/** Creates a shadow lying on the floor, centered on the origin of its mesh. */
export function createShadow(shape: ShadowShape): Mesh {
  const shadow = new Mesh(createShadowGeometry(shape), createShadowMaterial(shape));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = SHADOW_HEIGHT;
  shadow.renderOrder = SHADOW_ORDER;
  return shadow;
}

/**
 * Creates up to `capacity` shadows of one shape as a single mesh. Their matrices place them on
 * the floor, `count` says how many are shown. Nothing is culled: the shadows move every frame.
 */
export function createShadowInstances(shape: ShadowShape, capacity: number): InstancedMesh {
  const shadows = new InstancedMesh(
    createShadowGeometry(shape),
    createShadowMaterial(shape),
    capacity,
  );
  shadows.count = 0;
  shadows.instanceMatrix.setUsage(DynamicDrawUsage);
  shadows.frustumCulled = false;
  shadows.renderOrder = SHADOW_ORDER;
  return shadows;
}

/** Frees what a shadow holds. */
export function disposeShadow(shadow: Mesh): void {
  shadow.geometry.dispose();
  (shadow.material as ShaderMaterial).dispose();
  if (shadow instanceof InstancedMesh) shadow.dispose();
}

/** Shadows of many things of one shape, in one mesh that is replaced when it gets too small. */
export interface ShadowCrowd {
  root: Object3D;
  shape: ShadowShape;
  mesh: InstancedMesh;
}

/** Where one shadow of a crowd lies, and its size relative to the shape. */
export interface ShadowSpot {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/** Creates room for `capacity` shadows under `root`. */
export function createShadowCrowd(
  root: Object3D,
  shape: ShadowShape,
  capacity: number,
): ShadowCrowd {
  const mesh = createShadowInstances(shape, capacity);
  root.add(mesh);
  return { root, shape, mesh };
}

/** Lays one shadow flat on the floor for each item, where `find` puts it. */
export function placeShadowCrowd<Item>(
  crowd: ShadowCrowd,
  items: Item[],
  find: (item: Item, spot: ShadowSpot) => void,
): void {
  if (items.length > crowd.mesh.instanceMatrix.count) {
    crowd.root.remove(crowd.mesh);
    disposeShadow(crowd.mesh);
    crowd.mesh = createShadowInstances(crowd.shape, 2 * items.length);
    crowd.root.add(crowd.mesh);
  }
  const { matrix, position, scale } = SCRATCH;
  const spot: ShadowSpot = { x: 0, y: 0, z: 0, scale: 1 };
  items.forEach((item, index) => {
    find(item, spot);
    position.set(spot.x, spot.y, spot.z);
    scale.setScalar(spot.scale);
    crowd.mesh.setMatrixAt(index, matrix.compose(position, SHADOW_TURN, scale));
  });
  crowd.mesh.count = items.length;
  crowd.mesh.instanceMatrix.needsUpdate = true;
}
