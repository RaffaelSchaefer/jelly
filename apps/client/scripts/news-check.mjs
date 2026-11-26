/**
 * Zeigt die Jelly-News auf der Bühne, ohne Server: Vorleser auf der Bühne, Publikum davor, dazu ein
 * Gathering der Art `news` mit allem, was der Server melden kann. Unter /scripts/news-check.html
 * über den Vite-Server öffnen.
 *
 * Parameter: `seconds` (Dauer des Gatherings, sonst 90), `into` (so viele Sekunden läuft es beim
 * Laden schon, für den späten Einstieg), `nostart` (ohne `starts_at`, wie der Server heute),
 * `achievements` (Zahl, sonst 2, höchstens 5), `stack` (Jellies im höchsten Turm, sonst 3, 0 für
 * keinen), `standing` (der Turm steht noch), `kind` (Art des nächsten Programmpunkts, sonst
 * `tournament`), `nonext`, `noxp`, `nopresenter`, `gone` (das Jelly mit den meisten XP ist nicht
 * mehr im Raum), `long` (lange Namen, Titel mit 80 und Hinweis mit 200 Zeichen), `crowd`
 * (Zuschauer, sonst 24), `signs`, `follow` und `hat` (Stoff für „Vermischtes“), `still` für weniger
 * Bewegung und `loop`: Nach dem Ende beginnen die News von vorn. `delay=<Sekunden>` beginnt die
 * Sendung erst so lange nach dem Laden, wie auf der Karte. Nach dem Ende gehen alle, die zur
 * Sendung gegangen sind, wie beim Server zurück, von der Stelle ihres Wegs, wo der Server sie dann
 * sieht.
 *
 * Zum Studio: `walk=<Sekunden>` schickt den Vorleser mit der Sendung von vorn links auf die Bühne,
 * so viele Sekunden lang. Die Bühne stellt ihn wie jeden Weg der Art `news` des Vorlesers sofort an
 * dessen Ende (`playMoves` in `moves.ts` von `@jelly/stage`), erst nach der Sendung zählt der Weg
 * wieder. `late=<Sekunden>` lässt den Weg so viel später beginnen und eine Sekunde vorher über den
 * Strom kommen, wie der Server ihn plant: `late=1.5` kommt dem Server nahe, bis dahin steht der
 * Vorleser noch an seinem Platz. `hold=<Schlüssel>` gibt ihm ein Cosmetic in die Hände, etwa
 * `golden-cup`, `bfg` oder `kite-shield`. `beside` stellt zwei Gäste an den Tisch, für die
 * Reihenfolge beim Zeichnen: einen auf der Bühne halb hinter sein rechtes Ende, einen im Saal
 * direkt vor ihn.
 *
 * Dazu für den Look: `map` zeigt die Bühne wie im Kartenfenster (Ränder oben 44 und unten 70 Pixel,
 * halb durchsichtig markiert, und die Maske, mit der die Karte zum Rand hin ausläuft). `noshow`
 * lässt die Sendung weg. `award=<Sekunden>` verleiht nach so vielen Sekunden einen Preis, das gibt
 * eine rote Eilmeldung für 8 Sekunden. Eine Sekunde vorher kommt ein veralteter Preis, anderthalb
 * Sekunden danach derselbe noch einmal wie nach einem Neuverbinden: Beide dürfen nichts zeigen.
 *
 * Zur News-Kamera: Ohne Parameter filmt sie von selbst wie auf dem Beamer. `manual` behält die
 * normale Kamera wie die Karte (`newsCamera: "manual"`), `watch` drückt dazu „Sendung ansehen“,
 * sobald eine Sendung läuft. `zoom=<Faktor>` zoomt die normale Kamera beim Start heran wie eine
 * Hand auf der Karte: Mit `watch` endet die Sendung trotzdem in der ganzen Halle, ohne Sprung.
 * `own=<ID>` macht ein Jelly zum eigenen wie auf der Karte, mit Markierung und hervorgehobenem
 * Namen.
 *
 * Zum Vorspann: `notitle` lässt den 3D-Titel mit Globus weg, dann steht das Logo auf dem Band wie
 * solange das Modell lädt (`newsTitle3d: false`). `slow=<Faktor>` lässt die Uhr der Seite so viel
 * langsamer laufen, für dichte Aufnahmen schneller Abläufe wie des Vorspanns: `slow=4` zeigt ihn in
 * Zeitlupe. Die Sendung endet dabei trotzdem nach ihrer echten Dauer. Der kürzeste Vorspann kommt
 * mit `seconds=20`, ein langer mit `seconds=150`.
 *
 * Zu Requisiten vor der Kamera: `hall` zeigt die ganze Demo-Halle mit Lounge, Snackbar und
 * Tischreihen, dazu Zuschauerband und Siegerzone, wie der Demo-Server sie anlegt. Das Publikum
 * steht an den Tischen und geht mit Beginn der Sendung mit 0,4 m/s ins Zuschauerband vor der Bühne,
 * wie beim Server über den Gang an der Wand und an der Bühnenkante entlang, also auch direkt vor
 * dem Vorleser vorbei: Mit `into=` sieht man es unterwegs oder angekommen. Das Jelly mit den
 * meisten XP geht hinter die Rückwand der Lounge, das erste Achievement hinter die Snackbar, das
 * zweite in die Lücke dazwischen. Mit `achievements=5` bleibt das dritte auf dem Teppich der Lounge
 * stehen, das vierte direkt hinter dem Tresen und das fünfte zwischen den Tischreihen. Der Vorleser
 * sitzt an einem Tisch hinten links und bekommt wie beim Demo-Server einen Weg den Gang an der Wand
 * entlang, gut 45 Sekunden lang, steht aber vom Beginn der Sendung an auf der Bühne. Mit
 * `seconds=30` endet die Sendung vor seinem Weg: Dann steht er danach wieder im Gang und geht von
 * dort zurück. `walk=<Sekunden>` nimmt stattdessen den kurzen Weg von vorn links.
 *
 * @module
 */

