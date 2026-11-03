/**
 * Draws the finished stage picture a second time through the fisheye lens. The first picture is
 * copied from the screen, so tone mapping and colors stay exactly as rendered.
 *
 * @module
 */

import {
  FramebufferTexture,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  type WebGLRenderer,
} from "three";

import fragmentShader from "./shaders/lens.frag.glsl?raw";
import vertexShader from "./shaders/lens.vert.glsl?raw";

/** The second pass of the lens: a quad over the whole screen showing the copied picture. */
export interface LensPass {
  strength: number;
  scene: Scene;
  camera: OrthographicCamera;
  material: ShaderMaterial;
  picture: FramebufferTexture | null;
  drawingBuffer: Vector2;
}

/** Creates the pass. With strength 0 it does nothing and costs nothing. */
export function createLensPass(strength: number): LensPass {
  const material = new ShaderMaterial({
    uniforms: {
      uPicture: { value: null },
      uHalfExtent: { value: new Vector2(1, 1) },
      uStrength: { value: strength },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  return {
    strength,
    scene,
    camera: new OrthographicCamera(),
    material,
    picture: null,
    drawingBuffer: new Vector2(),
  };
}

/** Keeps the copy as large as the drawing buffer and the lens as wide as the screen. */
function preparePicture(lens: LensPass, renderer: WebGLRenderer): FramebufferTexture {
  renderer.getDrawingBufferSize(lens.drawingBuffer);
  const { x: width, y: height } = lens.drawingBuffer;
  let picture = lens.picture;
  if (!picture || picture.image.width !== width || picture.image.height !== height) {
    picture?.dispose();
    picture = new FramebufferTexture(width, height);
    picture.minFilter = LinearFilter;
    picture.magFilter = LinearFilter;
    lens.picture = picture;
    // Half extents over half the diagonal, which is the same as full extents over the diagonal.
    const diagonal = Math.hypot(width, height);
    lens.material.uniforms.uHalfExtent?.value.set(width / diagonal, height / diagonal);
    if (lens.material.uniforms.uPicture) lens.material.uniforms.uPicture.value = picture;
  }
  return picture;
}

/** Bends the picture that was just rendered to the screen. */
export function applyLens(lens: LensPass, renderer: WebGLRenderer): void {
  if (lens.strength <= 0) {
    return;
  }
  renderer.copyFramebufferToTexture(preparePicture(lens, renderer));
  renderer.render(lens.scene, lens.camera);
}
