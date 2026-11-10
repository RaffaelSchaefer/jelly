/**
 * The camera of a running view as a page uses it: zoom, drag, flights to a jelly and the flight out
 * of the own jelly when the view opens. `zoom.ts` holds the view, `flight.ts` the way between two.
 * Without a page that calls these, as on the big stage, the camera shows the whole room.
 *
 * @module
 */

import type { JellySpot } from "./jellies.ts";
import type { ScreenPoint } from "./lens.ts";
import type { FloorPoint, RoomSize } from "./world.ts";

import { findFloor, readPickView } from "./floorPicking.ts";
import { hasLanded, planFlight, poseAt, type CameraPose, type Flight } from "./flight.ts";
import { keepHalf, type StageInsets } from "./insets.ts";
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
}

/** What a frame tells the camera. */
export interface CameraFrame {
  seconds: number;
  spots: JellySpot[];
  ownId: number | null;
  reducedMotion: boolean;
}

/** The camera of a view: the controls for the page and a step for every frame. */
export interface ViewCamera {
  controls: CameraControls;
  update: (frame: CameraFrame) => void;
}

/** The parts of a view the camera works on. Room, lens and bands are read anew, they can change. */
export interface CameraSource {
  stage: Pick<ZoomStage, "camera" | "home">;
  hall: { size: RoomSize };
  canvas: HTMLCanvasElement;
  lens: { strength: number };
  readInsets: () => StageInsets;
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

/** The controls for the page. Every way of moving the camera by hand stops a flight first. */
function createControls(
  memory: CameraMemory,
  readStage: () => ZoomStage,
  room: { size: RoomSize },
): CameraControls {
  const { zoom } = memory;
  const request = (goal: FlightGoal) => {
    cancelFlight(memory);
    memory.request = goal;
  };
  return {
    zoomBy: (factor, at) => {
      cancelFlight(memory);
      zoomAt(zoom, readStage(), factor, at);
    },
    zoomInAt: (at, factor) => {
      cancelFlight(memory);
      zoom.followsOwn = false;
      zoomAt(zoom, readStage(), factor, at);
    },
    pan: (from, to) => {
      cancelFlight(memory);
      panBetween(zoom, readStage(), { from, to, at: performance.now() });
    },
    releasePan: () => releasePan(zoom, room.size, performance.now(), memory.reducedMotion),
    followOwn: () => request("own"),
    flyTo: (playerId) => request(playerId),
    playIntro: () => request("intro"),
    readCamera: () => ({ factor: zoom.goal, followsOwn: willFollow(memory) }),
  };
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
    controls: createControls(memory, readStage, hall),
    update: (frame) => {
      memory.reducedMotion = frame.reducedMotion;
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
