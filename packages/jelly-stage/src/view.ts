/**
 * The stage as a view on a canvas: keeps the state from a source and shows it as a 3D room every
 * frame. three.js renders into its own canvas, which is copied into the visible canvas together with
 * the texts, so a recording of the canvas shows everything.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { FrameLimit } from "./framePacing.ts";
import type { EdgeHint } from "./edgeHints.ts";
import type { JellyCast, JellySpot } from "./jellies.ts";
import type { LabelAnchor } from "./labels.ts";
import type { ScreenPoint } from "./lens.ts";
import type { StageScene, StageScreen } from "./scene.ts";
import type { StageSource } from "./source.ts";
import type { StageCatalog, StageEvent, StageMove, StagePoint, StageState } from "./types.ts";

import { createBeams, updateBeams, type StageBeams } from "./beams.ts";
import { createViewCamera, type CameraControls, type ViewCamera } from "./cameraControls.ts";
import { createChoiceRings, updateChoiceRings, type ChoiceRings } from "./choiceRings.ts";
import { createEffects, isFreshEvent, isPulseEvent, updateEffects } from "./effects.ts";
import { pickEdgeHint } from "./edgeHints.ts";
import { pickFloor, readPickView } from "./floorPicking.ts";
import { fitCanvas, startFrameLoop } from "./frameLoop.ts";
import { createHall, rebuildHall, type Hall } from "./hall.ts";
import { createHoverRing, updateHoverRing, type HoverRing } from "./hoverRing.ts";
import { NO_INSETS, type StageInsets } from "./insets.ts";
import { createJellyCast, pulseJelly, syncJellies, updateJellies } from "./jellies.ts";
import { bendToLens, LENS_RANGE } from "./lens.ts";
import { applyLens, createLensPass, type LensPass } from "./lensPass.ts";
import { findLevels, findPositions, findWinner, listHighlighted, pruneMoves } from "./moves.ts";
import {
  isOwnAt,
  locateJelly,
  measureAnchors,
  NOTHING_HOVERED,
  paintOverlay,
  pickAvailable,
  type Hovered,
  type JellyOnScreen,
  type StageMarks,
} from "./overlay.ts";
import { createPointer, updatePointer, type StagePointer } from "./pointer.ts";
import { createStageScene, findViewer, projectToScreen, resizeStageScene } from "./scene.ts";
import { ANIMATION_EVENTS, STATE_EVENTS } from "./source.ts";
import { updateVenue } from "./venue.ts";
import { findSnackRunners, keepNewerMove } from "./walking.ts";
import { measureRoom, type ScenePoint } from "./world.ts";

/** Many events in a row cause only one reload. */
const RELOAD_DELAY_MS = 500;
/** Jellies leave without an event when they stop being active, so the state is reread regularly. */
const RELOAD_INTERVAL_MS = 30_000;
const STATE_EVENT_TYPES = new Set(STATE_EVENTS);
const ANIMATION_EVENT_TYPES = new Set(ANIMATION_EVENTS);

/** What a view is shown on, where its data comes from and how it looks. */
export interface StageViewOptions {
  canvas: HTMLCanvasElement;
  source: StageSource;
  /** After every read of the state. */
  onState?: (state: StageState) => void;
  /** After a read of the state failed. */
  onError?: (error: unknown) => void;
  /** When the event stream opens or breaks. */
  onConnectionChange?: (isOpen: boolean) => void;
  /** Strength of the fisheye, see {@link LENS_RANGE}. */
  lensStrength?: number;
  /** Detail of the 3D picture relative to the canvas. */
  renderScale?: number;
  /** Canvas pixels per screen pixel. 1 costs far less, 2 also smooths the raymarched jellies. */
  supersampling?: number;
  /** How long events gather before the state is read again. */
  reloadDelayMs?: number;
  /** Frames per second, null for every screen refresh. Without a value it stays at 30. */
  frameLimit?: FrameLimit;
  /** Bands the page covers with its own buttons. The room fits between them. */
  insets?: StageInsets;
  /** After every frame, for things the page keeps next to a jelly. */
  onFrame?: () => void;
}

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
}

