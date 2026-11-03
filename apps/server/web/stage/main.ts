/**
 * The stage page: keeps the state from the server and shows it as a 3D room every frame. three.js
 * renders into its own canvas, which is copied into the visible canvas together with the texts, so
 * a recording of `#stage` shows everything.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { JellyCast } from "./jellies.ts";
import type { LabelAnchor } from "./labels.ts";
import type { StageScene } from "./scene.ts";
import type { StageCatalog, StageEvent, StageMove, StageState } from "./types.ts";
import type { FloorPoint, FloorRect, ScenePoint } from "./world.ts";

import { fetchCatalog, fetchStageState, openEventStream, RequestError } from "./connection.ts";
import { createEffects, isFreshEvent, isPulseEvent, updateEffects } from "./effects.ts";
import { createFurniture } from "./furniture.ts";
import { createJellyCast, pulseJelly, syncJellies, updateJellies } from "./jellies.ts";
import { drawLabels } from "./labels.ts";
import { bendToLens, LENS_RANGE } from "./lens.ts";
import { applyLens, createLensPass, type LensPass } from "./lensPass.ts";
import { createStageScene, findViewer, projectToScreen, resizeStageScene } from "./scene.ts";
import { disposeProps } from "./props.ts";
import { createVenue, updateVenue } from "./venue.ts";
import { findMovePosition, findSnackRunners, findStackLevel, keepNewerMove } from "./walking.ts";
import { calculateCanvasDensity, toFloorPoint } from "./world.ts";
import { listStageRects } from "./zones.ts";

/** Many events in a row cause only one reload. */
const RELOAD_DELAY_MS = 500;
/** Jellies leave without an event when they stop being active, so the state is reread regularly. */
const RELOAD_INTERVAL_MS = 30_000;
/** Enough for smooth jellies, and the raymarched bodies cost a lot per frame. */
const FRAMES_PER_SECOND = 30;
/** A frame may come this much early, because the screen refresh does not match the rate exactly. */
const FRAME_TOLERANCE_MS = 4;
/** After a hidden tab, the jellies continue instead of jumping. */
const LONGEST_FRAME_SECONDS = 0.1;
/** `?scale=` sets the detail of the 3D picture relative to the canvas, for slow or fast machines. */
const SCALE_RANGE = { lowest: 0.25, highest: 2, usual: 1 };
const TEXT_WRONG_KEY = "Der Bühnen-Link ist ungültig. Bitte den vollständigen Link öffnen.";
const TEXT_OFFLINE = "Keine Verbindung zum Server. Neuer Versuch läuft …";
const TEXT_NO_WEBGL = "Dieser Browser kann die 3D-Bühne nicht zeichnen.";
const STATUS_UNAUTHORIZED = 401;

/** What changes while the page runs. */
interface StageMemory {
  state: StageState | null;
  catalog: StageCatalog | null;
  /** The newest move of each jelly, by player ID. */
  moves: Map<number, StageMove>;
  clockOffset: number;
  signLabels: Map<string, string>;
  effects: StageEffect[];
  reloadPending: boolean;
  streamOpened: boolean;
  /** The room as last built, to notice when the areas change. */
  roomKey: string;
  stages: FloorRect[];
  stage: StageScene;
  lens: LensPass;
  cast: JellyCast;
  furniture: ReturnType<typeof createFurniture>;
  venue: ReturnType<typeof createVenue>;
}

/** Finds a page element. A missing one means the page itself is broken. */
function findElement<Type extends HTMLElement>(id: string): Type {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`missing element #${id}`);
  }
  return element as Type;
}

/** Shows a problem at the bottom of the stage, or hides it with an empty text. */
function showStatus(text: string): void {
  const status = findElement("status");
  status.textContent = text;
  status.hidden = text === "";
}

/** Reads a number from the address and keeps it in its range. */
function readSetting(
  parameters: URLSearchParams,
  name: string,
  range: { lowest: number; highest: number; usual: number },
): number {
  const value = Number(parameters.get(name) ?? range.usual);
  if (!Number.isFinite(value)) {
    return range.usual;
  }
  return Math.min(range.highest, Math.max(range.lowest, value));
}

/** Returns where the move of every jelly puts it. A jelly without a move stands at home. */
function findPositions(memory: StageMemory, now: number): Map<number, FloorPoint> {
  const serverTime = now + memory.clockOffset;
  const positions = new Map<number, FloorPoint>();
  for (const player of memory.state?.players ?? []) {
    const move = memory.moves.get(player.id);
    positions.set(
      player.id,
      move
        ? findMovePosition(move, serverTime)
        : toFloorPoint({ x: player.home_x, y: player.home_y }),
    );
  }
  return positions;
}

/** Returns how many jellies stand below each jelly. */
function findLevels(memory: StageMemory, now: number): Map<number, number> {
  const serverTime = now + memory.clockOffset;
  const levels = new Map<number, number>();
  for (const move of memory.moves.values()) {
    levels.set(move.player_id, findStackLevel(move, serverTime));
  }
  return levels;
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
  const present = new Set(state.players.map((player) => player.id));
  for (const playerId of memory.moves.keys()) {
    if (!present.has(playerId)) memory.moves.delete(playerId);
  }
  rebuildRoom(memory, state);
  syncJellies(memory.cast, state.players, findPositions(memory, Date.now()));
}

