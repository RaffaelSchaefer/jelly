/**
 * Stapel in der Browser-Vorschau, wie sonst beim Server: ein Turm aus drei Jellies nahe dem
 * eigenen, beginnen, draufklettern und absteigen, dazu `stack.changed` und Wege der Art `stack` mit
 * ihrer Höhe. Wie beim Server nennt `stack.changed` einen Stapel, der weg ist, nur mit seiner ID.
 * Ein Stapel zerfällt hier nach einer Minute statt nach zwei. Die Desktop-App lädt diese Datei
 * nie.
 *
 * @module
 */

import type { StageEvent, StageMove, StagePlayer, StagePoint, StageStack } from "@jelly/stage";

import { DEMO_HALL } from "@jelly/stage/demo-room";

import type { MapSource } from "./source";

import { PREVIEW_RULES } from "../pet";

const STACK_MS = 60_000;
/** So lange dauern Klettern und der Weg zurück an den Platz. */
const CLIMB_MS = 1500;
const HOME_MS = 2000;
/**
 * Der Turm, von unten nach oben, als Plätze in der Liste der Jellies. Er steht am Platz des
 * untersten, 7 m vom eigenen Jelly: zu weit zum Klettern (`near_distance` 6 m), nah genug zum
 * Hinsehen. Das Jelly auf Platz 1 steht allein 2 m daneben, für „Stapel starten“.
 */
const TOWER = [3, 2, 5];
const PERCENT = 100;
const TEXT_NOT_FOUND = "Diesen Stapel gibt es nicht mehr.";

/** Was die Stapel vom eigenen Jelly wissen müssen. */
export interface PreviewOwn {
  id: number;
  /** Wo es gerade steht oder hinläuft. */
  spot: () => StagePoint;
  /** Beendet Ausflug und Dazustellen, ohne einen Weg zu schicken. */
  endWalks: () => void;
}

/** Wohin die Vorschau Wege und Ereignisse schickt, sobald die Bühne hört. */
export interface PreviewSend {
  move: (move: StageMove) => void;
  event: (event: StageEvent) => void;
}

/** Die Stapel der Vorschau. */
export type StackPreview = Pick<MapSource, "startStack" | "joinStack" | "leaveStack"> & {
  /** Die laufenden Stapel, als Kopie für das Lesen. */
  list: () => StageStack[];
  /** Wo die Jellies auf den Stapeln stehen, für das Lesen. */
  moves: () => StageMove[];
  /** Der Punkt des Stapels, auf dem ein Jelly steht. */
  spotOf: (playerId: number) => StagePoint | undefined;
  /** Nimmt ein Jelly vom Stapel, weil es losläuft. Seinen Weg schickt der Aufrufer. */
  drop: (playerId: number) => void;
};

/** Abstand zweier Punkte der Bühne in Metern der Demo-Halle. */
function measureMeters(from: StagePoint, to: StagePoint) {
  const dx = ((from.x - to.x) * DEMO_HALL.width_m) / PERCENT;
  const dy = ((from.y - to.y) * DEMO_HALL.depth_m) / PERCENT;
  return Math.hypot(dx, dy);
}

/**
 * Ein `stack.changed`, wie es sonst im Stream kommt: der ganze Stapel, solange er steht, nur seine
 * ID, wenn er weg ist. Dann mit dem Jelly, das als letztes abstieg, oder ohne, wenn er zerfallen
 * ist.
 */
function changed(payload: StageEvent["payload"], playerId: number | null): StageEvent {
  return { id: 0, type: "stack.changed", player_id: playerId, payload, created_at: Date.now() };
}

/** Ein Weg der Art `stack` auf den Stapel. Ohne `from` steht das Jelly schon dort. */
function climbWalk(playerId: number, stack: StageStack, level: number, from?: StagePoint) {
  const top = { x: stack.x, y: stack.y };
  const points = from
    ? [
        { ...from, t: 0 },
        { ...top, t: CLIMB_MS },
      ]
    : [{ ...top, t: 0 }];
  return { player_id: playerId, kind: "stack", start_at: Date.now(), stack_level: level, points };
}

/** Der Weg vom Stapel zurück an den Platz, wieder am Boden. */
function homeWalk(player: StagePlayer, stack: StageStack): StageMove {
  const home = { x: player.home_x, y: player.home_y };
  return {
    player_id: player.id,
    kind: "wander",
    start_at: Date.now(),
    stack_level: 0,
    points: [
      { x: stack.x, y: stack.y, t: 0 },
      { ...home, t: HOME_MS },
    ],
  };
}

/** Stand und Wege der Vorschau-Stapel. */
interface StackStore {
  players: StagePlayer[];
  own: PreviewOwn;
  send: PreviewSend;
  stacks: StageStack[];
  /** Der letzte Weg jedes Jellys auf einem Stapel. */
  standing: Map<number, StageMove>;
  nextId: number;
}

