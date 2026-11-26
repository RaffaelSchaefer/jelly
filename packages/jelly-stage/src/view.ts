/**
 * The stage as a view on a canvas: keeps the state from a source and shows it as a 3D room every
 * frame. three.js renders into its own canvas, which is copied into the visible canvas together with
 * the texts, so a recording of the canvas shows everything. `viewData.ts` reads the state,
 * `viewMemory.ts` holds what the view keeps.
 *
 * @module
 */

import type { CameraControls } from "./cameraControls.ts";
import type { CongaFrame } from "./congaLines.ts";
import type { FrameLimit } from "./framePacing.ts";
import type { JellySpot } from "./jellies.ts";
import type { ScreenPoint } from "./lens.ts";
import type { NewsCameraFrame } from "./newsCameraRig.ts";
import type { NewsGaze } from "./newsShots.ts";
import type { StageMove, StagePoint, StageStack } from "./types.ts";
import type { FloorPoint, ScenePoint } from "./world.ts";

import { findCongaLines, gatherCongas, NO_CONGA } from "./congaLines.ts";
import { updateEffects, type StageEffect } from "./effects.ts";
import { pickEdgeHint } from "./edgeHints.ts";
import { pickFloor, readPickView } from "./floorPicking.ts";
import { fitCanvas, startFrameLoop } from "./frameLoop.ts";
import { NO_INSETS } from "./insets.ts";
import { JELLY_HEIGHT, updateJellies, WINNER_SCALE } from "./jellies.ts";
import { bendToLens } from "./lens.ts";
import { applyLens } from "./lensPass.ts";
import { findPositions, findPresenter, findWinner, isNewsOnAir, listHighlighted } from "./moves.ts";
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
import { readMoves, reload } from "./viewData.ts";
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
  /**
   * Returns the player of the nearest jelly at a point in CSS pixels. The own jelly never counts.
   * `reach` counts a point that many pixels beside a jelly as on it, for a finger. Default 0.
   */
  pickAt: (point: ScreenPoint, reach?: number) => number | null;
  /** Reports whether the own jelly is the frontmost one at a point in CSS pixels, within `reach`. */
  isOwnAt: (point: ScreenPoint, reach?: number) => boolean;
  /** Returns the stage position on the floor at a point in CSS pixels, null off the stage. */
  floorAt: (point: ScreenPoint) => StagePoint | null;
  setReducedMotion: (reduced: boolean) => void;
  /** Changes the frames per second, null for every screen refresh. */
  setFrameLimit: (limit: FrameLimit) => void;
  /** Returns where a jelly is on screen in CSS pixels, null when it is not in the room. */
  locate: (playerId: number) => JellyOnScreen | null;
  /** Returns the player of the edge hint at a point in CSS pixels, null for none, within `reach`. */
  hintAt: (point: ScreenPoint, reach?: number) => number | null;
  /** Returns the newest walk of a jelly, null when it has none yet. */
  readMove: (playerId: number) => StageMove | null;
  /** Returns the running stacks, kept up to date by `stack.changed` between two reads. */
  readStacks: () => StageStack[];
}

/** What everything in a frame plays from besides the view. */
interface FrameStep {
  /** The moves as the stage plays them in this frame, see `readMoves`. */
  moves: ReadonlyMap<number, StageMove>;
  /** Where these moves put every jelly, by player ID. */
  positions: Map<number, FloorPoint>;
  /** The conga lines of this frame: who dances and where a garland hangs. */
  congas: CongaFrame;
  seconds: number;
  now: number;
}

/** What the jellies need in a frame besides the view. */
interface JellyStep extends FrameStep {
  /** Where they look while the news are filmed, null: into the camera. */
  gaze: NewsGaze | null;
}