import { createStageView } from "@jelly/stage";
import { createDemoRoom, DEMO_HALL } from "@jelly/stage/demo-room";

import { PREVIEW_CATALOG } from "../src/pet/index.ts";

const PARAMS = new URLSearchParams(location.search);
const count = (name, usual) => Number(PARAMS.get(name) ?? usual);
/** Mit `slow` läuft die Uhr der Seite langsamer, vor allem anderen: Bühne und Gathering lesen sie. */
const SLOW = count("slow", 1);
if (SLOW > 0 && SLOW !== 1) {
  const realNow = Date.now.bind(Date);
  const origin = realNow();
  Date.now = () => Math.round(origin + (realNow() - origin) / SLOW);
}
const WINDOW_MS = count("seconds", 90) * 1000;
const INTO_MS = count("into", 0) * 1000;
const ACHIEVEMENTS = Math.min(5, count("achievements", 2));
const STACK = count("stack", 3);
const CROWD = count("crowd", 24);
const COLORS = ["mint", "sky", "violet", "rose", "peach", "lemon", "lime", "cherry"];
const KEYS = ["hydrated", "hatched", "marathon", "matching", "conga"];
/** Von der Demo-Halle bleibt nur die Bühne: Sitzreihen und Lounge stünden dem Publikum im Weg. */
const STAGE_PROPS = new Set(["stage-platform", "screen", "speaker", "pedestal"]);
const PRESENTER_ID = 1;
/** Der Vorleser steht vorn auf der Bühne, das Publikum in Reihen davor. In Prozent der Bühne. */
const PRESENTER_SPOT = { x: 50, y: 8.5 };
/** Mit `walk` kommt der Vorleser von hier, vorn links vor der Bühne. */
const WALK_FROM = { x: 12, y: 16 };
/** Mit `beside` stehen hier zwei Gäste am Tisch: hinter seinem rechten Ende und im Saal davor. */
const GUESTS = [
  { id: 90, name: "Gast hinten", spot: { x: 59, y: 8 } },
  { id: 91, name: "Gast vorn", spot: { x: 45, y: 12.2 } },
];
const CROWD_ROWS = { perRow: 8, left: 22, right: 78, front: 17, step: 4.5 };
const TOWER_SPOT = { x: 86, y: 22 };
const TOWER_ID = 1;
const PAUSE_MS = 3000;
const LONG_NAME = "Prinzessin Wackelpudding die Dritte";
const LONG_TITLE = "Großes Mario-Kart-Turnier der Umwelt-Campus-LAN mit Siegerehrung im Foyer!!";
const LONG_DETAIL = `${"Bitte Controller mitbringen und pünktlich sein. ".repeat(4)}Danke.`;
/** Wie im Kartenfenster: Ränder, die die Karte mit Knöpfen belegt, und die Maske am Rand. */
const MAP_INSETS = { top: 44, bottom: 70 };
const MAP_MASK = "radial-gradient(ellipse 72% 72% at center, #000 80%, transparent 100%)";
const AWARD_ID = 9000;
const AWARD_PLAYER_ID = 2;
const AWARD_TITLE = "Goldener Stupser";
const LONG_AWARD_TITLE = "Ehrenpreis für besonders gründliches Händewaschen vor dem Buffet";

