/**
 * The camera of a running view as a page uses it: zoom, drag, flights to a jelly and the flight out
 * of the own jelly when the view opens. `zoom.ts` holds the view, `flight.ts` the way between two.
 * Without a page that calls these, as on the big stage, the camera shows the whole room, and films
 * the Jelly-News while they are on air (`newsCameraRig.ts`). A hand on the camera ends that.
 *
 * @module
 */

import type { JellySpot } from "./jellies.ts";
import type { ScreenPoint } from "./lens.ts";
import type { NewsView } from "./newsCamera.ts";
import type { NewsGaze } from "./newsShots.ts";
import type { StageScene } from "./scene.ts";
import type { FloorPoint, RoomSize } from "./world.ts";

import { findFloor, readPickView } from "./floorPicking.ts";
import { hasLanded, planFlight, poseAt, type CameraPose, type Flight } from "./flight.ts";
import { keepHalf, type StageInsets } from "./insets.ts";
import {
  createNewsRig,
  filmNews,
  readNewsRig,
  stopFilming,
  type NewsCameraFrame,
  type NewsCameraMode,
  type NewsReading,
  type NewsRig,
} from "./newsCameraRig.ts";
import {
  createZoom,
  findHomeFocus,
  limitFocus,
  measureBounds,
  panBetween,
  placeCamera,
  releasePan,
  stepZoom,
  zoomAt,
  type StageZoom,
  type ZoomStage,
} from "./zoom.ts";

/** A flight to a jelly gets at least this close. */
const FLY_FACTOR = 2.5;
/** The view opens this close to the own jelly and waits this many seconds before it flies out. */
const INTRO = { factor: 3, wait: 0.45 };

/** What the page shows about the camera. */
export interface CameraReading {
  /** The zoom the camera is at or heading to, 1 for the whole room. */
  factor: number;
  /** The own jelly stays in the middle, or will once the flight has landed. */
  followsOwn: boolean;
}

/** What a page can do with the camera of a running view. */
export interface CameraControls {
  /**
   * Zooms by a factor, at most out to the whole room. While the own jelly is followed it stays in
   * the middle, otherwise the floor under `at` stays where it is.
   */
  zoomBy: (factor: number, at?: ScreenPoint) => void;
  /** Zooms toward a point and looks there, which ends following the own jelly. */
  zoomInAt: (at: ScreenPoint, factor: number) => void;
  /** Slides the view so the floor under `from` lies under `to`. Ends following the own jelly. */
  pan: (from: ScreenPoint, to: ScreenPoint) => void;
  /** Ends a drag: the view swings out and springs back into the room. */
  releasePan: () => void;
  /** Flies to the own jelly, closer if needed, and keeps it in the middle. */
  followOwn: () => void;
  /** Flies to a jelly, closer if needed, and stays there. */
  flyTo: (playerId: number) => void;
  /** Starts the next frame close to the own jelly and flies out to the whole room. */
  playIntro: () => void;
  readCamera: () => CameraReading;
  /**
   * Lets the news camera film the show on air, or hands the camera back to the page at once. In
   * `manual` a request holds for the show on air only. Every other control above also hands back.
   */
  watchNews: (on: boolean) => void;
  /** Tells whether news are on air and whether the news camera films them. */
  readNews: () => NewsReading;
}

/** What a frame tells the camera. */
export interface CameraFrame {
  seconds: number;
  spots: JellySpot[];
  ownId: number | null;
  reducedMotion: boolean;
}

/** The camera of a view: the controls for the page and the steps of every frame. */
export interface ViewCamera {
  controls: CameraControls;
  /**
   * Films the news before the jellies move, if the news camera is to, so they sort and turn by the
   * camera of this frame. Returns where the jellies look, null while it does not film.
   */
  film: (frame: NewsCameraFrame) => NewsGaze | null;
  /** Reports whether the news camera holds the camera in this frame. */
  isFilming: () => boolean;
  /** Moves zoom and flights on, after the jellies moved. Does nothing while the news are filmed. */
  update: (frame: CameraFrame) => void;
}

