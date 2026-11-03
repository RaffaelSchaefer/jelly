/**
 * Das flüssige Glas des Studios: zeichnet Blobs und Popovers als Jelly-Tropfen in die Canvas.
 *
 * Form und Lage kommen aus dem DOM. `Studio.tsx` legt unsichtbare Elemente mit `data-liquid` an,
 * die per CSS schweben, wachsen und auf den Mauszeiger reagieren. Hier wird nur abgelesen, wo sie
 * gerade sind. So liegen die Knöpfe immer genau auf ihrem Tropfen. Der Shader läuft als letztes
 * über das fertige Bild, damit er es brechen kann. Ohne offenes Studio kostet das nichts.
 *
 * @module
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  FramebufferTexture,
  LinearFilter,
  NoBlending,
  ShaderMaterial,
  Vector2,
  Vector4,
  type Mesh,
  type WebGLRenderer,
} from "three";

import { PET_COLORS, shapeGrowth, shapeOnCanvas, type PetColor } from "../pet";
import { cameraAway } from "./CameraRig";
import vertexShader from "./shaders/fullscreen.vert.glsl?raw";
import fragmentShader from "./shaders/liquid.frag.glsl?raw";

/** Namensschild, Fertig-Knopf, vier Blobs und ein Popover, in dieser Reihenfolge im DOM. */
const MAX_SHAPES = 7;

/** Für den Shader: Die ersten beiden Flächen verschmelzen mit nichts. */
const DEFINES = { MAX_SHAPES, SOLO_SHAPES: 2 };

/** Hinter allem anderen in der Szene zeichnen. */
const LAST = 1000;

/** Sekunden, die das Glas zum Erscheinen und zum Verschwinden braucht. */
const APPEAR_SECONDS = 0.7;
const VANISH_SECONDS = 0.3;

/** Wie schnell eine neue Jelly-Farbe ins Glas fließt, pro Sekunde. */
const COLOR_SPEED = 5;

/** Takt bei reduzierter Bewegung. Die Uhr steht dann, Hover und Tippen brauchen trotzdem ein Bild. */
const STILL_REFRESH_MS = 100;

/** Ein Dreieck, das die ganze Canvas abdeckt. Alle teilen es sich. */
const FULLSCREEN = new BufferGeometry().setAttribute(
  "position",
  new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
);

/** Uniforms des Shaders in den Farben von `color`. */
function createUniforms(color: PetColor) {
  const palette = PET_COLORS[color];
  return {
    uBackdrop: { value: null as FramebufferTexture | null },
    uBuffer: { value: new Vector2(1, 1) },
    uCanvas: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uShapes: { value: Array.from({ length: MAX_SHAPES }, () => new Vector4()) },
    uColor: { value: new Color(palette.hex) },
    uGlow: { value: new Color(palette.glow) },
    uInk: { value: new Color(palette.outline) },
  };
}

/** Die Uniforms des Glases. */
type GlassUniforms = ReturnType<typeof createUniforms>;

/**
 * Das Material samt seiner Uniforms. Bewusst nicht als JSX: Fiber kopiert dort jeden
 * Uniform-Eintrag, und ein neu gesetztes `.value` käme nie beim Shader an.
 */
