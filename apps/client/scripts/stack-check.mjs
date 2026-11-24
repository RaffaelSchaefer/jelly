/**
 * Zeigt einen Stapel groß auf der Bühne, ohne Server: zum Ansehen von Klettern, Absteigen, Zerfall
 * und Leuchtturm. Unter /scripts/stack-check.html über den Vite-Server öffnen.
 *
 * Parameter: `members` (Jellies im Turm, sonst 3), `play` (kommagetrennt: `climb` lässt ein Jelly
 * hinlaufen und draufklettern, `leave` das zweite von unten absteigen, `decay` den Turm zerfallen,
 * `light` die Spitze hervorheben), `after` (Millisekunden bis zum ersten Schritt, sonst 3000, jeder
 * weitere folgt im selben Abstand), `seconds` (Lebenszeit des Stapels, sonst 120), `zoom` (Faktor
 * auf den Turm, sonst 3) und `still` für weniger Bewegung. `loop` spielt die Schritte immer wieder.
 * `wear` zieht den Jellies Cosmetics an, `own` macht dieses Jelly zum eigenen (sonst das unterste),
 * `sign` gibt jedem zweiten ein Schild. Vor und hinter dem Turm steht je ein weiterer Zuschauer.
 * `film` legt statt des Bilds einen Filmstreifen an: `frames` Bilder (sonst 8) im Abstand von
 * `film` Millisekunden, ab `filmAt` (sonst kurz vor dem ersten Schritt). `log` schreibt die Lage
 * der Jellies auf dem Bildschirm als JSON in die Seite, für Tests und `--dump-dom`.
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
const OWN_ID = Number(PARAMS.get("own") ?? 1);
/** Was die Jellies mit `wear` tragen, reihum. */
const OUTFITS = [
  { head: "party-hat", body: "fairy-wings" },
  { head: "headset", hands: "goose" },
  { head: "cat-ears", body: "knit-scarf" },
  { hands: "cat-paws", body: "mini-backpack" },
  { head: "beanie", hands: "long-schnoerbi" },
];
const FILM_MS = Number(PARAMS.get("film") ?? 0);
const FILM_FRAMES = Number(PARAMS.get("frames") ?? 8);
const FILM_AT = Number(PARAMS.get("filmAt") ?? AFTER_MS - 100);
/** Der Turm steht in der Mitte der leeren Halle, Zuschauer und Kletterer daneben. */
const SPOT = { x: 50, y: 50 };
const STACK_ID = 1;
const WALK_MS = 1500;
/** So weit plant der Server jeden Weg voraus (`moveLeadMillis`). */
const LEAD_MS = 1000;
const HIGHLIGHT_MS = 10_000;
/** Die ersten IDs gehören dem Turm von unten nach oben, dann kommt der Kletterer. */
const CLIMBER_ID = MEMBERS + 1;
const WATCHER_ID = MEMBERS + 2;
/** Die Zuschauer neben, vor und hinter dem Turm, relativ zu ihm. */
const WATCHERS = [
  { name: "Zuschauer", x: 9, y: 0 },
  { name: "Vorne", x: 2, y: 6 },
  { name: "Hinten", x: -3, y: -7 },
];

/** Was ein Jelly mit `wear` trägt. */
function dress(index) {
  if (!PARAMS.has("wear")) return {};
  const outfit = OUTFITS[index % OUTFITS.length];
  return Object.fromEntries(
    Object.entries(outfit).map(([slot, key]) => [slot, { key, color: null }]),
  );
}

/** Name und Platz des Jellys mit dieser Nummer: erst der Turm, dann Kletterer und Zuschauer. */
function place(index) {
  if (index < MEMBERS) return { name: `Etage ${index + 1}`, x: SPOT.x, y: SPOT.y };
  if (index === MEMBERS) return { name: "Kletterer", x: SPOT.x - 9, y: SPOT.y };
  const watcher = WATCHERS[index - MEMBERS - 1];
  return { name: watcher.name, x: SPOT.x + watcher.x, y: SPOT.y + watcher.y };
}

const players = Array.from({ length: MEMBERS + 1 + WATCHERS.length }, (_, index) => ({
  id: index + 1,
  name: place(index).name,
  color: COLORS[index % COLORS.length],
  equipped: dress(index),
  level: 1,
  sign: PARAMS.has("sign") && index % 2 === 1 ? "any" : null,
  follow: null,
  area_id: null,
  is_visitor: false,
  home_x: place(index).x,
  home_y: place(index).y,
}));

let members = players.slice(0, MEMBERS).map((player) => player.id);
let listener = null;
let eventId = 0;
/** Die Kamera fliegt nur beim ersten Stand zum Turm, danach gehört sie dem Betrachter. */
let isFramed = false;