/** Moves every jelly one frame on and returns where they stand now. */
function moveJellies(memory: StageMemory, step: JellyStep): JellySpot[] {
  const time = performance.now() / 1000;
  const { moves, positions, seconds, now } = step;
  const serverTime = now + memory.clockOffset;
  const { size, platforms } = memory.hall;
  const { ownId, highlight } = memory.marks;
  memory.highlighted = highlight ? listHighlighted(positions, ownId, highlight, size) : new Set();
  const spots = updateJellies(memory.cast, {
    positions,
    moves,
    stacks: memory.state?.stacks ?? [],
    dancers: step.congas.dancers,
    serverTime,
    viewer: findViewer(memory.stage.camera),
    gaze: step.gaze,
    camera: memory.stage.camera.position,
    effects: memory.effects,
    visitors: findSnackRunners(moves),
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
function moveRoomMarks(memory: StageMemory, spots: JellySpot[], step: FrameStep) {
  const { moves, seconds, now } = step;
  const { ownId, destination = null } = memory.marks;
  updateRoomMarks(memory.roomMarks, {
    spots,
    effects: memory.effects,
    moves,
    stacks: memory.state?.stacks ?? [],
    congas: step.congas,
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
function dressStudio(memory: StageMemory, spots: JellySpot[], step: FrameStep): void {
  const { state, hall } = memory;
  updateNewsSet(memory.newsSet, {
    live: memory.news.live,
    gathering: state?.gathering ?? null,
    players: state?.players ?? [],
    moves: step.moves,
    platforms: hall.platforms,
    room: hall.size,
    spots,
    serverTime: step.now + memory.clockOffset,
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
function readNewsFrame(memory: StageMemory, step: FrameStep): NewsCameraFrame {
  const { state, news, hall } = memory;
  return {
    live: news.live,
    reducedMotion: memory.reducedMotion,
    readCast: () =>
      castNews({
        players: state?.players ?? [],
        moves: step.moves,
        stacks: state?.stacks ?? [],
        areas: state?.areas ?? [],
        platforms: hall.platforms,
        room: hall.size,
        positions: step.positions,
        presenterId: news.live?.show.presenterId ?? null,
        sizes: { jellyHeight: JELLY_HEIGHT, presenterScale: WINNER_SCALE },
      }),
  };
}

/**
 * Returns the conga lines of a frame. None while the news are on air: their camera wants calm heads
 * and free faces, and a follow outlasts a gathering.
 */
function readCongas(
  memory: StageMemory,
  positions: ReadonlyMap<number, FloorPoint>,
  serverTime: number,
): CongaFrame {
  const { players = [], gathering = null } = memory.state ?? {};
  if (isNewsOnAir(gathering, serverTime)) return NO_CONGA;
  return gatherCongas(findCongaLines(players, serverTime), positions);
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
  const moves = readMoves(memory, now);
  const positions = findPositions(players, moves, serverTime, memory.hall.size);
  const congas = readCongas(memory, positions, serverTime);
  const step = { moves, positions, congas, seconds, now };
  // The news camera goes first, so the jellies sort and turn by the camera of this very frame.
  const gaze = memory.camera.film(readNewsFrame(memory, step));
  const spots = moveJellies(memory, { ...step, gaze });
  moveRoomMarks(memory, spots, step);
  // After the jellies are sorted: the desk draws right after the presenter.
  dressStudio(memory, spots, step);
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
    pickAt: (point, reach) => pickAvailable(memory, point, reach),
    isOwnAt: (point, reach) => isOwnAt(memory, point, reach),
    floorAt: (point) => {
      const view = readPickView(options.canvas, memory.lens);
      return pickFloor(memory.stage.camera, point, view, memory.hall.size);
    },
    setReducedMotion: (reduced) => {
      memory.reducedMotion = reduced;
    },
    setFrameLimit,
    locate: (playerId) => locateJelly(memory.anchors, playerId),
    hintAt: (point, reach) => pickEdgeHint(memory.hints, point, reach),
    readMove: (playerId) => readMoves(memory, Date.now()).get(playerId) ?? null,
    readStacks: () => memory.state?.stacks ?? [],
    ...memory.camera.controls,
  };
}