/** Mit `hall` die ganze Halle wie beim Server, mit Zuschauerband und Siegerzone, in Prozent. */
const HALL = PARAMS.has("hall");
const NEWS_ZONES = [
  { kind: "spectators", x: 5, y: 11.5, width: 90, height: 2.9 },
  { kind: "winner", x: 40, y: 6.3, width: 20, height: 3.9 },
];
const areas = HALL
  ? [
      ...createDemoRoom(),
      ...NEWS_ZONES.map((zone, index) => ({
        ...zone,
        id: 900 + index,
        rotation: 0,
        blocks: false,
        prop: "",
        name: null,
      })),
    ]
  : createDemoRoom().filter((area) => STAGE_PROPS.has(area.prop));
/** Mit `hall` stehen die Zuschauer an den Tischen, drei je Sitzreihe. */
const SEATS = createDemoRoom().filter((area) => area.kind === "seats");
/** Wohin die benannten Jellies gehen: hinter die Lounge, hinter die Snackbar, in die Lücke. */
const NEWS_SPOTS = { 2: { x: 25, y: 13 }, 3: { x: 75, y: 13 }, 4: { x: 55, y: 13 } };
/** Wer stehen bleibt: auf dem Teppich der Lounge, direkt hinter dem Tresen der Snackbar. */
const STAYING = { 5: { x: 25, y: 22 }, 6: { x: 75, y: 15.8 } };
/** So schnell gehen die Jellies des Servers, in Metern pro Sekunde. */
const WALK_SPEED = 0.4;
/** Mit `hall` gehen die Zuschauer über die Gänge an den Wänden und an der Bühnenkante entlang. */
const AISLES = { left: 2.6, right: 97.4, edge: 10.8 };
/** Mit `hall` der Weg des Vorlesers wie beim Demo-Server: vom Tisch über den Gang an der Wand. */
const HALL_WAY = [
  { x: 19.6, y: 82.7 },
  { x: 2.6, y: 79.1 },
  { x: 2.6, y: 28.2 },
  { x: 6.3, y: 27.8 },
  { x: 48.9, y: 12.7 },
  PRESENTER_SPOT,
];

/** Wo ein Zuschauer mit `hall` steht: an einem Sitzplatz der Demo-Halle. */
function placeSeat(index) {
  const seat = SEATS[index % SEATS.length];
  const along = ((Math.floor(index / SEATS.length) % 3) + 0.5) / 3;
  return { x: seat.x + along * seat.width, y: seat.y + seat.height / 2 };
}

/** Wohin ein Zuschauer mit `hall` geht: verteilt über das Zuschauerband vor der Bühne. */
function placeInBand(index) {
  return { x: 7 + ((index * 37) % 86), y: 12 + (index % 2) * 1.6 };
}

/** Wo ein Zuschauer steht: Reihe für Reihe von der Bühne weg, versetzt. */
function placeWatcher(index) {
  const { perRow, left, right, front, step } = CROWD_ROWS;
  const row = Math.floor(index / perRow);
  const shift = row % 2 === 0 ? 0 : (right - left) / perRow / 2;
  return { x: left + shift + ((index % perRow) * (right - left)) / perRow, y: front + row * step };
}

/** Was ein Jelly trägt: mit `hat` Jelly 9 den Hut des Zauberers, mit `hold` der Vorleser etwas. */
function dress(id) {
  if (PARAMS.has("hat") && id === 9) return { head: { key: "wizard-hat", color: null } };
  const held = PARAMS.get("hold");
  return held && id === PRESENTER_ID ? { hands: { key: held, color: null } } : {};
}