/** What changes while the view runs. */
interface StageMemory {
  options: StageViewOptions;
  state: StageState | null;
  catalog: StageCatalog | null;
  /** The newest move of each jelly, by player ID. */
  moves: Map<number, StageMove>;
  clockOffset: number;
  signLabels: Map<string, string>;
  effects: StageEffect[];
  reloadPending: boolean;
  /** A read is running, so a further one has to wait for it. */
  reloading: boolean;
  /** Something changed during the running read, which may not have seen it. */
  reloadAgain: boolean;
  streamOpened: boolean;
  /** The screen as last fitted, null before the first frame. */
  screen: StageScreen | null;
  stage: StageScene;
  hall: Hall;
  lens: LensPass;
  cast: JellyCast;
  beams: StageBeams;
  choiceRings: ChoiceRings;
  goalPointer: StagePointer;
  marks: StageMarks;
  camera: ViewCamera;
  hoverRing: HoverRing;
  pointer: ScreenPoint | null;
  /** What lay under the pointer in the last frame. */
  hovered: Hovered;
  /** The hints at the edge in the last frame. */
  hints: EdgeHint[];
  /** Where the jellies were in the last frame, from back to front. */
  anchors: LabelAnchor[];
  /** The jellies that light up in this frame. */
  highlighted: Set<number>;
  reducedMotion: boolean;
}

/** Builds the hall for the areas and the size of a state. Floor and camera follow a new size. */
function applyHall(memory: StageMemory, state: StageState): void {
  const { hall, stage, screen } = memory;
  const size = measureRoom(state.room);
  const isResized = size.width !== hall.size.width || size.depth !== hall.size.depth;
  rebuildHall(hall, stage.scene, state.areas, size);
  if (isResized && screen) {
    resizeStageScene(stage, screen, size);
  }
}

/** Takes over a new state. */
function applyState(memory: StageMemory, state: StageState): void {
  memory.state = state;
  memory.clockOffset = state.server_time - Date.now();
  for (const move of state.moves) {
    keepNewerMove(memory.moves, move);
  }
  pruneMoves(memory.moves, state.players);
  applyHall(memory, state);
  syncJellies(
    memory.cast,
    state.players,
    findPositions(state.players, memory.moves, Date.now() + memory.clockOffset, memory.hall.size),
  );
}

/** Handles one stream event. A source may also report events the stage does not know. */
function handleEvent(memory: StageMemory, event: StageEvent): void {
  const changesState = STATE_EVENT_TYPES.has(event.type);
  if (!changesState && !ANIMATION_EVENT_TYPES.has(event.type)) {
    return;
  }
  const now = Date.now();
  if (memory.catalog && isFreshEvent(event, now + memory.clockOffset)) {
    const added = createEffects(event, memory.catalog, now);
    memory.effects = updateEffects(memory.effects, added, now);
    if (isPulseEvent(event) && event.player_id !== null) {
      pulseJelly(memory.cast, event.player_id);
    }
  }
  if (changesState && !memory.reloadPending) {
    memory.reloadPending = true;
    setTimeout(() => {
      memory.reloadPending = false;
      void reload(memory);
    }, memory.options.reloadDelayMs ?? RELOAD_DELAY_MS);
  }
}

/** Reads the state, and everything else that is still missing after the view was opened. */
async function readEverything(memory: StageMemory): Promise<void> {
  const { source, onState, onConnectionChange } = memory.options;
  if (!memory.catalog) {
    memory.catalog = await source.readCatalog();
    memory.signLabels = new Map(memory.catalog.signs.map((sign) => [sign.key, sign.label]));
  }
  const state = await source.readState();
  applyState(memory, state);
  onState?.(state);
  if (!memory.streamOpened) {
    memory.streamOpened = true;
    source.subscribe(state.last_event_id, {
      onEvent: (event) => handleEvent(memory, event),
      onMove: (move) => keepNewerMove(memory.moves, move),
      onReset: () => void reload(memory),
      onConnectionChange: (isOpen) => onConnectionChange?.(isOpen),
    });
  }
}

/** Reads the state, one read at a time. A call during a read causes one more read after it. */
async function reload(memory: StageMemory): Promise<void> {
  if (memory.reloading) {
    memory.reloadAgain = true;
    return;
  }
  memory.reloading = true;
  try {
    await readEverything(memory);
  } catch (error) {
    memory.options.onError?.(error);
  }
  memory.reloading = false;
  if (memory.reloadAgain) {
    memory.reloadAgain = false;
    void reload(memory);
  }
}

