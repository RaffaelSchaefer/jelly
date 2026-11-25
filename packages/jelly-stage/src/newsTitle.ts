/**
 * The 3D opening title of the Jelly-News in a view: a globe with orbit rings and the logo of the
 * channel, flying in on the band the opening title of `newsBarBumper.ts` sweeps over the picture.
 * The view paints it last, after the texts and the television look: so names of jellies never show
 * through it, and the band of the logo, which comes last and leaves first, wipes it in and out.
 *
 * The scene renders into the canvas of the stage renderer once the room is copied out of it, on a
 * ground of its own, and is copied onto the picture inside the band. Its model loads with the view.
 * Until it is there the flat logo stands in, or the band stays empty while a screen that has just
 * started waits for it, see `newsTitleOpener.ts`.
 *
 * @module
 */

import { loadModelParts } from "@jelly/scene";
import { Vector2, type WebGLRenderer } from "three";

import type { Rect } from "./newsBarLayout.ts";

import { drawFlatLogo, drawTagline, measureStill, traceLogoBand } from "./newsBarBumper.ts";
import titleModel from "./newsTitle.glb?url&inline";
import { fitTitle, type TitleFit } from "./newsTitleLayout.ts";
import { poseTitle } from "./newsTitleMotion.ts";
import {
  chooseMode,
  findOpener,
  type Opener,
  type OpenerFrame,
  type OpenerState,
} from "./newsTitleOpener.ts";
import { buildTitleScene, poseTitleScene, type TitleScene } from "./newsTitleScene.ts";

/** The line under the logo rises into place by this share of its size. */
const TAGLINE_RISE = 0.6;
/** It is at most this share of the free width wide. */
const TAGLINE_WIDTH = 0.8;

/** The 3D title of a view. */
export interface NewsTitle extends OpenerState {
  renderer: WebGLRenderer;
  /** The scene once the model is there and its shaders are built, null until then. */
  scene: TitleScene | null;
}

/**
 * Creates the title of a view and starts to load its model. Unless it is `wanted`, the logo of the
 * opening title stands in for good.
 */
export function createNewsTitle(renderer: WebGLRenderer, wanted: boolean): NewsTitle {
  const title: NewsTitle = {
    renderer,
    scene: null,
    ready: false,
    failed: !wanted,
    bornAt: Date.now(),
    opener: { key: "", mode: null },
  };
  if (!wanted) return title;
  loadModelParts(titleModel)
    .then(async (parts) => {
      const scene = buildTitleScene(parts);
      // Built before the first opening title needs them, its shaders never stall a frame.
      await renderer.compileAsync(scene.scene, scene.camera);
      title.scene = scene;
      title.ready = true;
    })
    .catch((error: unknown) => {
      console.warn("news title: the 3D title could not be loaded", error);
      title.failed = true;
    });
  return title;
}

/** Paints the line under the logo, rising into place below the plates. */
function drawLine(context: CanvasRenderingContext2D, free: Rect, fit: TitleFit, shown: number) {
  if (shown <= 0) return;
  const size = fit.taglineSize * free.height;
  const y = free.y + fit.taglineY * free.height + (1 - shown) * size * TAGLINE_RISE;
  context.save();
  context.globalAlpha *= shown;
  drawTagline(context, { x: free.x + free.width / 2, y }, size, free.width * TAGLINE_WIDTH);
  context.restore();
}

/** Renders the title in its pose and copies it onto the picture. */
function drawScene(
  context: CanvasRenderingContext2D,
  title: NewsTitle,
  scene: TitleScene,
  frame: Opener & OpenerFrame,
) {
  const { free, progress, length, reducedMotion } = frame.bumper;
  const { size } = frame;
  const pose = poseTitle(progress, length, reducedMotion);
  const fit = fitTitle(free.width / free.height);
  const buffer = title.renderer.getDrawingBufferSize(new Vector2());
  const pixelRatio = buffer.x / Math.max(1, size.width);
  poseTitleScene(scene, pose, { size, free, distance: fit.distance * pose.dolly, pixelRatio });
  // The room is copied out already, its canvas takes the title now.
  title.renderer.render(scene.scene, scene.camera);
  context.drawImage(title.renderer.domElement, 0, 0, size.width, size.height);
  drawLine(context, free, fit, pose.tagline);
}

/**
 * Paints the logo of an opening title on air over the picture, inside the band of the logo: the
 * 3D title, or the flat logo standing in for it. Nothing in all other frames, and nothing while a
 * screen that has just started waits for the model.
 */
export function paintNewsTitle(
  title: NewsTitle,
  context: CanvasRenderingContext2D,
  frame: OpenerFrame,
): void {
  const opener = findOpener(frame);
  if (!opener) return;
  const mode = chooseMode(title, opener.key, frame.now);
  if (mode === "wait") return;
  const { bumper } = opener;
  context.save();
  context.globalAlpha *= opener.alpha;
  if (traceLogoBand(context, bumper)) {
    context.clip();
    if (bumper.reducedMotion) context.globalAlpha *= measureStill(bumper.progress);
    if (mode === "3d" && title.scene) {
      drawScene(context, title, title.scene, { ...frame, ...opener });
    } else {
      drawFlatLogo(context, bumper);
    }
  }
  context.restore();
}