/** The parts of a view the camera works on. Room, lens and bands are read anew, they can change. */
export interface CameraSource {
  stage: Pick<StageScene, "camera" | "home" | "fitted">;
  hall: { size: RoomSize };
  canvas: HTMLCanvasElement;
  lens: { strength: number };
  readInsets: () => StageInsets;
  /** Whether the news camera films by itself, see {@link NewsCameraMode}. */
  newsCamera: NewsCameraMode;
}

/** Where a flight goes: to the own jelly, to another one, or out of the own one at the start. */
type FlightGoal = "own" | "intro" | number;

/** What changes while the camera runs. */
interface CameraMemory {
  zoom: StageZoom;
  /** A flight for the next frame, which knows where the jellies stand. */
  request: FlightGoal | null;
  flight: Flight | null;
  /** Whom the flight keeps up with, null for a fixed goal. */
  chased: number | null;
  /** The camera follows the own jelly once the flight has landed. */
  followsAfter: boolean;
  reducedMotion: boolean;
  news: NewsRig;
}

/** Returns where a jelly stands on the floor. */
function findFeet(spots: JellySpot[], playerId: number | null): FloorPoint | undefined {
  return spots.find((spot) => spot.player.id === playerId)?.feet;
}

/** Stops a flight where it is. The own jelly stays followed if the flight was heading to it. */
function cancelFlight(memory: CameraMemory): void {
  const { zoom } = memory;
  memory.request = null;
  if (!memory.flight) {
    return;
  }
  memory.flight = null;
  zoom.goal = zoom.factor;
  zoom.followsOwn = memory.followsAfter;
}

/** Plans the flight a request asks for, now that the jellies stand somewhere. */
function startFlight(memory: CameraMemory, stage: ZoomStage, frame: CameraFrame): void {
  const goal = memory.request;
  memory.request = null;
  const { zoom } = memory;
  const own = findFeet(frame.spots, frame.ownId);
  if (goal === "intro") {
    if (!own || frame.reducedMotion) return;
    const start: CameraPose = { factor: INTRO.factor, focus: { x: own.x, z: own.z } };
    const whole: CameraPose = { factor: 1, focus: findHomeFocus(stage) };
    memory.flight = planFlight(start, whole, stage.room.width, INTRO.wait);
    Object.assign(memory, { chased: null, followsAfter: true });
  } else {
    const chased = goal === "own" ? frame.ownId : goal;
    const feet = findFeet(frame.spots, chased);
    if (!feet) return;
    const from: CameraPose = { factor: zoom.factor, focus: zoom.focus };
    const to: CameraPose = { factor: Math.max(zoom.goal, FLY_FACTOR), focus: feet };
    memory.flight = planFlight(from, to, stage.room.width);
    Object.assign(memory, { chased, followsAfter: goal === "own" });
  }
  Object.assign(zoom, { followsOwn: false, anchor: null, drag: null });
}

/** Moves a flight one frame on. It keeps up with a walking goal and hands over on landing. */
function stepFlight(memory: CameraMemory, stage: ZoomStage, frame: CameraFrame): void {
  const { zoom, flight } = memory;
  if (!flight) return;
  const chased = memory.chased === null ? undefined : findFeet(frame.spots, memory.chased);
  if (chased) flight.to = { ...flight.to, focus: { x: chased.x, z: chased.z } };
  flight.time = frame.reducedMotion ? flight.seconds : flight.time + frame.seconds;
  const pose = poseAt(flight);
  zoom.factor = pose.factor;
  zoom.goal = flight.to.factor;
  zoom.focus = limitFocus(pose.focus, pose.factor, measureBounds(stage, pose.factor));
  placeCamera(stage, zoom);
  if (hasLanded(flight)) {
    memory.flight = null;
    zoom.followsOwn = memory.followsAfter;
  }
}

/** Reports whether the own jelly is followed now, or will be once the coming flight has landed. */
function willFollow(memory: CameraMemory): boolean {
  if (memory.request !== null) return typeof memory.request !== "number";
  return memory.flight ? memory.followsAfter : memory.zoom.followsOwn;
}

