/**
 * Das Material des flüssigen Glases, ohne React: Am Jelly führt es `LiquidGlass.tsx` durch die
 * Szene, auf der Karte `map/glass.ts` über eine eigene Canvas.
 *
 * @module
 */

import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector4,
  type Texture,
} from "three";

import { PET_COLORS, shapeOnCanvas, type PetColor } from "../pet";
import vertexShader from "./shaders/fullscreen.vert.glsl?raw";
import fragmentShader from "./shaders/liquid.frag.glsl?raw";

/** Ein Dreieck, das die ganze Canvas abdeckt. Alle teilen es sich. */
export const FULLSCREEN = new BufferGeometry().setAttribute(
  "position",
  new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
);

/** Wie viele Flächen der Shader kennt. Jede kostet jedes Pixel einen Blick mehr. */
export interface GlassLayout {
  maxShapes: number;
  /** Die ersten so vielen Flächen verschmelzen mit nichts. */
  soloShapes: number;
  /** Wie dunkel der Schatten unter den Tropfen ist, von 0 bis 1. */
  shadow: number;
  /** Wie viel Jelly-Farbe in der Mitte eines Tropfens steckt, von 0 bis 1. Der Rest scheint durch. */
  body: number;
}

/** Uniforms des Shaders in den Farben von `color`. */
function createUniforms(color: PetColor, maxShapes: number) {
  const palette = PET_COLORS[color];
  return {
    uBackdrop: { value: null as Texture<{ width: number; height: number }> | null },
    uBuffer: { value: new Vector2(1, 1) },
    uCanvas: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uShapes: { value: Array.from({ length: maxShapes }, () => new Vector4()) },
    uCalm: { value: Array.from({ length: maxShapes }, () => 0) },
    uColor: { value: new Color(palette.hex) },
    uGlow: { value: new Color(palette.glow) },
    uInk: { value: new Color(palette.outline) },
  };
}

/** Die Uniforms des Glases. */
export type GlassUniforms = ReturnType<typeof createUniforms>;

/**
 * Das Material samt seiner Uniforms. Bewusst nicht als JSX: Fiber kopiert dort jeden
 * Uniform-Eintrag, und ein neu gesetztes `.value` käme nie beim Shader an.
 */
export function createGlass(color: PetColor, { maxShapes, soloShapes, shadow, body }: GlassLayout) {
  const uniforms = createUniforms(color, maxShapes);
  const material = new ShaderMaterial({
    defines: {
      MAX_SHAPES: maxShapes,
      SOLO_SHAPES: soloShapes,
      SHADOW: shadow.toFixed(2),
      BODY_CENTER: body.toFixed(2),
    },
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
  return { material, uniforms };
}

/**
 * Liest die Lage aller `data-liquid`-Elemente in `stage` in Pixeln auf der Canvas und merkt sich in
 * `calm`, welche davon `data-liquid="calm"` tragen und sich deshalb kaum verformen.
 */
export function readShapes(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  width: number,
  { shapes, calm }: { shapes: Vector4[]; calm: number[] },
) {
  const box = canvas.getBoundingClientRect();
  const found = stage.querySelectorAll("[data-liquid]");
  shapes.forEach((shape, index) => {
    const element = found[index];
    calm[index] = element?.getAttribute("data-liquid") === "calm" ? 1 : 0;
    if (!element) {
      shape.setScalar(0);
      return;
    }
    const { x, y, halfWidth, halfHeight } = shapeOnCanvas(
      element.getBoundingClientRect(),
      box,
      width,
    );
    shape.set(x, y, halfWidth, halfHeight);
  });
}
