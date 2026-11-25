/**
 * The data side of a stage view: reads the state from its source, takes over what the event stream
 * reports and reads again when something changed.
 *
 * @module
 */

import type { StageEvent, StageState } from "./types.ts";
import type { StageMemory } from "./viewMemory.ts";

import { createEffects, isFreshEvent, isPulseEvent, updateEffects } from "./effects.ts";
import { rebuildHall } from "./hall.ts";
import { pulseJelly, syncJellies } from "./jellies.ts";
import { findPositions, pruneMoves } from "./moves.ts";
import { flashNews, noteNewsStart } from "./newsDirector.ts";
import { resizeStageScene } from "./scene.ts";
import { ANIMATION_EVENTS, STATE_EVENTS } from "./source.ts";
import { applyStackChange, STACK_CHANGED } from "./stackEvents.ts";
import { createStreamOpenings } from "./streamOpens.ts";
import { keepNewerMove } from "./walking.ts";
import { measureRoom } from "./world.ts";

/** Many events in a row cause only one reload. */
const RELOAD_DELAY_MS = 500;
const STATE_EVENT_TYPES = new Set(STATE_EVENTS);
const ANIMATION_EVENT_TYPES = new Set(ANIMATION_EVENTS);

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

/** Hands an event to the Jelly-News: a fresh award is breaking news, and their own start tells the time. */
function passToNews(memory: StageMemory, event: StageEvent, now: number): void {
  const players = memory.state?.players ?? [];
  flashNews(memory.news, event, { players, serverTime: now + memory.clockOffset });
  noteNewsStart(memory.news, event);
}

/** Returns an event with a payload: where something ended, the server sends `null` instead. */
function withPayload(event: StageEvent): StageEvent {
  return event.payload ? event : { ...event, payload: {} };
}

/** Handles one stream event. A source may also report events the stage does not know. */
function handleEvent(memory: StageMemory, event: StageEvent): void {
  const changesState = STATE_EVENT_TYPES.has(event.type);
  if (!changesState && !ANIMATION_EVENT_TYPES.has(event.type)) {
    return;
  }
  if (event.type === STACK_CHANGED && memory.state) {
    const stacks = applyStackChange(memory.state.stacks, event.payload);
    memory.state = { ...memory.state, stacks };
  }
  const now = Date.now();
  passToNews(memory, event, now);
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
    const streamOpens = createStreamOpenings();
    source.subscribe(state.last_event_id, {
      onEvent: (event) => handleEvent(memory, withPayload(event)),
      onMove: (move) => keepNewerMove(memory.moves, move),
      onReset: () => void reload(memory),
      onConnectionChange: (isOpen) => {
        if (isOpen && streamOpens.record()) {
          void reload(memory);
        }
        onConnectionChange?.(isOpen);
      },
    });
  }
}

/** Reads the state, one read at a time. A call during a read causes one more read after it. */
export async function reload(memory: StageMemory): Promise<void> {
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
