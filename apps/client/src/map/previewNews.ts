/**
 * Die Jelly-News in der Browser-Vorschau der Karte, `map.html#news`, wie sonst der Server: ein
 * Gathering der Art `news` mit Vorleser, den meisten XP (beim eigenen Jelly), drei Erfolgen, dem
 * Turm der Vorschau als höchstem und dem nächsten Programmpunkt. Dazu Wege der Art `news` vor die
 * Bühne, eine Sekunde im Voraus, und nach dem Ende Wege zurück an den Platz. Ein reguläres Ende
 * meldet der Server nicht, es zählt `ends_at`. Die erste Sendung beginnt kurz nach dem Öffnen, dann
 * wiederholt sie sich nach einer Pause. Plätze und Wege rechnet `previewNewsWalks.ts`.
 *
 * Wer auf einem Stapel steht oder unterwegs ist, bleibt dabei: Ein Weg der Art `news` ersetzte
 * seinen Weg auf den Stapel, während der Stapel es noch nennt. Die Desktop-App lädt diese Datei
 * nie.
 *
 * @module
 */

import type {
  StageArea,
  StageGathering,
  StageMove,
  StageNews,
  StagePlayer,
  StagePoint,
} from "@jelly/stage";

import type { PreviewSend } from "./previewStacks";

import {
  createRouteMove,
  findArrival,
  findPresenterSpot,
  findWalkway,
  listCrowdSpots,
  planRoute,
  positionAt,
} from "./previewNewsWalks";

/** Mit diesem Hash spielt die Vorschau der Karte die Jelly-News. */
export const NEWS_HASH = "#news";
/**
 * Die erste Sendung kommt nach dem Einflug der Karte. Sie läuft so lange wie mit `news_seconds` des
 * Servers, danach ist Pause. Wege beginnen wie beim Server eine Sekunde im Voraus.
 */
const TIMING = { firstMs: 5000, showMs: 90_000, pauseMs: 20_000, leadMs: 1000 };
/** Wer in der Liste der Jellies vorliest und wer einen Erfolg hat, die neuesten zuerst. */
const PRESENTER_INDEX = 1;
const ACHIEVERS: [number, string][] = [
  [4, "hydrated"],
  [7, "marathon"],
  [8, "hatched"],
];
const TOP_XP = 420;
const NEXT_ITEM = { inMs: 25 * 60_000, title: "CS2-Turnier", detail: "Finale auf der Hauptbühne" };
/** Der Server meldet einen Stapel erst ab zwei Jellies als höchsten. */
const SMALLEST_STACK = 2;

/** Was die Sendung von der Vorschau braucht. */
export interface NewsPreviewInput {
  players: StagePlayer[];
  areas: StageArea[];
  ownId: number;
  /** Die Jellies des Turms der Vorschau, von unten nach oben. */
  tallestStack: number[];
  /** Ob ein Jelly frei ist, also nicht auf einem Stapel steht und nicht unterwegs ist. */
  isFree: (player: StagePlayer) => boolean;
  /** Der letzte Weg, den die Vorschau einem Jelly geschickt hat. */
  lastMove: (playerId: number) => StageMove | undefined;
  send: PreviewSend;
}

/** Die Sendung der Vorschau. */
export interface NewsPreview {
  /** Die laufende Sendung, `null` in der Pause. */
  gathering: () => StageGathering | null;
  /** Die Wege der Sendung, die noch gelten, für das Lesen. */
  moves: () => StageMove[];
  /** Ob ein Jelly zur Sendung läuft, dort steht oder zurückgeht: Dann bummelt es nicht. */
  isBusy: (playerId: number) => boolean;
  /** Beginnt den Ablauf, sobald die Bühne hört. */
  start: () => void;
}

/** Was eine Sendung zwischen Beginn und Ende weiß. */
interface ShowState {
  gathering: StageGathering | null;
  /** Der letzte Weg der Sendung je Jelly. */
  sent: Map<number, StageMove>;
  /** Bis dahin bummeln die Jellies der Sendung nicht. */
  busyUntil: number;
}

/** Was die Sendung meldet, mit den Jellies der Vorschau. */
export function createPreviewNews(input: NewsPreviewInput, now: number): StageNews {
  const achievements = ACHIEVERS.flatMap(([index, key]) => {
    const player = input.players[index];
    return player ? [{ player_id: player.id, key }] : [];
  });
  const { inMs, title, detail } = NEXT_ITEM;
  return {
    top_xp: { player_id: input.ownId, xp: TOP_XP },
    achievements,
    tallest_stack: input.tallestStack.length >= SMALLEST_STACK ? input.tallestStack : [],
    next_item: { starts_at: now + inMs, ends_at: null, title, detail, kind: "tournament" },
  };
}

/** Das Gathering, wie es der Server meldet: ohne `starts_at`, das schickt er noch nicht. */
export function createNewsGathering(input: NewsPreviewInput, now: number): StageGathering {
  return {
    kind: "news",
    winner_id: null,
    ends_at: now + TIMING.showMs,
    presenter_id: input.players[PRESENTER_INDEX]?.id ?? null,
    news: createPreviewNews(input, now),
  };
}

