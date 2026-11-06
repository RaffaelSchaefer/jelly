/**
 * Das flüssige Glas von Studio, Emotes und Schildern: zeichnet Blobs und Popovers als Tropfen in
 * die Canvas.
 *
 * Form und Lage kommen aus dem DOM. `Studio.tsx`, `EmotePicker.tsx` und `SignPicker.tsx` legen
 * Elemente mit `data-liquid` an, die per CSS schweben, wachsen und auf den Mauszeiger reagieren.
 * Hier wird nur abgelesen, wo sie gerade sind. So liegen die Knöpfe immer genau auf ihrem Tropfen.
 * Der Shader läuft als letztes über das fertige Bild, damit er es brechen kann. Nichts kostet das
 * nur, solange ein Panel die Tropfen am Jelly ausblendet.
 *
 * @module
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Color,
  FramebufferTexture,
  LinearFilter,
  Vector2,
  Vector4,
  type Mesh,
  type WebGLRenderer,
} from "three";

import { PET_COLORS, shapeGrowth, stepPresence, type PetColor } from "../pet";
import { cameraAway } from "./CameraRig";
import { createGlass, FULLSCREEN, readShapes, type GlassUniforms } from "./glassMaterial";

/**
 * Plätze in der Reihenfolge des DOM. Im Studio: Namensschild, Fertig-Knopf, sechs Blobs und ein
 * Popover. Am Jelly: Emote-Tropfen, Emote-Auswahl (geschlossen leer), Karten-Tropfen,
 * Schild-Tropfen, Füllung der Säule und ihre Kapseln, zuletzt die Sprechblase mit ihrem Schwanz.
 * Beim Aufstieg: Kapsel, XP-Tropfen und, falls es sie gibt, die nächste Belohnung. Beim Einstieg:
 * das Ei und die Kapsel, die beide für sich bleiben, dann die Sprechblase mit ihrem Schwanz.
 *
 * Ponytail: Platz für zehn Kapseln, solange die Blase weg ist. Darüber fehlt das Glas, zuerst der
 * Blase, während die Säule zurückläuft. Mehr Plätze kosten jedes Pixel einen Blick mehr, also erst
 * anheben, wenn der Katalog der Schilder so weit wächst.
 */
const MAX_SHAPES = 15;

/** Für den Shader: Die ersten beiden Flächen verschmelzen mit nichts. */
const LAYOUT = { maxShapes: MAX_SHAPES, soloShapes: 2, shadow: 0.3, body: 0.32 };

/** Hinter allem anderen in der Szene zeichnen. */
const LAST = 1000;

/** Wie schnell eine neue Jelly-Farbe ins Glas fließt, pro Sekunde. */
const COLOR_SPEED = 5;

/** Takt bei reduzierter Bewegung. Die Uhr steht dann, Hover und Tippen brauchen trotzdem ein Bild. */
const STILL_REFRESH_MS = 100;

/**
 * Was von Bild zu Bild bleibt. Liegt nicht im React-Zustand, das gäbe 30 Renderdurchläufe je
 * Sekunde.
 */
function createFrameState({ uCalm, uThin }: GlassUniforms) {
  return {
    /** 0 = verschwunden, 1 = ganz da. */
    presence: 0,
    /** Wo die Flächen zuletzt lagen. Beim Verschwinden gibt es sie im DOM schon nicht mehr. */
    shapes: Array.from({ length: MAX_SHAPES }, () => new Vector4()),
    /** Dieselben Felder wie im Shader: Was hier steht, kommt dort an. */
    calm: uCalm.value,
    thin: uThin.value,
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

/**
 * Muss in `<Canvas>` stehen. Bleibt auch ohne Flächen dort: So kann das Glas noch verschwinden und
 * das Jelly beim Zurückfahren der Kamera weich auslaufen, wenn das Studio schon zu ist.
 *
 * @param anchors - Das Element mit den Flächen, solange Studio oder Emote-Tropfen sichtbar sind.
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
  const [{ material, uniforms }] = useState(() => createGlass(color, LAYOUT));
  const frame = useMemo(() => createFrameState(uniforms), [uniforms]);

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
    frame.presence = stepPresence(frame.presence, Boolean(anchors), delta, reducedMotion);
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
    if (stage) readShapes(stage, renderer.domElement, frame.canvas.x, frame);
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
