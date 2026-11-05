/**
 * The stage as a view on a canvas: keeps the state from a source and shows it as a 3D room every
 * frame. three.js renders into its own canvas, which is copied into the visible canvas together with
 * the texts, so a recording of the canvas shows everything.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { JellyCast, JellySpot } from "./jellies.ts";
import type { LabelAnchor } from "./labels.ts";
import type { ScreenPoint } from "./lens.ts";
import type { StageScene } from "./scene.ts";
import type { StageSource } from "./source.ts";
import type { StageCatalog, StageEvent, StageMove, StagePoint, StageState } from "./types.ts";
import type { FloorRect, ScenePoint } from "./world.ts";

import { createBeams, updateBeams, type StageBeams } from "./beams.ts";
import { createChoiceRings, updateChoiceRings, type ChoiceRings } from "./choiceRings.ts";
import { createEffects, isFreshEvent, isPulseEvent, updateEffects } from "./effects.ts";
import { pickFloor } from "./floorPicking.ts";
import { fitCanvas, startFrameLoop } from "./frameLoop.ts";
import { createFurniture } from "./furniture.ts";
import { createJellyCast, pulseJelly, syncJellies, updateJellies } from "./jellies.ts";
import { drawLabels } from "./labels.ts";
import { bendToLens, LENS_RANGE } from "./lens.ts";
import { applyLens, createLensPass, type LensPass } from "./lensPass.ts";
import {
  findLevels,
  findPositions,
  listHighlighted,
  pruneMoves,
  type StageHighlight,
} from "./moves.ts";
import { pickJelly } from "./picking.ts";
import { createPointer, updatePointer, type StagePointer } from "./pointer.ts";
import { disposeProps } from "./props.ts";
import { createStageScene, findViewer, projectToScreen, resizeStageScene } from "./scene.ts";
import { ANIMATION_EVENTS, STATE_EVENTS } from "./source.ts";
import { createVenue, updateVenue } from "./venue.ts";
import { findSnackRunners, keepNewerMove } from "./walking.ts";
import { listStageRects } from "./zones.ts";

/** Many events in a row cause only one reload. */
const RELOAD_DELAY_MS = 500;
/** Jellies leave without an event when they stop being active, so the state is reread regularly. */
const RELOAD_INTERVAL_MS = 30_000;
const STATE_EVENT_TYPES = new Set(STATE_EVENTS);
const ANIMATION_EVENT_TYPES = new Set(ANIMATION_EVENTS);

/** Which jellies stand out on a personal screen. The big stage marks none. */
export interface StageMarks {
  ownId: number | null;
  targetId: number | null;
  /** While set, only the jellies that light up can be hovered and picked. */
  highlight?: StageHighlight | null;
  /** Where the own jelly is heading. A pointer stands there until it has arrived. */
  destination?: StagePoint | null;
}

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
}

/** What the page can do with a running view. */
export interface StageView {
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
  /** The room as last built, to notice when the areas change. */
  roomKey: string;
  stages: FloorRect[];
  stage: StageScene;
  lens: LensPass;
  cast: JellyCast;
  furniture: ReturnType<typeof createFurniture>;
  venue: ReturnType<typeof createVenue>;
  beams: StageBeams;
  choiceRings: ChoiceRings;
  goalPointer: StagePointer;
  marks: StageMarks;
  pointer: ScreenPoint | null;
  /** Where the jellies were in the last frame, from back to front. */
  anchors: LabelAnchor[];
  /** The jellies that light up in this frame. */
  highlighted: Set<number>;
  reducedMotion: boolean;
}

/** Builds furniture, venue and stages again when the areas changed. */
function rebuildRoom(memory: StageMemory, state: StageState): void {
  const roomKey = JSON.stringify(state.areas);
  if (roomKey === memory.roomKey) {
    return;
  }
  memory.roomKey = roomKey;
  memory.stage.scene.remove(memory.furniture);
  disposeProps(memory.furniture);
  memory.furniture = createFurniture(state.areas);
  memory.stage.scene.remove(memory.venue);
  disposeProps(memory.venue);
  memory.venue = createVenue(state.areas);
  memory.stage.scene.add(memory.furniture, memory.venue);
  memory.stages = listStageRects(state.areas);
}