/** Der Vorleser hat die ID 1, die Zuschauer folgen. */
function createPlayers() {
  const watchers = Array.from({ length: CROWD }, (_, index) => ({
    id: index + 2,
    name: PARAMS.has("long") && index === 0 ? LONG_NAME : `Jelly ${index + 2}`,
    spot: placeWatcher(index),
  }));
  // Gäste vor dem Publikum: Der Turm besteht aus den letzten Zuschauern.
  const guests = PARAMS.has("beside") ? GUESTS : [];
  // Mit `hall` stehen die Zuschauer an den Tischen, zwei bleiben in Lounge und Snackbar.
  if (HALL) {
    for (const [index, watcher] of watchers.entries()) {
      watcher.spot = STAYING[watcher.id] ?? placeSeat(index);
    }
  }
  const cast = PARAMS.has("nopresenter")
    ? [...guests, ...watchers]
    : [{ id: PRESENTER_ID, name: "Anchor", spot: PRESENTER_HOME }, ...guests, ...watchers];
  return cast.map(({ id, name, spot }, index) => ({
    id,
    name,
    color: COLORS[index % COLORS.length],
    equipped: dress(id),
    level: 1 + (index % 9),
    sign: PARAMS.has("signs") && index % 3 === 2 ? "cs2" : null,
    follow:
      PARAMS.has("follow") && id === 7 ? { player_id: 8, ends_at: Date.now() + 600_000 } : null,
    area_id: null,
    is_visitor: false,
    home_x: spot.x,
    home_y: spot.y,
  }));
}

/** Mit `walk` oder `hall` sitzt der Vorleser vor der Sendung am Anfang seines Wegs. */
const PRESENTER_WAY = planPresenterWay();
const PRESENTER_HOME = PRESENTER_WAY
  ? { x: PRESENTER_WAY[0].x, y: PRESENTER_WAY[0].y }
  : PRESENTER_SPOT;
const players = createPlayers();
/** Die Jellies des Turms sind die letzten Zuschauer, damit vorn niemand fehlt. */
const towerIds = players.slice(players.length - STACK).map((player) => player.id);

function createNews() {
  const next = {
    starts_at: Date.now() + 25 * 60_000,
    ends_at: null,
    title: PARAMS.has("long") ? LONG_TITLE : "CS2-Turnier",
    detail: PARAMS.has("long") ? LONG_DETAIL : "Finale auf der Hauptbühne",
    kind: PARAMS.get("kind") ?? "tournament",
  };
  return {
    top_xp: PARAMS.has("noxp") ? null : { player_id: PARAMS.has("gone") ? 999 : 2, xp: 420 },
    achievements: KEYS.slice(0, ACHIEVEMENTS).map((key, index) => ({ player_id: index + 3, key })),
    tallest_stack: towerIds,
    next_item: PARAMS.has("nonext") ? null : next,
  };
}

/** Ein Gathering, das beim ersten Mal schon `into` Sekunden läuft. */
function createGathering(intoMs) {
  const startsAt = Date.now() - intoMs;
  return {
    kind: "news",
    winner_id: null,
    ends_at: startsAt + WINDOW_MS,
    presenter_id: PARAMS.has("nopresenter") ? null : PRESENTER_ID,
    news: createNews(),
    ...(PARAMS.has("nostart") ? {} : { starts_at: startsAt }),
  };
}

/** Mit `delay` beginnt die Sendung erst so viele Sekunden nach dem Laden, wie auf der Karte. */
const DELAY_MS = count("delay", 0) * 1000;
/**
 * Mit `late` plant der Server den Weg des Vorlesers erst nach der Sendung: Er beginnt so viele
 * Sekunden nach ihr und kommt eine Sekunde vorher über den Strom, wie `moveLeadMillis` des
 * Servers.
 */
const LATE_MS = count("late", 0) * 1000;
const LEAD_MS = 1000;
let gathering = PARAMS.has("noshow") || DELAY_MS > 0 ? null : createGathering(INTO_MS);
let listener = null;
let eventId = 0;
/** Nach dem Ende die Wege zurück an den Platz, wie der Server sie dann schickt. */
let backs = [];

/** Meldet Anfang oder Ende wie der Server: Die Bühne liest danach den Stand neu. */
function sendGathering() {
  eventId += 1;
  const event = { id: eventId, type: "gathering.changed", player_id: null, payload: gathering };
  listener?.onEvent({ ...event, created_at: Date.now() });
}

/** Meldet einen Preis wie der Server, mit der Zeit, zu der er vergeben wurde. */
function sendAward(id, createdAt) {
  const title = PARAMS.has("long") ? LONG_AWARD_TITLE : AWARD_TITLE;
  const event = { id, type: "award.given", player_id: AWARD_PLAYER_ID, payload: { title } };
  listener?.onEvent({ ...event, created_at: createdAt });
}

