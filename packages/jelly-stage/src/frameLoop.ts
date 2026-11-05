/**
 * The frames of a view: a steady rate, independent of the screen, and a canvas that follows the size
 * of the window.
 *
 * @module
 */

import type { ScreenSize } from "./lens.ts";

import { calculateCanvasDensity } from "./world.ts";

/** Enough for smooth jellies, and the raymarched bodies cost a lot per frame. */
const FRAMES_PER_SECOND = 30;
/** A frame may come this much early, because the screen refresh does not match the rate exactly. */
const FRAME_TOLERANCE_MS = 4;
/** After a hidden tab, the jellies continue instead of jumping. */
const LONGEST_FRAME_SECONDS = 0.1;

/** What the loop calls and how sharp it draws. */
export interface FrameLoopOptions {
  /** Canvas pixels per screen pixel, see `calculateCanvasDensity`. */
  supersampling: number | undefined;
  /** The canvas changed its size or density. */
  onResize: (size: ScreenSize, density: number) => void;
  onFrame: (seconds: number, density: number) => void;
}

/** Adjusts the visible canvas to the window and the pixel density. Returns the size in CSS pixels. */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  density: number,
): ScreenSize {
  const { clientWidth: width, clientHeight: height } = canvas;
  if (canvas.width !== Math.round(width * density)) {
    canvas.width = Math.round(width * density);
  }
  if (canvas.height !== Math.round(height * density)) {
    canvas.height = Math.round(height * density);
  }
  context.setTransform(density, 0, 0, density, 0, 0);
  return { width, height };
}

/** Runs the frames at a steady rate for the life of the page. */
export function startFrameLoop(canvas: HTMLCanvasElement, options: FrameLoopOptions): void {
  let lastFrameAt = performance.now();
  let lastSize = "";
  const tick = (frameAt: number) => {
    requestAnimationFrame(tick);
    if (frameAt - lastFrameAt < 1000 / FRAMES_PER_SECOND - FRAME_TOLERANCE_MS) {
      return;
    }
    const seconds = Math.min(LONGEST_FRAME_SECONDS, (frameAt - lastFrameAt) / 1000);
    lastFrameAt = frameAt;
    const size = { width: canvas.clientWidth, height: canvas.clientHeight };
    const density = calculateCanvasDensity(size, window.devicePixelRatio, options.supersampling);
    if (`${size.width}x${size.height}@${density}` !== lastSize) {
      lastSize = `${size.width}x${size.height}@${density}`;
      options.onResize(size, density);
    }
    options.onFrame(seconds, density);
  };
  requestAnimationFrame(tick);
}
