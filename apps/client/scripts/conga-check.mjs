/**
 * Zeigt eine Polonaise groß auf der Bühne, ohne Server: Jellies, die einander folgen, zum Ansehen
 * der Girlande und des Tanzschritts. Unter /scripts/conga-check.html über den Vite-Server öffnen.
 *
 * Parameter: `members` (Jellies in der Polonaise samt Kopf, sonst 4), `shape` (`chain`, jedes folgt
 * dem davor, oder `star`, alle folgen dem Kopf, sonst `chain`), `play` (kommagetrennt: `join` lässt
 * ein weiteres Jelly von der anderen Seite der Halle herlaufen und dem letzten folgen, `leave` das
 * zweite aufhören und nach Hause gehen, `walk` den Kopf quer durch die Halle laufen und beim
 * nächsten Mal zurück, `tower` den Kopf auf ein anderes Jelly klettern, `light` den Kopf
 * hervorheben), `after` (Millisekunden bis zum ersten Schritt, sonst 3000, jeder weitere folgt im
 * selben Abstand), `seconds` (so lange gilt das Folgen, sonst 600) und `far`: Das letzte Jelly der
 * Polonaise beginnt auf der anderen Seite der Halle und ist auf dem Weg, so sieht man seine
 * Verbindung entstehen.
 *
 * Wo die Folgenden stehen: wie beim Server neben ihrem Ziel (`findFollowGoal` in
 * `apps/server/internal/movement/walker.go`), 1,8 Jelly-Einheiten links oder rechts je nach ID,
 * sonst auf dem nächsten freien Platz. Das gibt einen Pulk, keine Reihe. `row` stellt stattdessen
 * jedes hinter das Jelly davor, in einer Reihe entlang der Breite der Halle, gegen die Richtung von
 * `walk`. Bekommt ein Jelly ein neues Ziel, laufen ihm seine Folgenden wie beim Server nach. Nach
 * `leave` folgen sie ihm also nach Hause, und der Kopf steht in `chain` allein. Gelaufen wird
 * schneller als mit `walk_speed` des Servers.
 *
 * Dazu wie in `stack-check.mjs`: `zoom` (Faktor auf den Kopf, sonst 6), `still` für weniger
 * Bewegung, `loop` spielt die Schritte immer wieder, `wear` zieht den Jellies Cosmetics an, `own`
 * macht dieses Jelly zum eigenen (sonst den Kopf, ID 1). `film` legt statt des Bilds einen
 * Filmstreifen an: `frames` Bilder (sonst 8) im Abstand von `film` Millisekunden, ab `filmAt`
 * (sonst kurz vor dem ersten Schritt). `log` schreibt als JSON in die Seite, wer laut dem zuletzt
 * gelesenen Stand der Bühne wem folgt, mit dem Abstand der beiden in Jelly-Einheiten, und die Lage
 * der Jellies auf dem Bildschirm, für Tests und `--dump-dom`.
 *
 * Die IDs: 1 ist der Kopf, bis `members` folgen die anderen, dann kommen der Neuling für `join` und
 * der Träger für `tower`.
 *
 * @module
 */

import { createStageView } from "@jelly/stage";
import { DEMO_HALL } from "@jelly/stage/demo-room";

import {
  findFollowSpot,
  keepsSpace,
  measureUnits,
  offsetSpot,
  PERSONAL_SPACE,
} from "../src/map/previewConga.ts";
import { positionAt } from "../src/map/previewNewsWalks.ts";
import { PREVIEW_CATALOG } from "../src/pet/index.ts";

const PARAMS = new URLSearchParams(location.search);
const MEMBERS = Math.max(1, Number(PARAMS.get("members") ?? 4));
const IS_STAR = PARAMS.get("shape") === "star";
const IS_ROW = PARAMS.has("row");
const STEPS = (PARAMS.get("play") ?? "").split(",").filter(Boolean);
const AFTER_MS = Number(PARAMS.get("after") ?? 3000);
const FOLLOW_MS = Number(PARAMS.get("seconds") ?? 600) * 1000;
const ZOOM = Number(PARAMS.get("zoom") ?? 6);
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
/**
 * Der Kopf steht links der Mitte der leeren Halle und läuft mit `walk` nach rechts, nicht bis an
 * die Wand: Dort bliebe die Kamera stehen.
 */