/** Takes over a new state. */
function applyState(memory: StageMemory, state: StageState): void {
  memory.state = state;
  memory.clockOffset = state.server_time - Date.now();
  for (const move of state.moves) {
    keepNewerMove(memory.moves, move);
  }
  pruneMoves(memory.moves, state.players);
  rebuildRoom(memory, state);
  syncJellies(
    memory.cast,
    state.players,
    findPositions(state.players, memory.moves, Date.now() + memory.clockOffset),
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
  const positions = findPositions(memory.state?.players ?? [], memory.moves, serverTime);
  const { ownId, highlight } = memory.marks;
  memory.highlighted = highlight ? listHighlighted(positions, ownId, highlight) : new Set();
  const spots = updateJellies(memory.cast, {
    positions,
    levels: findLevels(memory.moves, serverTime),
    viewer: findViewer(memory.stage.camera),
    camera: memory.stage.camera.position,
    effects: memory.effects,
    visitors: findSnackRunners(memory.moves),
    stages: memory.stages,
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
  updateBeams(memory.beams, { spots, effects: memory.effects, stages: memory.stages, now });
  updateChoiceRings(memory.choiceRings, { spots, lit: memory.highlighted, seconds, reducedMotion });
  const own = spots.find((spot) => spot.player.id === memory.marks.ownId)?.player;
  updatePointer(memory.goalPointer, {
    destination: own ? (memory.marks.destination ?? null) : null,
    move: own && memory.moves.get(own.id),
    color: own?.color ?? "",
    stages: memory.stages,
    serverTime: now + memory.clockOffset,
    seconds,
    reducedMotion,
  });
}

/** Returns the player of the jelly at a point that can be picked right now. */
function pickAvailable(memory: StageMemory, point: ScreenPoint): number | null {
  const { ownId, highlight } = memory.marks;
  const anchors = highlight
    ? memory.anchors.filter((anchor) => memory.highlighted.has(anchor.player.id))
    : memory.anchors;
  return pickJelly(anchors, point, ownId);
}

/** Reports whether the own jelly is the frontmost one at a point. */
function isOwnAt(memory: StageMemory, point: ScreenPoint): boolean {
  const { ownId } = memory.marks;
  return ownId !== null && pickJelly(memory.anchors, point, null) === ownId;
}

/** Finds the jelly under the pointer and shows on the canvas that it can be clicked. */
function findHovered(memory: StageMemory, canvas: HTMLCanvasElement): number | null {
  if (!memory.pointer) {
    return null;
  }
  const isOwn = !memory.marks.highlight && isOwnAt(memory, memory.pointer);
  const hoveredId = isOwn ? null : pickAvailable(memory, memory.pointer);
  canvas.style.cursor = isOwn || hoveredId !== null ? "pointer" : "";
  return hoveredId;
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
  const size = fitCanvas(context.canvas, context, density);
  stage.renderer.render(stage.scene, stage.camera);
  applyLens(memory.lens, stage.renderer);
  // Copied in the same task as the render, so the WebGL picture is still there.
  context.drawImage(stage.renderer.domElement, 0, 0, size.width, size.height);
  const toScreen = (point: ScenePoint) =>
    bendToLens(projectToScreen(stage.camera, point, size), size, memory.lens.strength);
  memory.anchors = spots.map((spot) => {
    const feet = toScreen(spot.feet);
    const head = toScreen(spot.head);
    return { player: spot.player, x: feet.x, y: feet.y, headX: head.x, height: feet.y - head.y };
  });
  drawLabels(context, {
    anchors: memory.anchors,
    effects: memory.effects,
    signLabels: memory.signLabels,
    now,
    marks: {
      ...memory.marks,
      hoveredId: findHovered(memory, context.canvas),
    },
  });
}

/** Creates everything a view needs and puts the empty room into the scene. */
function createMemory(options: StageViewOptions): StageMemory {
  const stage = createStageScene();
  const cast = createJellyCast();
  const furniture = createFurniture([]);
  const venue = createVenue([]);
  const beams = createBeams();
  const choiceRings = createChoiceRings();
  const goalPointer = createPointer();
  stage.scene.add(cast.root, furniture, venue, beams.root, choiceRings.root, goalPointer.root);
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
    roomKey: "",
    stages: [],
    stage,
    lens: createLensPass(options.lensStrength ?? LENS_RANGE.usual),
    cast,
    furniture,
    venue,
    beams,
    choiceRings,
    goalPointer,
    marks: { ownId: null, targetId: null },
    pointer: null,
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
  const { renderScale = 1, supersampling } = options;
  startFrameLoop(options.canvas, {
    supersampling,
    onResize: (size, density) =>
      resizeStageScene(memory.stage, size, density * renderScale, memory.lens.strength),
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
      const size = { width: options.canvas.clientWidth, height: options.canvas.clientHeight };
      return pickFloor(memory.stage.camera, point, size, memory.lens.strength);
    },
    setReducedMotion: (reduced) => {
      memory.reducedMotion = reduced;
    },
  };
}
