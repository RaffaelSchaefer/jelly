/**
 * Zeigt einen Stapel groß auf der Bühne, ohne Server: zum Ansehen von Klettern, Absteigen, Zerfall
 * und Leuchtturm. Unter /scripts/stack-check.html über den Vite-Server öffnen.
 *
 * Parameter: `members` (Jellies im Turm, sonst 3), `play` (kommagetrennt: `climb` lässt ein Jelly
 * hinlaufen und draufklettern, `leave` das zweite von unten absteigen, `decay` den Turm zerfallen,
 * `light` die Spitze hervorheben), `after` (Millisekunden bis zum ersten Schritt, sonst 3000, jeder
 * weitere folgt im selben Abstand), `seconds` (Lebenszeit des Stapels, sonst 120), `zoom` (Faktor
 * auf den Turm, sonst 3) und `still` für weniger Bewegung. `loop` spielt die Schritte immer wieder.
 *
 * @module
 */

import { createStageView } from "@jelly/stage";
import { DEMO_HALL } from "@jelly/stage/demo-room";

import { PREVIEW_CATALOG } from "../src/pet/index.ts";

const PARAMS = new URLSearchParams(location.search);
const MEMBERS = Number(PARAMS.get("members") ?? 3);
const STEPS = (PARAMS.get("play") ?? "").split(",").filter(Boolean);
const AFTER_MS = Number(PARAMS.get("after") ?? 3000);
const STACK_MS = Number(PARAMS.get("seconds") ?? 120) * 1000;
const ZOOM = Number(PARAMS.get("zoom") ?? 3);
const COLORS = ["mint", "sky", "violet", "rose", "peach", "lemon", "lime", "cherry"];
/** Der Turm steht in der Mitte der leeren Halle, Zuschauer und Kletterer daneben. */
const SPOT = { x: 50, y: 50 };
const STACK_ID = 1;
const WALK_MS = 1500;
const HIGHLIGHT_MS = 10_000;
/** Die ersten IDs gehören dem Turm von unten nach oben, dann kommt der Kletterer. */
const CLIMBER_ID = MEMBERS + 1;
const WATCHER_ID = MEMBERS + 2;

const players = Array.from({ length: MEMBERS + 2 }, (_, index) => ({
  id: index + 1,
  name: index < MEMBERS ? `Etage ${index + 1}` : index === MEMBERS ? "Kletterer" : "Zuschauer",
  color: COLORS[index % COLORS.length],
  equipped: {},
  level: 1,
  sign: null,
  follow: null,
  area_id: null,
  is_visitor: false,
  home_x: index < MEMBERS ? SPOT.x : SPOT.x + (index === MEMBERS ? -9 : 9),
  home_y: SPOT.y,
}));

let members = players.slice(0, MEMBERS).map((player) => player.id);
let listener = null;
let eventId = 0;
/** Die Kamera fliegt nur beim ersten Stand zum Turm, danach gehört sie dem Betrachter. */
let isFramed = false;

/** Ein Weg, der jetzt beginnt. Ohne `to` bleibt das Jelly stehen, wie nach einem Nachrutschen. */
function walk(playerId, level, from, to = from, kind = "stack") {
  return {
    player_id: playerId,
    kind,
    start_at: Date.now(),
    stack_level: level,
    points: [
      { ...from, t: 0 },
      { ...to, t: from === to ? 0 : WALK_MS },
    ],
  };
}

function send(type, playerId, payload) {
  eventId += 1;
  listener?.onEvent({ id: eventId, type, player_id: playerId, payload, created_at: Date.now() });
}

function sendStack(playerId, endsAt = Date.now() + STACK_MS) {
  send("stack.changed", playerId, { id: STACK_ID, ...SPOT, ends_at: endsAt, member_ids: members });
}

/** Was der Server bei jedem Schritt schickt: erst das Ereignis, dann die neuen Wege. */
const PLAYS = {
  climb: () => {
    members = [...members, CLIMBER_ID];
    sendStack(CLIMBER_ID);
    listener?.onMove(walk(CLIMBER_ID, members.length - 1, { x: SPOT.x - 9, y: SPOT.y }, SPOT));
  },
  leave: () => {
    const leaver = members[1];
    if (leaver === undefined) return;
    members = members.filter((id) => id !== leaver);
    sendStack(leaver);
    listener?.onMove(walk(leaver, 0, SPOT, { x: SPOT.x, y: SPOT.y + 9 }, "wander"));
    members.forEach((id, level) => listener?.onMove(walk(id, level, SPOT)));
  },
  decay: () => {
    const fallen = members;
    members = [];
    send("stack.changed", null, { id: STACK_ID });
    fallen.forEach((id, index) => {
      const angle = index * 2.4;
      const to = { x: SPOT.x + 7 * Math.cos(angle), y: SPOT.y + 7 * Math.sin(angle) };
      listener?.onMove(walk(id, 0, SPOT, to, "wander"));
    });
  },
  light: () => {
    const top = members.at(-1);
    if (top === undefined) return;
    const ends_at = Date.now() + HIGHLIGHT_MS;
    send("highlight", WATCHER_ID, { target_id: top, ends_at, cosmetic_key: "highlight-aura" });
  },
};

/** Stellt den Turm wieder auf, für `loop`. */
function rebuild() {
  members = players.slice(0, MEMBERS).map((player) => player.id);
  sendStack(members[0]);
  members.forEach((id, level) => listener?.onMove(walk(id, level, SPOT)));
  listener?.onMove(walk(CLIMBER_ID, 0, { x: SPOT.x - 9, y: SPOT.y }, undefined, "wander"));
}

function playSteps() {
  STEPS.forEach((step, index) => setTimeout(() => PLAYS[step]?.(), AFTER_MS * (index + 1)));
  if (PARAMS.has("loop")) {
    setTimeout(
      () => {
        rebuild();
        playSteps();
      },
      AFTER_MS * (STEPS.length + 2),
    );
  }
}

const source = {
  readState: () =>
    Promise.resolve({
      last_event_id: eventId,
      server_time: Date.now(),
      room: { width: 100, height: 100, unit: "percent", ...DEMO_HALL },
      areas: [],
      players,
      moves: members.map((id, level) => walk(id, level, SPOT)),
      stacks:
        members.length === 0
          ? []
          : [{ id: STACK_ID, ...SPOT, ends_at: Date.now() + STACK_MS, member_ids: members }],
      gathering: null,
    }),
  readCatalog: () => Promise.resolve(PREVIEW_CATALOG),
  subscribe: (_firstEventId, next) => {
    listener = next;
    next.onConnectionChange(true);
    playSteps();
  },
};

const view = createStageView({
  canvas: document.querySelector("#stage"),
  source,
  supersampling: 1,
  // Die Seite liest sonst mitten im Ablauf einen frischen Stapel mit voller Restzeit.
  reloadDelayMs: 3_600_000,
  onState: () => {
    view.setMarks({ ownId: 1, targetId: null });
    view.setReducedMotion(PARAMS.has("still"));
    if (isFramed) return;
    isFramed = true;
    view.followOwn();
    view.zoomBy(ZOOM);
  },
});