/**
 * The controls for the page. Every way of moving the camera by hand ends the news camera for good
 * and stops a flight first. The fitted view comes back before the control acts, because zoom and
 * drag read the floor from the camera as it stands.
 */
function createControls(
  memory: CameraMemory,
  readStage: () => ZoomStage,
  source: CameraSource,
): CameraControls {
  const { zoom } = memory;
  const takeBack = () => {
    memory.news.armed = false;
    if (!memory.news.filming) return;
    stopFilming(memory.news, source.stage);
    placeCamera(readStage(), zoom);
  };
  const steer = () => {
    takeBack();
    cancelFlight(memory);
  };
  const request = (goal: FlightGoal) => {
    steer();
    memory.request = goal;
  };
  return {
    zoomBy: (factor, at) => {
      steer();
      zoomAt(zoom, readStage(), factor, at);
    },
    zoomInAt: (at, factor) => {
      steer();
      zoom.followsOwn = false;
      zoomAt(zoom, readStage(), factor, at);
    },
    pan: (from, to) => {
      steer();
      panBetween(zoom, readStage(), { from, to, at: performance.now() });
    },
    releasePan: () => releasePan(zoom, source.hall.size, performance.now(), memory.reducedMotion),
    followOwn: () => request("own"),
    flyTo: (playerId) => request(playerId),
    playIntro: () => request("intro"),
    readCamera: () => ({ factor: zoom.goal, followsOwn: willFollow(memory) }),
    watchNews: (on) => {
      if (on) memory.news.armed = true;
      else takeBack();
    },
    readNews: () => readNewsRig(memory.news),
  };
}

/** Returns the picture the news are filmed for: its shape and the band the page leaves free. */
function readNewsView(source: CameraSource): NewsView {
  const { size } = readPickView(source.canvas, source.lens);
  const height = Math.max(1, size.height);
  const insets = keepHalf(size, source.readInsets());
  return {
    aspect: source.stage.camera.aspect,
    top: insets.top / height,
    bottom: (height - insets.bottom) / height,
  };
}

/**
 * Films the news if the news camera is to. A flight gives way to it. When a show ends on its own,
 * its last shot was the whole room, so the page gets the whole room back instead of a jump.
 */
function filmFrame(
  memory: CameraMemory,
  source: CameraSource,
  frame: NewsCameraFrame,
): NewsGaze | null {
  const wasFilming = memory.news.filming;
  const gaze = filmNews(memory.news, frame, source.stage, readNewsView(source));
  if (!wasFilming && memory.news.filming) cancelFlight(memory);
  if (wasFilming && !memory.news.filming && !frame.live) {
    Object.assign(memory.zoom, createZoom(), { followsOwn: memory.zoom.followsOwn });
  }
  return gaze;
}

/** Creates the camera of a view, which starts with the whole room. */
export function createViewCamera(source: CameraSource): ViewCamera {
  const { stage, hall, canvas, lens } = source;
  const memory: CameraMemory = {
    zoom: createZoom(),
    request: null,
    flight: null,
    chased: null,
    followsAfter: true,
    reducedMotion: false,
    news: createNewsRig(source.newsCamera),
  };
  const readStage = (): ZoomStage => {
    const view = readPickView(canvas, lens);
    const { width, height } = view.size;
    const insets = keepHalf(view.size, source.readInsets());
    return {
      ...stage,
      room: hall.size,
      free: { width, top: insets.top, bottom: height - insets.bottom },
      findFloor: (point) => findFloor(stage.camera, point, view),
    };
  };
  return {
    controls: createControls(memory, readStage, source),
    film: (frame) => filmFrame(memory, source, frame),
    isFilming: () => memory.news.filming,
    update: (frame) => {
      memory.reducedMotion = frame.reducedMotion;
      if (memory.news.filming) return;
      const zoomStage = readStage();
      if (memory.request !== null) startFlight(memory, zoomStage, frame);
      if (memory.flight) {
        stepFlight(memory, zoomStage, frame);
        return;
      }
      const own = findFeet(frame.spots, frame.ownId);
      const { seconds, reducedMotion } = frame;
      stepZoom(memory.zoom, zoomStage, { seconds, own, reducedMotion });
    },
  };
}
