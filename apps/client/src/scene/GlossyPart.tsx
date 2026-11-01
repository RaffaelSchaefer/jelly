/**
 * Ein Mesh im glänzenden Toon-Look mit Tinten-Outline. Wird für Cosmetics verwendet.
 *
 * @module
 */

import { useMemo } from "react";
import { BackSide, BufferGeometry, Color, Vector2 } from "three";

import outlineFragmentShader from "./shaders/outline.frag.glsl?raw";
import outlineVertexShader from "./shaders/outline.vert.glsl?raw";
import fragmentShader from "./shaders/toon.frag.glsl?raw";
import vertexShader from "./shaders/toon.vert.glsl?raw";

/** Breite der Outline in Szenen-Einheiten. */
const OUTLINE = 0.035;

/** Farben eines Teils als CSS-Hex-Strings. */
export interface Paint {
  /** Grundfarbe. */
  hex: string;
  /** Leuchten von unten. */
  glow: string;
  /** Outline. */
  outline: string;
}

/** Eigenschaften von {@link GlossyPart}. */
interface GlossyPartProps {
  geometry: BufferGeometry;
  paint: Paint;
  /** Y-Bereich des Teils `[unten, oben]`. Unten leuchtet es voll, oben ist es Grundfarbe. */
  range: readonly [number, number];
  /**
   * Zeichenebene. Ebenen über 0 löschen vorher den Tiefenpuffer und liegen dann wie ein Sticker
   * über allem, was vorher gezeichnet wurde.
   */
  layer?: number;
}

/** Zeichnet `geometry` zweimal: erst die Outline von hinten, dann das glänzende Teil. */
export default function GlossyPart({ geometry, paint, range, layer = 0 }: GlossyPartProps) {
  const outlineUniforms = useMemo(
    () => ({ uWidth: { value: OUTLINE }, uInk: { value: new Color(paint.outline) } }),
    [paint.outline],
  );
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(paint.hex) },
      uGlow: { value: new Color(paint.glow) },
      uGlowRange: { value: new Vector2(range[0], range[1]) },
    }),
    [paint.hex, paint.glow, range],
  );
  return (
    <>
      {/* Ebenen über 0 löschen zuerst die Tiefe, damit sie ihre volle Outline behalten, statt
          im Pet zu versinken. */}
      <mesh
        geometry={geometry}
        renderOrder={layer * 2}
        onBeforeRender={layer > 0 ? (gl) => gl.clearDepth() : undefined}
      >
        <shaderMaterial
          side={BackSide}
          uniforms={outlineUniforms}
          vertexShader={outlineVertexShader}
          fragmentShader={outlineFragmentShader}
        />
      </mesh>
      <mesh geometry={geometry} renderOrder={layer * 2 + 1}>
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
        />
      </mesh>
    </>
  );
}