/** Vergibt mit `award` einen Preis: davor einen veralteten, danach denselben noch einmal. */
function runAward() {
  if (!PARAMS.has("award")) return;
  const atMs = count("award", 3) * 1000;
  setTimeout(() => sendAward(AWARD_ID - 1, Date.now() - 20_000), Math.max(0, atMs - 1000));
  setTimeout(() => {
    const createdAt = Date.now();
    sendAward(AWARD_ID, createdAt);
    setTimeout(() => sendAward(AWARD_ID, createdAt), 1500);
  }, atMs);
}

/**
 * Beendet die News zu ihrer Zeit und schickt alle, die zur Sendung gegangen sind, zurück. Mit
 * `loop` beginnen sie nach einer Pause neu.
 */
function runShow() {
  if (!gathering) return;
  setTimeout(
    () => {
      const endsAt = gathering.ends_at;
      const walked = [...walkIn(), ...walkNews(listStanding().moves)];
      gathering = null;
      backs = walked.map((move) => walkBack(move, endsAt));
      sendGathering();
      for (const move of backs) listener?.onMove(move);
      if (PARAMS.has("loop")) setTimeout(beginShow, PAUSE_MS);
    },
    Math.max(0, gathering.ends_at - Date.now()),
  );
}

/** Beginnt eine Sendung jetzt, wie mit `delay` und `loop`. */
function beginShow() {
  gathering = createGathering(0);
  backs = [];
  sendGathering();
  sendLateWalk();
  runShow();
}

/** Schickt mit `late` den Weg des Vorlesers über den Strom, sobald ihn der Server plant. */
function sendLateWalk() {
  const move = gathering && presenterWalk();
  const dueIn = move ? move.start_at - LEAD_MS - Date.now() : 0;
  if (dueIn <= 0) return;
  setTimeout(() => listener?.onMove(move), dueIn);
}

/** Die Jellies des Turms, mit `standing` noch aufeinander, sonst im Publikum. */
function listStanding() {
  if (!PARAMS.has("standing") || towerIds.length < 2) return { moves: [], stacks: [] };
  const moves = towerIds.map((playerId, level) => ({
    player_id: playerId,
    kind: "stack",
    start_at: Date.now(),
    stack_level: level,
    points: [{ ...TOWER_SPOT, t: 0 }],
  }));
  const ends_at = Date.now() + 600_000;
  return { moves, stacks: [{ id: TOWER_ID, ...TOWER_SPOT, ends_at, member_ids: towerIds }] };
}

/** Gibt den Punkten eines Wegs ihre Zeiten, mit 0,4 m/s wie beim Server. */
function timeWay(points) {
  let ms = 0;
  return points.map((point, index) => {
    const last = points[index - 1] ?? point;
    const meters = Math.hypot(
      ((point.x - last.x) * DEMO_HALL.width_m) / 100,
      ((point.y - last.y) * DEMO_HALL.depth_m) / 100,
    );
    ms += (meters / WALK_SPEED) * 1000;
    return { ...point, t: ms };
  });
}

/** Der Weg des Vorlesers zur Sendung, mit Zeiten: mit `walk` von vorn links, mit `hall` vom Tisch. */
function planPresenterWay() {
  if (PARAMS.has("walk")) {
    return [
      { ...WALK_FROM, t: 0 },
      { ...PRESENTER_SPOT, t: count("walk", 6) * 1000 },
    ];
  }
  return HALL ? timeWay(HALL_WAY) : null;
}

/** Der Weg der Art `news` des Vorlesers zur laufenden Sendung, null ohne. */
function presenterWalk() {
  if (!gathering || PARAMS.has("nopresenter") || !PRESENTER_WAY) return null;
  const start_at = gathering.ends_at - WINDOW_MS + LATE_MS;
  return { player_id: PRESENTER_ID, kind: "news", start_at, stack_level: 0, points: PRESENTER_WAY };
}

/**
 * Mit `walk` oder `hall` geht der Vorleser mit dem Beginn der Sendung auf die Bühne, wie beim
 * Server. Im Stand steht der Weg erst, wenn der Server ihn geplant hat.
 */
function walkIn() {
  const move = presenterWalk();
  return move && Date.now() >= move.start_at - LEAD_MS ? [move] : [];
}