/** Wen die Sendung nennt. */
function listNamed(news: StageNews): Set<number> {
  const ids = [...news.achievements.map((entry) => entry.player_id), ...news.tallest_stack];
  return new Set(news.top_xp ? [news.top_xp.player_id, ...ids] : ids);
}

/**
 * Wer wohin läuft: der Vorleser auf die Bühne, das Publikum auf die vordersten Plätze. Wen die
 * Sendung nennt, ist dabei, dann wer vorn sitzt. Wer links sitzt, bekommt einen Platz links, so
 * kreuzen sich die Wege wenig.
 */
export function castShow(input: NewsPreviewInput, gathering: StageGathering) {
  const cast = new Map<number, StagePoint>();
  const stageSpot = findPresenterSpot(input.areas);
  const free = input.players.filter(input.isFree);
  const presenter = free.find((player) => player.id === gathering.presenter_id);
  if (presenter && stageSpot) cast.set(presenter.id, stageSpot);
  const named = gathering.news ? listNamed(gathering.news) : new Set<number>();
  const spots = listCrowdSpots(input.areas);
  const crowd = free
    .filter((player) => player !== presenter)
    .sort((a, b) => Number(named.has(b.id)) - Number(named.has(a.id)) || a.home_y - b.home_y)
    .slice(0, spots.length)
    .sort((a, b) => a.home_x - b.home_x);
  const places = spots.slice(0, crowd.length).sort((a, b) => a.x - b.x);
  crowd.forEach((player, index) => {
    const place = places[index];
    if (place) cast.set(player.id, place);
  });
  return cast;
}

/** Der Platz eines Jellys. */
function homeOf(player: StagePlayer) {
  return { x: player.home_x, y: player.home_y };
}

/** Beginnt eine Sendung: Gathering melden, alle loslaufen lassen. */
function begin(state: ShowState, input: NewsPreviewInput) {
  const now = Date.now();
  const gathering = createNewsGathering(input, now);
  const walkway = findWalkway(input.areas);
  const startAt = now + TIMING.leadMs;
  state.sent.clear();
  for (const [playerId, spot] of castShow(input, gathering)) {
    const player = input.players.find((candidate) => candidate.id === playerId)!;
    const from = positionAt(input.lastMove(playerId), homeOf(player), startAt);
    const move = createRouteMove(playerId, planRoute(from, spot, walkway), "news", startAt);
    state.sent.set(playerId, move);
    input.send.move(move);
  }
  state.gathering = gathering;
  state.busyUntil = Infinity;
  input.send.event({
    id: 0,
    type: "gathering.changed",
    player_id: null,
    payload: gathering,
    created_at: now,
  });
}

/**
 * Beendet die Sendung ohne Ereignis, wie der Server. Wer noch auf seinem Weg der Sendung ist, geht
 * denselben Weg zurück. Wen der Nutzer inzwischen woanders hingeschickt hat, den lässt sie.
 */
function end(state: ShowState, input: NewsPreviewInput) {
  const startAt = Date.now() + TIMING.leadMs;
  const walkway = findWalkway(input.areas);
  state.gathering = null;
  state.busyUntil = startAt;
  for (const [playerId, move] of state.sent) {
    const player = input.players.find((candidate) => candidate.id === playerId);
    if (!player || input.lastMove(playerId) !== move) {
      state.sent.delete(playerId);
      continue;
    }
    const here = positionAt(move, homeOf(player), startAt);
    const corners = planRoute(homeOf(player), here, walkway).reverse();
    const back = createRouteMove(playerId, corners, "wander", startAt);
    state.sent.set(playerId, back);
    state.busyUntil = Math.max(state.busyUntil, findArrival(back));
    input.send.move(back);
  }
}

/** Sendung, Ende, Pause und die nächste Sendung, so lange die Vorschau offen ist. */
function runShows(state: ShowState, input: NewsPreviewInput, delayMs: number) {
  setTimeout(() => {
    begin(state, input);
    setTimeout(() => {
      end(state, input);
      runShows(state, input, TIMING.pauseMs);
    }, TIMING.showMs);
  }, delayMs);
}

/** Die Jelly-News der Vorschau. Ohne {@link NEWS_HASH} läuft keine Sendung. */
export function createNewsPreview(hash: string, input: NewsPreviewInput): NewsPreview {
  const state: ShowState = { gathering: null, sent: new Map(), busyUntil: 0 };
  return {
    gathering: () => state.gathering,
    moves: () => [...state.sent.values()].filter((move) => input.lastMove(move.player_id) === move),
    isBusy: (playerId) => state.sent.has(playerId) && Date.now() < state.busyUntil,
    start: () => {
      if (hash === NEWS_HASH) runShows(state, input, TIMING.firstMs);
    },
  };
}