const SPOT = { x: 40, y: 50 };
const ACROSS = { x: 70, y: 50 };
/**
 * Die andere Seite der Halle, vorn links: Von hier kommen der Neuling und mit `far` das letzte
 * Jelly.
 */
const FAR = { x: 15, y: 70 };
const HEAD_ID = 1;
const JOINER_ID = MEMBERS + 1;
const CARRIER_ID = MEMBERS + 2;
const STACK_ID = 1;
const STACK_MS = 120_000;
/** Jelly-Einheiten je Sekunde. Der Server läuft mit 0,4 m/s, das sind hier knapp 1,4. */
const WALK_SPEED = 3;
/** So weit plant der Server jeden Weg voraus (`moveLeadMillis`). */
const LEAD_MS = 1000;
/** Mit `far` läuft das letzte Jelly erst los, wenn die Bühne steht. */
const FAR_LEAD_MS = 1500;
const HIGHLIGHT_MS = 10_000;
/** Eine Reihe mit `row` wird höchstens so lang, dann teilen sich zwei den Platz. */
const ROW_PLACES = 40;

/** Was ein Jelly mit `wear` trägt. */
function dress(index) {
  if (!PARAMS.has("wear")) return {};
  const outfit = OUTFITS[index % OUTFITS.length];
  return Object.fromEntries(
    Object.entries(outfit).map(([slot, key]) => [slot, { key, color: null }]),
  );
}

/**
 * Name und Zuhause des Jellys mit dieser Nummer: der Kopf, wer ihm folgt (zu Hause vorn in einer
 * Reihe, dorthin geht es mit `leave`), der Neuling und hinten der Träger des Turms.
 */
function place(index) {
  if (index === 0) return { name: "Kopf", ...SPOT };
  if (index < MEMBERS) {
    return { name: `Jelly ${index + 1}`, x: SPOT.x + (index - MEMBERS / 2) * 8, y: SPOT.y + 12 };
  }
  if (index === MEMBERS) return { name: "Neuling", x: FAR.x + 8, y: FAR.y };
  return { name: "Träger", x: SPOT.x, y: SPOT.y - 9 };
}

const players = Array.from({ length: MEMBERS + 2 }, (_, index) => ({
  id: index + 1,
  name: place(index).name,
  color: COLORS[index % COLORS.length],
  equipped: dress(index),
  level: 1,
  sign: null,
  follow: null,
  area_id: null,
  is_visitor: false,
  home_x: place(index).x,
  home_y: place(index).y,
}));

/** Der letzte Weg jedes Jellys und wo er endet. Die Bühne liest dieselben Wege bei jedem Stand. */
const moves = new Map();
const goals = new Map();
let stack = null;
/** Mit `row`: auf welcher Seite „hinter“ dem Kopf ist, -1 für links. */
let back = -1;
let listener = null;
let eventId = 0;
/** Der Stand, den die Bühne zuletzt gelesen hat, für `log`. */
let lastState = null;
/** Die Kamera fliegt nur beim ersten Stand zum Kopf, danach gehört sie dem Betrachter. */
let isFramed = false;

const playerOf = (id) => players[id - 1];
const homeOf = (id) => ({ x: playerOf(id).home_x, y: playerOf(id).home_y });

/**
 * Schickt ein Jelly nach `to`, wie beim Server eine Sekunde nach dem Ereignis und von dort, wo es
 * dann steht. Mit `from` steht es stattdessen dort, und der Weg beginnt nach `lead`.
 */
function go(id, to, { kind = "follow", level = 0, lead = LEAD_MS, from } = {}) {
  const start_at = Date.now() + lead;
  const start = from ?? positionAt(moves.get(id), homeOf(id), start_at);
  const t = Math.round((measureUnits(start, to) / WALK_SPEED) * 1000);
  const points = [
    { ...start, t: 0 },
    { ...to, t },
  ];
  const move = { player_id: id, kind, start_at, stack_level: level, points };
  moves.set(id, move);
  goals.set(id, to);
  listener?.onMove(move);
}