/** Ein Stapel als neues Objekt: Die Bühne soll keine Liste behalten, die sich hier noch ändert. */
function copyStack(stack: StageStack): StageStack {
  return { ...stack, member_ids: [...stack.member_ids] };
}

/** Der Stapel, auf dem ein Jelly steht. */
function stackOf(store: StackStore, playerId: number) {
  return store.stacks.find((stack) => stack.member_ids.includes(playerId));
}

/** Stellt ein Jelly oben auf einen Stapel, oder lässt es dort, eine Höhe tiefer. */
function put(store: StackStore, playerId: number, stack: StageStack, from?: StagePoint) {
  const move = climbWalk(playerId, stack, stack.member_ids.length, from);
  stack.member_ids.push(playerId);
  store.standing.set(playerId, move);
  store.send.move(move);
}

/** Der Stapel zerfällt: Alle gehen zurück an ihren Platz. */
function fallApart(store: StackStore, stack: StageStack) {
  store.stacks.splice(store.stacks.indexOf(stack), 1);
  store.send.event(changed({ id: stack.id }, null));
  for (const player of store.players.filter((p) => stack.member_ids.includes(p.id))) {
    store.standing.delete(player.id);
    store.send.move(homeWalk(player, stack));
  }
}

/** Ein neuer, leerer Stapel, der nach `STACK_MS` zerfällt. */
function create(store: StackStore, point: StagePoint): StageStack {
  const ends_at = Date.now() + STACK_MS;
  const stack: StageStack = { id: store.nextId++, ...point, ends_at, member_ids: [] };
  store.stacks.push(stack);
  setTimeout(() => {
    if (store.stacks.includes(stack)) fallApart(store, stack);
  }, STACK_MS);
  return stack;
}

/** Nimmt ein Jelly vom Stapel. Wer darüber stand, rutscht eine Höhe tiefer. */
function drop(store: StackStore, playerId: number) {
  const stack = stackOf(store, playerId);
  if (!stack) return;
  store.standing.delete(playerId);
  const above = stack.member_ids.splice(stack.member_ids.indexOf(playerId)).slice(1);
  for (const id of above) put(store, id, stack);
  const isGone = stack.member_ids.length === 0;
  if (isGone) store.stacks.splice(store.stacks.indexOf(stack), 1);
  store.send.event(changed(isGone ? { id: stack.id } : copyStack(stack), playerId));
}

/** Beginnt einen Stapel, wo das eigene Jelly steht. Das beendet Ausflug und Dazustellen. */
function startStack(store: StackStore) {
  const { own } = store;
  const here = own.spot();
  own.endWalks();
  drop(store, own.id);
  const stack = create(store, here);
  put(store, own.id, stack);
  store.send.event(changed(copyStack(stack), own.id));
}

/** Klettert auf einen Stapel. `false`, solange er weiter weg steht als `near_distance`. */
function joinStack(store: StackStore, stackId: number) {
  const { own } = store;
  const stack = store.stacks.find((running) => running.id === stackId);
  // Wie ein Fehler aus Rust: nur der fertige Text.
  if (!stack) return Promise.reject(TEXT_NOT_FOUND);
  if (stack.member_ids.includes(own.id)) return Promise.resolve(true);
  const from = own.spot();
  if (measureMeters(from, stack) > PREVIEW_RULES.near_distance) return Promise.resolve(false);
  own.endWalks();
  drop(store, own.id);
  put(store, own.id, stack, from);
  store.send.event(changed(copyStack(stack), own.id));
  return Promise.resolve(true);
}

/** Steigt ab und geht zurück an den Platz. */
function leaveStack(store: StackStore) {
  const stack = stackOf(store, store.own.id);
  const player = store.players.find((p) => p.id === store.own.id);
  drop(store, store.own.id);
  if (stack && player) store.send.move(homeWalk(player, stack));
}

/** Stapel im Speicher, mit dem Turm vom Start an. */
export function createStackPreview(
  players: StagePlayer[],
  own: PreviewOwn,
  send: PreviewSend,
): StackPreview {
  const store: StackStore = { players, own, send, stacks: [], standing: new Map(), nextId: 1 };
  const bottom = players[TOWER[0] ?? 0];
  const tower = create(store, { x: bottom.home_x, y: bottom.home_y });
  for (const index of TOWER) put(store, players[index].id, tower);
  return {
    list: () => store.stacks.map(copyStack),
    moves: () => [...store.standing.values()],
    spotOf: (playerId) => {
      const stack = stackOf(store, playerId);
      return stack && { x: stack.x, y: stack.y };
    },
    drop: (playerId) => drop(store, playerId),
    startStack: () => {
      startStack(store);
      return Promise.resolve();
    },
    joinStack: (stackId) => joinStack(store, stackId),
    leaveStack: () => {
      leaveStack(store);
      return Promise.resolve();
    },
  };
}