function createGlass(color: PetColor) {
  const uniforms = createUniforms(color);
  const material = new ShaderMaterial({
    defines: DEFINES,
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
 * Was von Bild zu Bild bleibt. Liegt nicht im React-Zustand, das gäbe 30 Renderdurchläufe je
 * Sekunde.
 */
function createFrameState() {
  return {
    /** 0 = verschwunden, 1 = ganz da. */
    presence: 0,
    /** Wo die Flächen zuletzt lagen. Beim Verschwinden gibt es sie im DOM schon nicht mehr. */
    shapes: Array.from({ length: MAX_SHAPES }, () => new Vector4()),
    color: new Color(),
    glow: new Color(),
    ink: new Color(),
    canvas: new Vector2(),
  };
}

/** Kopiert das bisher Gezeichnete in `uBackdrop`, in der aktuellen Größe des Zeichenpuffers. */
function copyBackdrop(renderer: WebGLRenderer, uniforms: GlassUniforms) {
  const buffer = renderer.getDrawingBufferSize(uniforms.uBuffer.value);
  let backdrop = uniforms.uBackdrop.value;
  if (backdrop?.image.width !== buffer.x || backdrop.image.height !== buffer.y) {
    backdrop?.dispose();
    backdrop = new FramebufferTexture(buffer.x, buffer.y);
    backdrop.minFilter = LinearFilter;
    backdrop.magFilter = LinearFilter;
    uniforms.uBackdrop.value = backdrop;
  }
  renderer.copyFramebufferToTexture(backdrop);
}

/** Liest die Lage aller `data-liquid`-Elemente in `stage` in Pixeln auf der Canvas. */
function readShapes(stage: HTMLElement, canvas: HTMLCanvasElement, width: number, out: Vector4[]) {
  const box = canvas.getBoundingClientRect();
  const found = stage.querySelectorAll("[data-liquid]");
  out.forEach((shape, index) => {
    const element = found[index];
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

/**
 * Muss in `<Canvas>` stehen. Bleibt auch ohne Studio dort: So kann das Glas noch verschwinden und
 * das Jelly beim Zurückfahren der Kamera weich auslaufen, wenn das Studio schon zu ist.
 *
 * @param anchors - Das Element mit den Flächen, solange das Studio offen ist.
 */
export default function LiquidGlass({
  color,
  anchors,
  reducedMotion,
}: {
  color: PetColor;
  anchors?: RefObject<HTMLElement | null>;
  reducedMotion: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const mesh = useRef<Mesh>(null);
  const [{ material, uniforms }] = useState(() => createGlass(color));
  const frame = useMemo(createFrameState, []);

  useEffect(
    () => () => {
      material.dispose();
      uniforms.uBackdrop.value?.dispose();
    },
    [material, uniforms],
  );

  useEffect(() => {
    if (!reducedMotion || !anchors) return;
    const timer = window.setInterval(invalidate, STILL_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion, anchors, invalidate]);

  useFrame(({ camera, clock }, delta) => {
    const seconds = anchors ? APPEAR_SECONDS : VANISH_SECONDS;
    const step = (anchors ? delta : -delta) / seconds;
    frame.presence = reducedMotion ? Number(Boolean(anchors)) : frame.presence + step;
    frame.presence = Math.min(1, Math.max(0, frame.presence));
    if (mesh.current) mesh.current.visible = frame.presence > 0 || cameraAway(camera);
    uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
    const palette = PET_COLORS[color];
    const blend = reducedMotion ? 1 : 1 - Math.exp(-COLOR_SPEED * delta);
    uniforms.uColor.value.lerp(frame.color.set(palette.hex), blend);
    uniforms.uGlow.value.lerp(frame.glow.set(palette.glow), blend);
    uniforms.uInk.value.lerp(frame.ink.set(palette.outline), blend);
  });

  // Erst hier, nach allen `useFrame`: Die Anker haben die Flächen dann schon verschoben.
  function beforeRender(renderer: WebGLRenderer) {
    copyBackdrop(renderer, uniforms);
    uniforms.uCanvas.value.copy(renderer.getSize(frame.canvas));
    const stage = anchors?.current;
    if (stage) readShapes(stage, renderer.domElement, frame.canvas.x, frame.shapes);
    frame.shapes.forEach((shape, index) => {
      const growth = shapeGrowth(frame.presence, index);
      uniforms.uShapes.value[index]?.set(shape.x, shape.y, shape.z * growth, shape.w * growth);
    });
    material.uniformsNeedUpdate = true;
  }

  return (
    <mesh
      ref={mesh}
      geometry={FULLSCREEN}
      material={material}
      frustumCulled={false}
      renderOrder={LAST}
      onBeforeRender={beforeRender}
    />
  );
}
