/**
 * The stage page: keeps the state from the server and paints it in every animation frame.
 *
 * @module
 */

import type { StageEffect } from "./effects.ts";
import type { StageCatalog, StageEvent, StagePoint, StageState } from "./types.ts";
import type { StageLookup } from "./wander.ts";

import { fetchCatalog, fetchStageState, openEventStream, RequestError } from "./connection.ts";
import { drawStage, type ShownJelly } from "./draw.ts";
import { createEffects, isFreshEvent, updateEffects } from "./effects.ts";
import { moveToward } from "./projection.ts";
import { createSpriteCache } from "./sprite.ts";
import { calculateRandomValue, calculateStagePoint } from "./wander.ts";

/** Many events in a row cause only one reload. */
const RELOAD_DELAY_MS = 500;
/** Jellies leave without an event when they stop being active, so the state is reread regularly. */
const RELOAD_INTERVAL_MS = 30_000;
const SEED_BREATH = 99;
const BREATH_RANGE_MS = 10_000;
const TEXT_WRONG_KEY = "Der Bühnen-Link ist ungültig. Bitte den vollständigen Link öffnen.";
const TEXT_OFFLINE = "Keine Verbindung zum Server. Neuer Versuch läuft …";
const STATUS_UNAUTHORIZED = 401;

/** What changes while the page runs. */
interface StageMemory {
  state: StageState | null;
  catalog: StageCatalog | null;
  lookup: StageLookup;
  clockOffset: number;
  signLabels: Map<string, string>;
  effects: StageEffect[];
  shownPoints: Map<number, StagePoint>;
  lastFrameAt: number;
  reloadPending: boolean;
  streamOpened: boolean;
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

/** Takes over a new state. */
function applyState(memory: StageMemory, state: StageState): void {
  memory.state = state;
  memory.clockOffset = state.server_time - Date.now();
  memory.lookup = {
    players: new Map(state.players.map((player) => [player.id, player])),
    areas: new Map(state.areas.map((area) => [area.id, area])),
  };
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
        onConnectionChange: (isOpen) => showStatus(isOpen ? "" : TEXT_OFFLINE),
      });
    }
  } catch (error) {
    const isWrongKey = error instanceof RequestError && error.status === STATUS_UNAUTHORIZED;
    showStatus(isWrongKey ? TEXT_WRONG_KEY : TEXT_OFFLINE);
  }
}

/** Moves all jellies to where they are shown in this frame. */
function advanceJellies(memory: StageMemory, now: number): ShownJelly[] {
  const elapsedMs = now - memory.lastFrameAt;
  const serverTime = now + memory.clockOffset;
  const nextPoints = new Map<number, StagePoint>();
  const jellies = (memory.state?.players ?? []).map((player) => {
    const target = calculateStagePoint(player, memory.lookup, serverTime);
    const point = moveToward(memory.shownPoints.get(player.id) ?? target, target, elapsedMs);
    nextPoints.set(player.id, point);
    const breathOffset = calculateRandomValue(player.id, SEED_BREATH) * BREATH_RANGE_MS;
    return { player, point, breathOffset };
  });
  memory.shownPoints = nextPoints;
  memory.lastFrameAt = now;
  return jellies;
}

/** Adjusts the canvas to the window and its pixel density. Returns the size in CSS pixels. */
function fitCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const { clientWidth: width, clientHeight: height } = canvas;
  const density = window.devicePixelRatio;
  if (canvas.width !== Math.round(width * density)) {
    canvas.width = Math.round(width * density);
  }
  if (canvas.height !== Math.round(height * density)) {
    canvas.height = Math.round(height * density);
  }
  context.setTransform(density, 0, 0, density, 0, 0);
  return { width, height };
}

/** Starts the page. */
function startStage(): void {
  const stageKey = new URLSearchParams(window.location.search).get("key") ?? "";
  const canvas = findElement<HTMLCanvasElement>("stage");
  const context = canvas.getContext("2d");
  if (!context) {
    showStatus("Dieser Browser kann die Bühne nicht zeichnen.");
    return;
  }
  const memory: StageMemory = {
    state: null,
    catalog: null,
    lookup: { players: new Map(), areas: new Map() },
    clockOffset: 0,
    signLabels: new Map(),
    effects: [],
    shownPoints: new Map(),
    lastFrameAt: Date.now(),
    reloadPending: false,
    streamOpened: false,
  };
  const findSprite = createSpriteCache();
  const paintFrame = () => {
    const now = Date.now();
    const jellies = advanceJellies(memory, now);
    memory.effects = updateEffects(memory.effects, [], now);
    drawStage(context, {
      size: fitCanvas(canvas, context),
      areas: memory.state?.areas ?? [],
      jellies,
      effects: memory.effects,
      signLabels: memory.signLabels,
      now,
      findSprite,
    });
    requestAnimationFrame(paintFrame);
  };
  requestAnimationFrame(paintFrame);
  void reload(memory, stageKey);
  setInterval(() => void reload(memory, stageKey), RELOAD_INTERVAL_MS);
}

startStage();