/** Wohin die anderen Jellies gerade wollen. */
function listOtherGoals(id) {
  return [...goals].flatMap(([otherId, goal]) => (otherId === id ? [] : [goal]));
}

/** Der Platz eines Jellys neben oder mit `row` hinter dem, dem es folgt. */
function findGoal(id) {
  const target = goals.get(playerOf(id).follow.player_id);
  const others = listOtherGoals(id);
  const isOnStage = ({ x, y }) => x >= 0 && x <= 100 && y >= 0 && y <= 100;
  if (!IS_ROW) {
    return findFollowSpot(id, target, (spot) => isOnStage(spot) && keepsSpace(spot, others));
  }
  for (let step = 1; step < ROW_PLACES; step += 1) {
    const spot = offsetSpot(target, back * step * PERSONAL_SPACE, 0);
    if (isOnStage(spot) && keepsSpace(spot, others)) return spot;
  }
  return target;
}

/** Wie `keepFollowing` des Servers: Wer einem Jelly mit neuem Ziel folgt, läuft ihm nach. */
function trail(targetId) {
  for (const player of players) {
    if (player.follow?.player_id !== targetId) continue;
    go(player.id, findGoal(player.id));
    trail(player.id);
  }
}

function send(type, playerId, payload) {
  eventId += 1;
  listener?.onEvent({ id: eventId, type, player_id: playerId, payload, created_at: Date.now() });
}

/** Lässt ein Jelly einem anderen folgen oder mit `null` aufhören, mit dem Ereignis des Servers. */
function setFollow(id, targetId) {
  const ends_at = Date.now() + FOLLOW_MS;
  playerOf(id).follow = targetId === null ? null : { player_id: targetId, ends_at };
  send("follow.changed", id, { target_id: targetId });
}

/** Löst den Turm auf. Der Träger steht wieder am Boden. */
function dropStack() {
  if (!stack) return;
  send("stack.changed", HEAD_ID, { id: STACK_ID });
  stack = null;
  go(CARRIER_ID, goals.get(CARRIER_ID), { kind: "wander" });
}

/**
 * Stellt alle auf: jedes an seinen Platz, dann die Polonaise in der Reihenfolge der IDs. Beim
 * ersten Mal stehen sie schon dort, für `loop` laufen sie hin.
 */
function setUp(isFirst) {
  back = -1;
  const arrive = (id, to, kind) => {
    const isFar = isFirst && PARAMS.has("far") && id === MEMBERS && id !== HEAD_ID;
    const placed = isFar ? { from: FAR, lead: FAR_LEAD_MS } : { from: to, lead: 0 };
    go(id, to, { kind, ...(isFirst ? placed : {}) });
  };
  for (const player of players) arrive(player.id, homeOf(player.id), "wander");
  for (const player of players.slice(1)) {
    const isMember = player.id <= MEMBERS;
    const targetId = IS_STAR ? HEAD_ID : player.id - 1;
    const ends_at = Date.now() + FOLLOW_MS;
    player.follow = isMember ? { player_id: targetId, ends_at } : null;
    if (!isFirst) send("follow.changed", player.id, { target_id: isMember ? targetId : null });
    if (isMember) arrive(player.id, findGoal(player.id), "follow");
  }
}

/** Was der Server bei jedem Schritt schickt: erst das Ereignis, dann die neuen Wege. */
const PLAYS = {
  join: () => {
    setFollow(JOINER_ID, MEMBERS);
    go(JOINER_ID, findGoal(JOINER_ID));
  },
  leave: () => {
    if (!playerOf(2).follow) return;
    setFollow(2, null);
    go(2, homeOf(2), { kind: "wander" });
    trail(2);
  },
  walk: () => {
    dropStack();
    const isAway = goals.get(HEAD_ID).x > SPOT.x;
    back = isAway ? 1 : -1;
    go(HEAD_ID, isAway ? SPOT : ACROSS, { kind: "trip" });
    trail(HEAD_ID);
  },
  tower: () => {
    if (stack) return;
    // Der Träger beginnt den Stapel, wo er steht, der Kopf klettert darauf.
    const spot = goals.get(CARRIER_ID);
    const ends_at = Date.now() + STACK_MS;
    stack = { id: STACK_ID, ...spot, ends_at, member_ids: [CARRIER_ID, HEAD_ID] };
    send("stack.changed", HEAD_ID, stack);
    go(CARRIER_ID, spot, { kind: "stack" });
    go(HEAD_ID, spot, { kind: "stack", level: 1 });
    trail(HEAD_ID);
  },
  light: () => {
    const ends_at = Date.now() + HIGHLIGHT_MS;
    send("highlight", CARRIER_ID, { target_id: HEAD_ID, ends_at, cosmetic_key: "highlight-aura" });
  },
};