/** Moves every jelly one frame on and returns where they stand now. */
function moveJellies(memory: StageMemory, seconds: number, now: number): JellySpot[] {
  const time = performance.now() / 1000;
  const serverTime = now + memory.clockOffset;
  const { size, platforms } = memory.hall;
  const positions = findPositions(memory.state?.players ?? [], memory.moves, serverTime, size);
  const { ownId, highlight } = memory.marks;
  memory.highlighted = highlight ? listHighlighted(positions, ownId, highlight, size) : new Set();
  const spots = updateJellies(memory.cast, {
    positions,
    levels: findLevels(memory.moves, serverTime),
    viewer: findViewer(memory.stage.camera),
    camera: memory.stage.camera.position,
    effects: memory.effects,
    visitors: findSnackRunners(memory.moves),
    platforms,
    winnerId: findWinner(memory.state?.gathering ?? null, serverTime),
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

/** Moves the light on highlighted jellies, the rings of choice and the pointer at the own goal. */
function updateRoomMarks(memory: StageMemory, spots: JellySpot[], seconds: number, now: number) {
  const { reducedMotion } = memory;
  const { size, platforms } = memory.hall;
  updateBeams(memory.beams, { spots, effects: memory.effects, platforms, now });
  updateChoiceRings(memory.choiceRings, { spots, lit: memory.highlighted, seconds, reducedMotion });
  const { ownId } = memory.marks;
  const hoveredId = memory.hovered.isOwn ? ownId : memory.hovered.playerId;
  const spot = spots.find((candidate) => candidate.player.id === hoveredId);
  updateHoverRing(memory.hoverRing, { spot, seconds, reducedMotion });
  const own = spots.find((candidate) => candidate.player.id === ownId)?.player;
  updatePointer(memory.goalPointer, {
    destination: own ? (memory.marks.destination ?? null) : null,
    move: own && memory.moves.get(own.id),
    color: own?.color ?? "",
    platforms,
    room: size,
    serverTime: now + memory.clockOffset,
    seconds,
    reducedMotion,
  });
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
  memory.effects = updateEffects(memory.effects, [], now);
  const spots = moveJellies(memory, seconds, now);
  updateRoomMarks(memory, spots, seconds, now);
  const { ownId } = memory.marks;
  memory.camera.update({ seconds, spots, ownId, reducedMotion: memory.reducedMotion });
  const size = fitCanvas(context.canvas, context, density);
  stage.renderer.render(stage.scene, stage.camera);
  applyLens(memory.lens, stage.renderer);
  // Copied in the same task as the render, so the WebGL picture is still there.
  context.drawImage(stage.renderer.domElement, 0, 0, size.width, size.height);
  const toScreen = (point: ScenePoint) =>
    bendToLens(projectToScreen(stage.camera, point, size), size, memory.lens.strength);
  memory.anchors = measureAnchors(spots, toScreen);
  const insets = memory.options.insets ?? NO_INSETS;
  Object.assign(memory, paintOverlay(context, { ...memory, size, insets, now }));
  memory.options.onFrame?.();
}

/** Creates everything a view needs and puts the empty room into the scene. */
function createMemory(options: StageViewOptions): StageMemory {
  const stage = createStageScene();
  const cast = createJellyCast();
  const hall = createHall(stage.scene);
  const beams = createBeams();
  const choiceRings = createChoiceRings();
  const goalPointer = createPointer();
  const lens = createLensPass(options.lensStrength ?? LENS_RANGE.usual);
  const hoverRing = createHoverRing();
  stage.scene.add(cast.root, beams.root, choiceRings.root, goalPointer.root, hoverRing.mesh);
  const readInsets = () => options.insets ?? NO_INSETS;
  return {
    options,
    state: null,
    catalog: null,
    moves: new Map(),
    clockOffset: 0,
    signLabels: new Map(),
    effects: [],
    reloadPending: false,
    reloading: false,
    reloadAgain: false,
    streamOpened: false,
    screen: null,
    stage,
    hall,
    lens,
    cast,
    beams,
    choiceRings,
    goalPointer,
    marks: { ownId: null, targetId: null },
    camera: createViewCamera({ stage, hall, canvas: options.canvas, lens, readInsets }),
    hoverRing,
    pointer: null,
    hovered: NOTHING_HOVERED,
    hints: [],
    anchors: [],
    highlighted: new Set(),
    reducedMotion: false,
  };
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
    ...memory.camera.controls,
  };
}
