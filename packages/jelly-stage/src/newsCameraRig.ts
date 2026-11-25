/**
 * The news camera on the camera of a view: it films the show while it is armed and the show is on
 * air, and hands the camera back exactly as the fitted view left it. A view nobody steers arms it by
 * itself, the map only when the page asks. Its only state is whether it may film: everything it
 * shows is planned anew in every frame by `newsShots.ts`.
 *
 * @module
 */

import type { PerspectiveCamera } from "three";

import type { NewsPose, NewsView } from "./newsCamera.ts";
import type { NewsCast } from "./newsCameraCast.ts";
import type { NewsLive } from "./newsDirector.ts";
import type { FittedView } from "./scene.ts";
import type { ScenePoint } from "./world.ts";

import { planNewsShot, type NewsGaze } from "./newsShots.ts";

/**
 * How a view treats the news: `auto` films a show by itself, for a view nobody steers, `manual`
 * only after the page asked for it, for the map.
 */
export type NewsCameraMode = "auto" | "manual";

/** What a page reads about the news, for a button that starts or ends watching. */
export interface NewsReading {
  /** A show of the Jelly-News is on air. */
  onAir: boolean;
  /** The news camera films it: the view follows the show, not the page. */
  watching: boolean;
}

/** What the news camera keeps between frames. */
export interface NewsRig {
  mode: NewsCameraMode;
  /** It films a show once one is on air. A hand on the camera takes this back for good. */
  armed: boolean;
  onAir: boolean;
  /** It filmed the last frame, so the fitted view still has to come back. */
  filming: boolean;
}

/** What the news camera needs from a frame. */
export interface NewsCameraFrame {
  live: NewsLive | null;
  /** Reads the jellies and the stage. Only called while the camera films. */
  readCast: () => NewsCast;
  reducedMotion: boolean;
}

/** The camera the news camera moves, and the fitted view it returns to. */
export interface RigStage {
  camera: PerspectiveCamera;
  /** Where the fitted camera stands. */
  home: ScenePoint;
  fitted: FittedView;
}

/** Creates the news camera of a view. In `auto` it is armed from the start. */
export function createNewsRig(mode: NewsCameraMode): NewsRig {
  return { mode, armed: mode === "auto", onAir: false, filming: false };
}

/** Returns the pose of the fitted camera, which shows the whole room. */
export function readHomePose(stage: RigStage): NewsPose {
  const { fitted, home } = stage;
  const view = fitted.view?.enabled ? fitted.view : null;
  return {
    position: { x: home.x, y: home.y, z: home.z },
    target: { ...fitted.target },
    fov: fitted.fov,
    lift: view ? view.offsetY / view.fullHeight : 0,
  };
}

/** Puts a camera into a pose. Picking and labels read it right away. */
export function applyNewsPose(camera: PerspectiveCamera, pose: NewsPose): void {
  const { position, target } = pose;
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(target.x, target.y, target.z);
  camera.fov = pose.fov;
  camera.zoom = 1;
  // Only shares count here: width over height keeps the aspect, the offset lifts the picture.
  camera.setViewOffset(camera.aspect, 1, 0, pose.lift, camera.aspect, 1);
  camera.updateMatrixWorld();
}

/** Puts the camera back exactly as `resizeStageScene` left it. The zoom places it from there. */
export function returnToFit(stage: RigStage): void {
  const { camera, fitted } = stage;
  camera.fov = fitted.fov;
  camera.zoom = 1;
  camera.quaternion.copy(fitted.quaternion);
  camera.position.set(stage.home.x, stage.home.y, stage.home.z);
  const { view } = fitted;
  if (view?.enabled) {
    const { fullWidth, fullHeight, offsetX, offsetY, width, height } = view;
    camera.setViewOffset(fullWidth, fullHeight, offsetX, offsetY, width, height);
  } else {
    camera.clearViewOffset();
  }
  camera.updateMatrixWorld();
}

/** Stops filming and puts the fitted view back. */
export function stopFilming(rig: NewsRig, stage: RigStage): void {
  returnToFit(stage);
  rig.filming = false;
}

/**
 * Films a frame of the show when armed and on air and puts the camera there. Returns where the
 * jellies look, null when it does not film.
 */
export function filmNews(
  rig: NewsRig,
  frame: NewsCameraFrame,
  stage: RigStage,
  view: NewsView,
): NewsGaze | null {
  const { live } = frame;
  rig.onAir = live !== null;
  // A page that asked for one show does not lose its camera to the next one by itself.
  if (!live && rig.mode === "manual") rig.armed = false;
  if (!live || !rig.armed) {
    if (rig.filming) stopFilming(rig, stage);
    return null;
  }
  const { show, moment, card } = live;
  const shot = planNewsShot({
    ...frame.readCast(),
    presenterId: show.presenterId,
    home: readHomePose(stage),
    view,
    live: { show, moment, card },
    reducedMotion: frame.reducedMotion,
  });
  applyNewsPose(stage.camera, shot.pose);
  rig.filming = true;
  return shot.gaze;
}

/** Tells whether news are on air and whether the camera films them or will in the next frame. */
export function readNewsRig(rig: NewsRig): NewsReading {
  return { onAir: rig.onAir, watching: rig.armed && rig.onAir };
}
