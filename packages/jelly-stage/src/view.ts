/**
 * The stage as a view on a canvas: keeps the state from a source and shows it as a 3D room every
 * frame. three.js renders into its own canvas, which is copied into the visible canvas together with
 * the texts, so a recording of the canvas shows everything. `viewData.ts` reads the state,
 * `viewMemory.ts` holds what the view keeps.
 *
 * @module
 */

import type { CameraControls } from "./cameraControls.ts";
import type { FrameLimit } from "./framePacing.ts";
import type { JellySpot } from "./jellies.ts";
import type { ScreenPoint } from "./lens.ts";
import type { NewsCameraFrame } from "./newsCameraRig.ts";
import type { NewsGaze } from "./newsShots.ts";
import type { StageMove, StagePoint, StageStack } from "./types.ts";
import type { FloorPoint, ScenePoint } from "./world.ts";

import { updateEffects, type StageEffect } from "./effects.ts";
import { pickEdgeHint } from "./edgeHints.ts";
import { pickFloor, readPickView } from "./floorPicking.ts";
import { fitCanvas, startFrameLoop } from "./frameLoop.ts";
import { NO_INSETS } from "./insets.ts";
import { JELLY_HEIGHT, updateJellies, WINNER_SCALE } from "./jellies.ts";
import { bendToLens } from "./lens.ts";
import { applyLens } from "./lensPass.ts";
import { findPositions, findPresenter, findWinner, listHighlighted } from "./moves.ts";
import { findTextBounds } from "./newsCameraBounds.ts";
import { castNews } from "./newsCameraCast.ts";
import { stepNews } from "./newsDirector.ts";
import { updateNewsSet } from "./newsSet.ts";
import { paintNewsTitle } from "./newsTitle.ts";
import {
  isOwnAt,
  locateJelly,
  measureAnchors,
  paintOverlay,
  pickAvailable,
  type JellyOnScreen,
  type StageMarks,
} from "./overlay.ts";
import { updateRoomMarks } from "./roomMarks.ts";
import { findViewer, isInFront, projectToScreen, resizeStageScene } from "./scene.ts";
import { updateVenue } from "./venue.ts";
import { reload } from "./viewData.ts";
import { createMemory, type StageMemory, type StageViewOptions } from "./viewMemory.ts";
import { findSnackRunners } from "./walking.ts";

export type { StageViewOptions } from "./viewMemory.ts";

/** Jellies leave without an event when they stop being active, so the state is reread regularly. */
const RELOAD_INTERVAL_MS = 30_000;

/** What the page can do with a running view. */
export interface StageView extends CameraControls {
  /** Reads the state now instead of waiting for the next event. */
  reload: () => void;
  setMarks: (marks: StageMarks) => void;
  /** Tells where the pointer is. The jelly under it shows its name in any crowd. */
  setPointer: (point: ScreenPoint | null) => void;
  /** Returns the player of the nearest jelly at a point in CSS pixels. The own jelly never counts. */
  pickAt: (point: ScreenPoint) => number | null;
  /** Reports whether the own jelly is the frontmost one at a point in CSS pixels. */
  isOwnAt: (point: ScreenPoint) => boolean;
  /** Returns the stage position on the floor at a point in CSS pixels, null off the stage. */
  floorAt: (point: ScreenPoint) => StagePoint | null;
  setReducedMotion: (reduced: boolean) => void;
  /** Changes the frames per second, null for every screen refresh. */
  setFrameLimit: (limit: FrameLimit) => void;
  /** Returns where a jelly is on screen in CSS pixels, null when it is not in the room. */
  locate: (playerId: number) => JellyOnScreen | null;
  /** Returns the player of the edge hint at a point in CSS pixels, null for none. */
  hintAt: (point: ScreenPoint) => number | null;
  /** Returns the newest walk of a jelly, null when it has none yet. */
  readMove: (playerId: number) => StageMove | null;
  /** Returns the running stacks, kept up to date by `stack.changed` between two reads. */
  readStacks: () => StageStack[];
}