/** Wo ein Weg das Jelly bis `at` entlanggeführt hat: seine Punkte bis zu der Stelle, wo es dann ist. */
function walkedPart(move, at) {
  const elapsed = at - move.start_at;
  const walked = [];
  for (const [index, point] of move.points.entries()) {
    const last = move.points[index - 1];
    if (point.t <= elapsed || !last) {
      walked.push({ x: point.x, y: point.y });
      continue;
    }
    const share = Math.max(0, (elapsed - last.t) / (point.t - last.t));
    walked.push({ x: last.x + (point.x - last.x) * share, y: last.y + (point.y - last.y) * share });
    break;
  }
  return walked;
}

/**
 * Der Weg zurück nach der Sendung, wie ihn der Server schickt: eine Sekunde im Voraus geplant, von
 * der Stelle seines Wegs, wo der Server das Jelly dann sieht, denselben Weg zurück an den Platz.
 */
function walkBack(move, endsAt) {
  const start_at = endsAt + LEAD_MS;
  const points = timeWay(walkedPart(move, start_at).reverse());
  return { ...move, kind: "wander", start_at, points };
}

/** Mit `hall` geht das Publikum mit Beginn der Sendung ins Zuschauerband, mit 0,4 m/s. */
function walkNews(others) {
  if (!HALL || !gathering) return [];
  const start_at = gathering.ends_at - WINDOW_MS + LATE_MS;
  const moved = new Set(others.map((move) => move.player_id));
  return players.flatMap((player, index) => {
    if (player.id === PRESENTER_ID || STAYING[player.id] || moved.has(player.id)) return [];
    const to = NEWS_SPOTS[player.id] ?? placeInBand(index);
    const aisle = player.home_x < 50 ? AISLES.left : AISLES.right;
    const points = timeWay([
      { x: player.home_x, y: player.home_y },
      { x: aisle, y: player.home_y },
      { x: aisle, y: AISLES.edge },
      { x: to.x, y: AISLES.edge },
      to,
    ]);
    return [{ player_id: player.id, kind: "news", start_at, stack_level: 0, points }];
  });
}

const source = {
  readState: () => {
    const { moves, stacks } = listStanding();
    return Promise.resolve({
      last_event_id: eventId,
      server_time: Date.now(),
      room: { width: 100, height: 100, unit: "percent", ...DEMO_HALL },
      areas,
      players,
      moves: [...moves, ...walkIn(), ...walkNews(moves), ...backs],
      stacks,
      gathering,
    });
  },
  readCatalog: () => Promise.resolve(PREVIEW_CATALOG),
  subscribe: (_firstEventId, next) => {
    listener = next;
    next.onConnectionChange(true);
    if (DELAY_MS > 0 && !PARAMS.has("noshow")) {
      setTimeout(beginShow, DELAY_MS);
    } else {
      sendLateWalk();
      runShow();
    }
    runAward();
  },
};

/** Legt mit `map` Maske und Ränder des Kartenfensters über die Bühne. */
function imitateMap(canvas) {
  if (!PARAMS.has("map")) return;
  document.body.style.background = "#eef4fa";
  canvas.style.maskImage = MAP_MASK;
  canvas.style.webkitMaskImage = MAP_MASK;
  for (const [side, height] of Object.entries(MAP_INSETS)) {
    const band = document.createElement("div");
    band.style.cssText = `position:fixed;left:0;right:0;${side}:0;height:${height}px;background:#17243a33`;
    document.body.append(band);
  }
}

const canvas = document.querySelector("#stage");
imitateMap(canvas);
const view = createStageView({
  canvas,
  source,
  supersampling: 2,
  reloadDelayMs: 50,
  ...(PARAMS.has("map") ? { insets: MAP_INSETS } : {}),
  newsCamera: PARAMS.has("manual") || PARAMS.has("watch") ? "manual" : "auto",
  newsTitle3d: !PARAMS.has("notitle"),
});
view.setReducedMotion(PARAMS.has("still"));
if (PARAMS.has("own")) view.setMarks({ ownId: count("own", 2), targetId: null });
if (PARAMS.has("zoom")) view.zoomBy(count("zoom", 1));
/** Wie der Knopf der Karte: sobald eine Sendung läuft und die Kamera sie nicht filmt. */
if (PARAMS.has("watch")) {
  setInterval(() => {
    const { onAir, watching } = view.readNews();
    if (onAir && !watching) view.watchNews(true);
  }, 250);
}