/**
 * Ein Weg, der wie beim Server eine Sekunde nach dem Ereignis beginnt. Ohne `to` bleibt das Jelly
 * stehen, wie nach einem Nachrutschen. Wege im ersten Stand (`lead` 0) haben längst begonnen.
 */
function walk(playerId, level, from, { to = from, kind = "stack", lead = LEAD_MS } = {}) {
  return {
    player_id: playerId,
    kind,
    start_at: Date.now() + lead,
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
    listener?.onMove(
      walk(CLIMBER_ID, members.length - 1, { x: SPOT.x - 9, y: SPOT.y }, { to: SPOT }),
    );
  },
  leave: () => {
    const leaver = members[1];
    if (leaver === undefined) return;
    members = members.filter((id) => id !== leaver);
    // Wie der Server: Ein Stapel, der weiter steht, kommt ganz, mit dem Jelly, das gegangen ist.
    sendStack(leaver);
    listener?.onMove(walk(leaver, 0, SPOT, { to: { x: SPOT.x, y: SPOT.y + 9 }, kind: "wander" }));
    members.forEach((id, level) => listener?.onMove(walk(id, level, SPOT)));
  },
  decay: () => {
    const fallen = members;
    members = [];
    send("stack.changed", null, { id: STACK_ID });
    fallen.forEach((id, index) => {
      const angle = index * 2.4;
      const to = { x: SPOT.x + 7 * Math.cos(angle), y: SPOT.y + 7 * Math.sin(angle) };
      listener?.onMove(walk(id, 0, SPOT, { to, kind: "wander" }));
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
  listener?.onMove(walk(CLIMBER_ID, 0, { x: SPOT.x - 9, y: SPOT.y }, { kind: "wander" }));
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
      moves: members.map((id, level) => walk(id, level, SPOT, { lead: 0 })),
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

/** Legt `FILM_FRAMES` Ausschnitte um die Mitte nebeneinander, vier je Reihe. */
function createFilm(canvas) {
  const film = document.createElement("canvas");
  film.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;background:#1c2530";
  const columns = 4;
  const rows = Math.ceil(FILM_FRAMES / columns);
  let taken = 0;
  let next = performance.now() + FILM_AT;
  return () => {
    if (taken >= FILM_FRAMES || performance.now() < next) return;
    if (taken === 0) {
      Object.assign(film, { width: canvas.width, height: canvas.height });
      document.body.append(film);
    }
    const cellWidth = film.width / columns;
    const cellHeight = film.height / rows;
    // Der Turm steht in der Mitte und ragt nach oben: halb so breit wie das Bild, im Format der Zelle.
    const cropWidth = canvas.width / 2;
    const cropHeight = Math.min(canvas.height, (cropWidth * cellHeight) / cellWidth);
    const cropY = Math.max(0, canvas.height * 0.55 - cropHeight * 0.85);
    const context = film.getContext("2d");
    const column = taken % columns;
    const row = Math.floor(taken / columns);
    const cell = [column * cellWidth, row * cellHeight, cellWidth, cellHeight];
    context.drawImage(canvas, canvas.width / 4, cropY, cropWidth, cropHeight, ...cell);
    context.fillStyle = "#fff";
    context.font = "bold 14px system-ui";
    context.fillText(
      `${Math.round(next - start)} ms`,
      column * cellWidth + 6,
      row * cellHeight + 18,
    );
    taken += 1;
    next += FILM_MS;
  };
}

/** Schreibt die Lage der Jellies auf dem Bildschirm in die Seite. */
function logSpots() {
  const spots = players.map((player) => ({ id: player.id, ...view.locate(player.id) }));
  let pre = document.querySelector("#log");
  if (!pre) {
    pre = document.createElement("pre");
    pre.id = "log";
    document.body.append(pre);
  }
  pre.textContent = JSON.stringify(spots);
}

const start = performance.now();
const canvas = document.querySelector("#stage");
const filmFrame = FILM_MS > 0 ? createFilm(canvas) : null;

const view = createStageView({
  canvas,
  onFrame: () => {
    filmFrame?.();
    if (PARAMS.has("log")) logSpots();
  },
  source,
  supersampling: 1,
  // Die Seite liest sonst mitten im Ablauf einen frischen Stapel mit voller Restzeit.
  reloadDelayMs: 3_600_000,
  onState: () => {
    view.setMarks({ ownId: OWN_ID, targetId: null });
    view.setReducedMotion(PARAMS.has("still"));
    if (isFramed) return;
    isFramed = true;
    view.followOwn();
    view.zoomBy(ZOOM);
  },
});