/** What the jellies need in a frame besides the view. */
interface JellyStep {
  /** Where the moves put every jelly, by player ID. */
  positions: Map<number, FloorPoint>;
  /** Where they look while the news are filmed, null: into the camera. */
  gaze: NewsGaze | null;
  seconds: number;
  now: number;
}

/** Moves every jelly one frame on and returns where they stand now. */
function moveJellies(memory: StageMemory, step: JellyStep): JellySpot[] {
  const time = performance.now() / 1000;
  const { positions, seconds, now } = step;
  const serverTime = now + memory.clockOffset;
  const { size, platforms } = memory.hall;
  const { ownId, highlight } = memory.marks;
  memory.highlighted = highlight ? listHighlighted(positions, ownId, highlight, size) : new Set();
  const spots = updateJellies(memory.cast, {
    positions,
    moves: memory.moves,
    stacks: memory.state?.stacks ?? [],
    serverTime,
    viewer: findViewer(memory.stage.camera),
    gaze: step.gaze,
    camera: memory.stage.camera.position,
    effects: memory.effects,
    visitors: findSnackRunners(memory.moves),
    platforms,
    winnerId: findWinner(memory.state?.gathering ?? null, serverTime),
    presenterId: findPresenter(memory.state?.gathering ?? null, serverTime),
    seconds,
    time,
    now,
    reducedMotion: memory.reducedMotion,
  });
  if (!memory.reducedMotion) {
    updateVenue(time);
  }
  return spots;
}

/** Moves the marks in the room: lights, rings and the pointer at the own goal. */
function moveRoomMarks(memory: StageMemory, spots: JellySpot[], seconds: number, now: number) {
  const { ownId, destination = null } = memory.marks;
  updateRoomMarks(memory.roomMarks, {
    spots,
    effects: memory.effects,
    moves: memory.moves,
    stacks: memory.state?.stacks ?? [],
    platforms: memory.hall.platforms,
    room: memory.hall.size,
    lit: memory.highlighted,
    ownId,
    hoveredId: memory.hovered.isOwn ? ownId : memory.hovered.playerId,
    destination,
    seconds,
    now,
    serverTime: now + memory.clockOffset,
    reducedMotion: memory.reducedMotion,
  });
}

/** Puts up the studio of the news on air: the desk in front of the presenter, the screens. */
function dressStudio(memory: StageMemory, spots: JellySpot[], now: number): void {
  const { state, hall } = memory;
  updateNewsSet(memory.newsSet, {
    live: memory.news.live,
    gathering: state?.gathering ?? null,
    players: state?.players ?? [],
    moves: memory.moves,
    platforms: hall.platforms,
    room: hall.size,
    spots,
    serverTime: now + memory.clockOffset,
    reducedMotion: memory.reducedMotion,
  });
}

/** Moves the news one frame on. Returns the effects of a report that just came on. */
function directNews(memory: StageMemory, now: number): StageEffect[] {
  return stepNews(memory.news, {
    gathering: memory.state?.gathering ?? null,
    players: memory.state?.players ?? [],
    catalog: memory.catalog,
    serverTime: now + memory.clockOffset,
    now,
  });
}

/** What the news camera films in a frame: the report on air and, only while it films, the cast. */
function readNewsFrame(memory: StageMemory, positions: Map<number, FloorPoint>): NewsCameraFrame {
  const { state, news, hall } = memory;
  return {
    live: news.live,
    reducedMotion: memory.reducedMotion,
    readCast: () =>
      castNews({
        players: state?.players ?? [],
        moves: memory.moves,
        stacks: state?.stacks ?? [],
        areas: state?.areas ?? [],
        platforms: hall.platforms,
        room: hall.size,
        positions,
        presenterId: news.live?.show.presenterId ?? null,
        sizes: { jellyHeight: JELLY_HEIGHT, presenterScale: WINNER_SCALE },
      }),
  };
}

