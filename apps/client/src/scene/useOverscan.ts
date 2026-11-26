/**
 * Wie weit die Canvas über ihren Kasten ragt. Bei einem kleinen Jelly ragt sie weiter über als
 * {@link CANVAS_OVERSCAN}, damit das Glas um das Jelly Platz hat (siehe `pet/layout.ts`). Der Wert
 * kommt als `--canvas-overscan` aus `App.tsx` und gilt per CSS auch für die Lage der Canvas.
 *
 * @module
 */

import { useThree } from "@react-three/fiber";
import { useMemo } from "react";
import { MathUtils } from "three";

import { CANVAS_OVERSCAN } from "../pet";

/** Öffnungswinkel, auf den die Bühnengeometrie in `pet/layout.ts` abgestimmt ist. */
const STAGE_FOV = 34;

/** Derselbe Bildausschnitt in der größeren Canvas: Das Pet bleibt gleich groß und am selben Ort. */
export function overscanFov(overscan: number) {
  return MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(STAGE_FOV / 2)) * overscan));
}

/**
 * Lage der Canvas in ihrem Kasten. Klicks gehen an ihr vorbei. Fiber würde sonst eine Position und
 * volle Größe setzen.
 */
export const OVERSCAN_STYLE = {
  position: "absolute",
  inset: `calc((1 - var(--canvas-overscan, ${CANVAS_OVERSCAN})) * 50%)`,
  width: "auto",
  height: "auto",
  pointerEvents: "none",
} as const;

/**
 * Muss in `<Canvas>` stehen. Liest den Überstand neu, sobald sich die Größe der Canvas ändert: Mit
 * dem Überstand ändert sich immer auch ihre Größe.
 */
export function useOverscan() {
  const size = useThree((state) => state.size);
  const canvas = useThree((state) => state.gl.domElement);
  return useMemo(() => readOverscan(canvas), [canvas, size]);
}

/** Der Überstand, wie er per CSS an der Canvas ankommt. */
function readOverscan(canvas: HTMLCanvasElement) {
  const value = Number(getComputedStyle(canvas).getPropertyValue("--canvas-overscan"));
  return value > 0 ? value : CANVAS_OVERSCAN;
}