function playSteps() {
  STEPS.forEach((step, index) => setTimeout(() => PLAYS[step]?.(), AFTER_MS * (index + 1)));
  if (PARAMS.has("loop")) {
    setTimeout(
      () => {
        dropStack();
        setUp(false);
        playSteps();
      },
      AFTER_MS * (STEPS.length + 2),
    );
  }
}

setUp(true);

const source = {
  // Kopien: Wem ein Jelly folgt, erfährt die Bühne wie beim Server erst mit dem nächsten Lesen.
  readState: () =>
    Promise.resolve({
      last_event_id: eventId,
      server_time: Date.now(),
      room: { width: 100, height: 100, unit: "percent", ...DEMO_HALL },
      areas: [],
      players: players.map((player) => ({ ...player })),
      moves: [...moves.values()],
      stacks: stack ? [stack] : [],
      gathering: null,
    }),
  readCatalog: () => Promise.resolve(PREVIEW_CATALOG),
  subscribe: (_firstEventId, next) => {
    listener = next;
    next.onConnectionChange(true);
    playSteps();
  },
};

/** Legt `FILM_FRAMES` Ausschnitte um die Mitte untereinander, zwei je Reihe. */
function createFilm(canvas) {
  const film = document.createElement("canvas");
  film.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;background:#1c2530";
  const columns = 2;
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
    // Die Polonaise steht um die Mitte und ist breit: die ganze Breite, im Format der Zelle.
    const cropHeight = Math.min(canvas.height, (canvas.width * cellHeight) / cellWidth);
    const cropY = (canvas.height - cropHeight) / 2;
    const context = film.getContext("2d");
    const column = taken % columns;
    const row = Math.floor(taken / columns);
    const cell = [column * cellWidth, row * cellHeight, cellWidth, cellHeight];
    context.drawImage(canvas, 0, cropY, canvas.width, cropHeight, ...cell);
    // Dunkel: Der Boden der Halle ist fast weiß.
    context.fillStyle = "#1c2530";
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

/** Wer laut dem zuletzt gelesenen Stand wem folgt, mit dem Abstand in Jelly-Einheiten. */
function listFollows() {
  const now = Date.now();
  const spotOf = (id) => positionAt(moves.get(id), homeOf(id), now);
  return (lastState?.players ?? []).flatMap((player) => {
    if (!player.follow) return [];
    const follows = player.follow.player_id;
    const units = Number(measureUnits(spotOf(player.id), spotOf(follows)).toFixed(2));
    return [{ id: player.id, follows, units }];
  });
}

/** Schreibt, wer wem folgt, und die Lage der Jellies auf dem Bildschirm in die Seite. */
function logSpots() {
  const spots = players.map((player) => ({ id: player.id, ...view.locate(player.id) }));
  let pre = document.querySelector("#log");
  if (!pre) {
    pre = document.createElement("pre");
    pre.id = "log";
    // Unsichtbar: Sonst schiebt der Text Rollbalken ins Bild.
    pre.hidden = true;
    document.body.append(pre);
  }
  pre.textContent = JSON.stringify({ follows: listFollows(), spots });
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
  onState: (state) => {
    lastState = state;
    view.setMarks({ ownId: OWN_ID, targetId: null });
    view.setReducedMotion(PARAMS.has("still"));
    if (isFramed) return;
    isFramed = true;
    view.followOwn();
    view.zoomBy(ZOOM);
  },
});