/** Moves everything one frame on, renders the room and paints it with the texts. */
function paintFrame(
  memory: StageMemory,
  context: CanvasRenderingContext2D,
  seconds: number,
  density: number,
): void {
  const now = Date.now();
  const { stage } = memory;
  memory.effects = updateEffects(memory.effects, directNews(memory, now), now);
  const serverTime = now + memory.clockOffset;
  const players = memory.state?.players ?? [];
  const positions = findPositions(players, memory.moves, serverTime, memory.hall.size);
  // The news camera goes first, so the jellies sort and turn by the camera of this very frame.
  const gaze = memory.camera.film(readNewsFrame(memory, positions));
  const spots = moveJellies(memory, { positions, gaze, seconds, now });
  moveRoomMarks(memory, spots, seconds, now);
  // After the jellies are sorted: the desk draws right after the presenter.
  dressStudio(memory, spots, now);
  const { ownId } = memory.marks;
  memory.camera.update({ seconds, spots, ownId, reducedMotion: memory.reducedMotion });
  const size = fitCanvas(context.canvas, context, density);
  stage.renderer.render(stage.scene, stage.camera);
  applyLens(memory.lens, stage.renderer);
  // Copied in the same task as the render, so the WebGL picture is still there.
  context.drawImage(stage.renderer.domElement, 0, 0, size.width, size.height);
  const toScreen = (point: ScenePoint) =>
    isInFront(stage.camera, point)
      ? bendToLens(projectToScreen(stage.camera, point, size), size, memory.lens.strength)
      : null;
  const isFilming = memory.camera.isFilming();
  memory.anchors = measureAnchors(spots, toScreen, isFilming ? size : null);
  const insets = memory.options.insets ?? NO_INSETS;
  const textBounds = isFilming ? findTextBounds(size, insets) : null;
  Object.assign(memory, paintOverlay(context, { ...memory, size, insets, now, textBounds }));
  // Last: the opening title of the news covers the room, its texts and the look.
  paintNewsTitle(memory.newsTitle, context, { ...memory, size, insets, now });
  memory.options.onFrame?.();
}

/**
 * Starts a stage on a canvas and keeps it up to date for the life of the page.
 *
 * @throws When the browser cannot draw it, because WebGL or the 2D canvas is missing.
 */
export function createStageView(options: StageViewOptions): StageView {
  const context = options.canvas.getContext("2d");
  if (!context) {
    throw new Error("the canvas has no 2d context");
  }
  const memory = createMemory(options);
  const { renderScale = 1, supersampling, frameLimit } = options;
  const setFrameLimit = startFrameLoop(options.canvas, {
    supersampling,
    frameLimit,
    onResize: (size, density) => {
      memory.screen = {
        size,
        pixelRatio: density * renderScale,
        lensStrength: memory.lens.strength,
        insets: options.insets ?? NO_INSETS,
      };
      resizeStageScene(memory.stage, memory.screen, memory.hall.size);
    },
    onFrame: (seconds, density) => paintFrame(memory, context, seconds, density),
  });
  void reload(memory);
  setInterval(() => void reload(memory), RELOAD_INTERVAL_MS);
  return {
    reload: () => void reload(memory),
    setMarks: (marks) => {
      memory.marks = marks;
    },
    setPointer: (point) => {
      memory.pointer = point;
    },
    pickAt: (point) => pickAvailable(memory, point),
    isOwnAt: (point) => isOwnAt(memory, point),
    floorAt: (point) => {
      const view = readPickView(options.canvas, memory.lens);
      return pickFloor(memory.stage.camera, point, view, memory.hall.size);
    },
    setReducedMotion: (reduced) => {
      memory.reducedMotion = reduced;
    },
    setFrameLimit,
    locate: (playerId) => locateJelly(memory.anchors, playerId),
    hintAt: (point) => pickEdgeHint(memory.hints, point),
    readMove: (playerId) => memory.moves.get(playerId) ?? null,
    readStacks: () => memory.state?.stacks ?? [],
    ...memory.camera.controls,
  };
}