/** Handles one stream event. */
function handleEvent(
  memory: StageMemory,
  stageKey: string,
  event: StageEvent,
  changesState: boolean,
): void {
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
      void reload(memory, stageKey);
    }, RELOAD_DELAY_MS);
  }
}

/** Reads the state, and everything else that is still missing after the page was opened. */
async function reload(memory: StageMemory, stageKey: string): Promise<void> {
  try {
    if (!memory.catalog) {
      memory.catalog = await fetchCatalog();
      memory.signLabels = new Map(memory.catalog.signs.map((sign) => [sign.key, sign.label]));
    }
    applyState(memory, await fetchStageState(stageKey));
    showStatus("");
    if (!memory.streamOpened && memory.state) {
      memory.streamOpened = true;
      openEventStream(stageKey, memory.state.last_event_id, {
        onEvent: (event, changesState) => handleEvent(memory, stageKey, event, changesState),
        onMove: (move) => keepNewerMove(memory.moves, move),
        onReset: () => void reload(memory, stageKey),
        onConnectionChange: (isOpen) => showStatus(isOpen ? "" : TEXT_OFFLINE),
      });
    }
  } catch (error) {
    const isWrongKey = error instanceof RequestError && error.status === STATUS_UNAUTHORIZED;
    showStatus(isWrongKey ? TEXT_WRONG_KEY : TEXT_OFFLINE);
  }
}

/** Adjusts the visible canvas to the window and the pixel density. Returns the size in CSS pixels. */
function fitCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, density: number) {
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
  const time = performance.now() / 1000;
  const spots = updateJellies(memory.cast, {
    positions: findPositions(memory, now),
    viewer: findViewer(stage.camera),
    camera: stage.camera.position,
    effects: memory.effects,
    visitors: findSnackRunners(memory.moves),
    stages: memory.stages,
    levels: findLevels(memory, now),
    seconds,
    time,
    now,
  });
  updateVenue(time);
  const size = fitCanvas(context.canvas, context, density);
  stage.renderer.render(stage.scene, stage.camera);
  applyLens(memory.lens, stage.renderer);
  // Copied in the same task as the render, so the WebGL picture is still there.
  context.drawImage(stage.renderer.domElement, 0, 0, size.width, size.height);
  const toScreen = (point: ScenePoint) =>
    bendToLens(projectToScreen(stage.camera, point, size), size, memory.lens.strength);
  const anchors: LabelAnchor[] = spots.map((spot) => {
    const feet = toScreen(spot.feet);
    const head = toScreen(spot.head);
    return { player: spot.player, x: feet.x, y: feet.y, height: feet.y - head.y };
  });
  drawLabels(context, {
    anchors,
    effects: memory.effects,
    signLabels: memory.signLabels,
    now,
  });
}

/** Runs the frames at a steady rate and keeps the 3D picture as large as the canvas. */
function startFrameLoop(memory: StageMemory, context: CanvasRenderingContext2D, scale: number) {
  let lastFrameAt = performance.now();
  let lastSize = "";
  const tick = (frameAt: number) => {
    requestAnimationFrame(tick);
    if (frameAt - lastFrameAt < 1000 / FRAMES_PER_SECOND - FRAME_TOLERANCE_MS) {
      return;
    }
    const seconds = Math.min(LONGEST_FRAME_SECONDS, (frameAt - lastFrameAt) / 1000);
    lastFrameAt = frameAt;
    const size = { width: context.canvas.clientWidth, height: context.canvas.clientHeight };
    const density = calculateCanvasDensity(size, window.devicePixelRatio);
    if (`${size.width}x${size.height}@${density}` !== lastSize) {
      lastSize = `${size.width}x${size.height}@${density}`;
      resizeStageScene(memory.stage, size, density * scale, memory.lens.strength);
    }
    paintFrame(memory, context, seconds, density);
  };
  requestAnimationFrame(tick);
}

/** Starts the page. */
function startStage(): void {
  const parameters = new URLSearchParams(window.location.search);
  const stageKey = parameters.get("key") ?? "";
  const context = findElement<HTMLCanvasElement>("stage").getContext("2d");
  let stage: StageScene;
  try {
    stage = createStageScene();
  } catch {
    showStatus(TEXT_NO_WEBGL);
    return;
  }
  if (!context) {
    showStatus(TEXT_NO_WEBGL);
    return;
  }
  const cast = createJellyCast();
  const furniture = createFurniture([]);
  const venue = createVenue([]);
  stage.scene.add(cast.root, furniture, venue);
  const memory: StageMemory = {
    state: null,
    catalog: null,
    moves: new Map(),
    clockOffset: 0,
    signLabels: new Map(),
    effects: [],
    reloadPending: false,
    streamOpened: false,
    roomKey: "",
    stages: [],
    stage,
    lens: createLensPass(readSetting(parameters, "lens", LENS_RANGE)),
    cast,
    furniture,
    venue,
  };
  startFrameLoop(memory, context, readSetting(parameters, "scale", SCALE_RANGE));
  void reload(memory, stageKey);
  setInterval(() => void reload(memory, stageKey), RELOAD_INTERVAL_MS);
}

startStage();
