/**
 * The frames of a view: a rate independent of the screen, and a canvas that follows the size
 * of the window.
 *
 * @module
 */

import type { ScreenSize } from "./lens.ts";

import { createFramePacer, type FrameLimit } from "./framePacing.ts";
import { calculateCanvasDensity } from "./world.ts";

/** After a hidden tab, the jellies continue instead of jumping. Still fits the slowest limit. */
const LONGEST_FRAME_SECONDS = 0.25;

/** What the loop calls and how sharp it draws. */
export interface FrameLoopOptions {
  /** Canvas pixels per screen pixel, see `calculateCanvasDensity`. */
  supersampling: number | undefined;
  /** How many frames per second, see {@link createFramePacer}. */
  frameLimit: FrameLimit | undefined;
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

/**
 * Runs the frames for the life of the page.
 *
 * @returns A function that changes the rate.
 */
export function startFrameLoop(
  canvas: HTMLCanvasElement,
  options: FrameLoopOptions,
): (limit: FrameLimit) => void {
  const pacer = createFramePacer(options.frameLimit);
  let lastFrameAt = performance.now();
  let lastSize = "";
  const tick = (frameAt: number) => {
    requestAnimationFrame(tick);
    if (!pacer.isDue(frameAt)) {
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
  return pacer.setLimit;
}
