/**
 * Daten der Karte für die Browser-Vorschau, ohne Backend: die Halle der Server-Demo mit ein paar
 * Jellies, in ihrer echten Größe, einem Turm (`previewStacks.ts`) und einer Polonaise aus drei
 * Jellies (`previewConga.ts`). Die Desktop-App lädt diese Datei nie.
 *
 * Abfragen und Hash: `map.html?optimized` zeigt den optimierten Modus, `?fps=60` oder `?fps=max`
 * eine andere Bildrate. `map.html#news` spielt die Jelly-News, wiederholt mit Pause
 * (`previewNews.ts`), auch zusammen wie `map.html?optimized&fps=60#news`.
 *
 * @module
 */

import type {
  StageArea,
  StageEvent,
  StageMove,
  StagePlayer,
  StagePoint,
  StageTrip,
  StreamListener,
} from "@jelly/stage";

import { createDemoRoom, DEMO_HALL } from "@jelly/stage/demo-room";

import type { MapSource } from "./source";

import { FRAME_RATE, PREVIEW_CATALOG, PREVIEW_ME, PREVIEW_RULES, type PartnerInvite } from "../pet";
import { createCongaPreview, type CongaPreview } from "./previewConga";
import { createNewsPreview } from "./previewNews";
import { positionAt } from "./previewNewsWalks";
import { createStackPreview } from "./previewStacks";

/**
 * Das eigene Jelly. Nicht 0: Die Bühne liest ein fehlendes Ziel als ID 0, sonst stünden alle bei
 * ihm.
 */
const OWN_ID = 1;
const COLORS = [
  "mint",
  "sky",
  "violet",
  "lilac",
  "rose",
  "cherry",
  "peach",
  "tangerine",
  "lemon",
  "lime",
  "clover",
];
const SIGN = "cs2";
/** So viele Jellies stehen je Tischreihe, jedes vierte hält ein Schild hoch. */
const PLACES_PER_SEAT = [0.25, 0.75];
const SIGN_EVERY = 4;
const LEVELS = 9;
/** Was die Jellies tragen, je zwei von dreien eines der Headsets. */
const HEADSETS = ["headset", "headset-neutral"];
/** Gehaltenes und Getragenes am Körper, damit die Vorschau jeden Platz der Bühne zeigt. */
const HELD = ["goose", "cat-paws", "long-schnoerbi", "chicken"];
const BODY = ["fairy-wings", "knit-scarf", "cat-tail", "mini-backpack", "snail-shell"];
const BARE_EVERY = 3;
/** Alle paar Augenblicke läuft das nächste Jelly los, so lange und so weit. */
const WALK_EVERY_MS = 500;
const WALK_MS = 2000;
const WALK_REACH = 3;
/** Wer sich dazustellt, steht so weit links daneben. Rechts bummelt das andere Jelly. */
const FOLLOW_GAP = 6;
/** So lange überlegt das andere Jelly und so lange gilt eine Aufforderung. */
const ANSWER_MS = 2000;
const INVITE_MS = 120_000;
/** So lange dauert hier ein Ausflug und so lange leuchtet ein Jelly. */
const TRIP_MS = 20_000;
/**
 * So lange gilt das Dazustellen, wie `follow_seconds` des Servers.
 *
 * Ponytail: Die Vorschau beendet es nie von selbst. Nach dieser Zeit zeigt nur die Bühne keine
 * Polonaise mehr mit dem eigenen Jelly.
 */
const FOLLOW_MS = 1_800_000;
const HIGHLIGHT_MS = 10_000;

/** Die Bildrate aus der Adresse: `fps=60` oder `fps=max` für unbegrenzt. */
function previewFrameLimit() {
  const fps = new URLSearchParams(location.search).get("fps");
  if (fps === "max") return null;
  return fps ? Number(fps) : FRAME_RATE.default;
}

/** Was das Jelly mit dieser Nummer trägt. */
function previewEquipped(index: number): StagePlayer["equipped"] {
  if (index % BARE_EVERY === 0) return {};
  return {
    head: { key: HEADSETS[index % HEADSETS.length] ?? "headset", color: null },
    hands: { key: HELD[index % HELD.length] ?? "goose", color: null },
    body: { key: BODY[index % BODY.length] ?? "fairy-wings", color: null },
  };
}

/** Die Jellies auf den Plätzen der Halle, das erste ist das eigene. */
function listPlayers(areas: StageArea[]): StagePlayer[] {
  const seats = areas.filter((area) => area.kind === "seats");
  const places = seats.flatMap((seat) => PLACES_PER_SEAT.map((share) => ({ seat, share })));
  return places.map(({ seat, share }, index) => ({
    id: OWN_ID + index,
    name: index === 0 ? PREVIEW_ME.name : `Jelly ${index}`,
    color: COLORS[index % COLORS.length],
    equipped: previewEquipped(index),
    level: 1 + (index % LEVELS),
    sign: index % SIGN_EVERY === 1 ? SIGN : null,
    follow: null,
    area_id: seat.id,
    is_visitor: false,
    home_x: seat.x + seat.width * share,
    home_y: seat.y + seat.height / 2,
  }));
}

/** Ein Weg von `from` nach `to`, der jetzt beginnt. */
function createWalk(
  playerId: number,
  from: StagePoint,
  to: StagePoint,
  kind = "wander",
): StageMove {
  return {
    player_id: playerId,
    kind,
    start_at: Date.now(),
    stack_level: 0,
    points: [
      { ...from, t: 0 },
      { ...to, t: WALK_MS },
    ],
  };
}

/** Wo ein Jelly zu Hause ist. */
function homeOf(player: StagePlayer): StagePoint {
  return { x: player.home_x, y: player.home_y };
}

/**
 * Lässt die Jellies abwechselnd um ihren Platz bummeln, wie sonst der Server. Wer gerade woanders
 * ist (`isBusy`: auf einem Stapel, das eigene auch bei einem Ziel oder Ausflug), bummelt nicht.
 */
function startWalks(
  players: StagePlayer[],
  isBusy: (player: StagePlayer) => boolean,
  sendMove: (move: StageMove) => void,
) {
  let next = 0;
  let isAway = false;
  setInterval(() => {
    next = (next + 1) % players.length;
    const player = players[next];
    if (isBusy(player)) return;
    if (next === 0) isAway = !isAway;
    const home = homeOf(player);
    const away = { x: home.x + WALK_REACH, y: home.y };
    const [from, to] = isAway ? [home, away] : [away, home];
    sendMove(createWalk(player.id, from, to));
  }, WALK_EVERY_MS);
}

/** Die Ausflüge des eigenen Jellys in der Vorschau. */
interface Trips {
  /** Der laufende Ausflug, wie ihn sonst der eigene Stand nennt. */
  current: () => StageTrip | null;
  /** Läuft von `from` los, wo das Jelly gerade steht. */
  go: (point: StagePoint, from: StagePoint) => void;
  /** Beendet den Ausflug und liefert, wo das Jelly jetzt steht. */
  end: () => StagePoint;
}

/** Ausflüge des eigenen Jellys, wie sonst beim Server: hin, warten und von selbst zurück. */
function createTrips(own: StagePlayer, onMove: (move: StageMove) => void): Trips {
  const home = homeOf(own);
  let trip: StageTrip | null = null;
  let back: ReturnType<typeof setTimeout> | undefined;
  const end = (): StagePoint => {
    clearTimeout(back);
    const here = trip ? { x: trip.x, y: trip.y } : home;
    trip = null;
    return here;
  };
  const go = (point: StagePoint, from: StagePoint) => {
    end();
    onMove(createWalk(own.id, from, point, "trip"));
    own.follow = null;
    trip = { ...point, ends_at: Date.now() + TRIP_MS };
    back = setTimeout(() => onMove(createWalk(own.id, end(), home)), TRIP_MS);
  };
  return { current: () => trip, go, end };
}

/** Das Hervorheben eines Jellys, wie es sonst im Stream kommt. */
function highlightEvent(playerId: number): StageEvent {
  const now = Date.now();
  return {
    id: 0,
    type: "highlight",
    player_id: OWN_ID,
    payload: { target_id: playerId, ends_at: now + HIGHLIGHT_MS, cosmetic_key: "highlight-aura" },
    created_at: now,
  };
}

/** Eine neue Aufforderung des eigenen Jellys. */
function createInvite(key: string, partnerId: number): PartnerInvite {
  return {
    id: Date.now(),
    key,
    from_id: OWN_ID,
    partner_id: partnerId,
    state: "pending",
    expires_at: Date.now() + INVITE_MS,
  };
}

/** Die Änderung einer Aufforderung, wie sie sonst im Stream kommt. */
function inviteEvent(invite: PartnerInvite, state: PartnerInvite["state"]): StageEvent {
  const payload: PartnerInvite = { ...invite, state };
  return {
    id: 0,
    type: "partner_emote.updated",
    player_id: invite.partner_id,
    payload,
    created_at: Date.now(),
  };
}

/**
 * Antwortet wie sonst das andere Jelly: Ungerade IDs nehmen an, gerade lehnen ab. Eine Annahme
 * schließt die Karte, soweit der Browser das erlaubt, denn das Duett zeigt nur das Pet.
 */
function answerInvite(invite: PartnerInvite, notify: (event: StageEvent) => void) {
  const accepted = invite.partner_id % 2 === 1;
  notify(inviteEvent(invite, accepted ? "accepted" : "declined"));
  if (accepted) window.close();
}

/** Die Partner-Emotes der Vorschau: Das andere Jelly antwortet nach kurzem Überlegen von selbst. */
function createPartnerPreview(): Pick<
  MapSource,
  "readPartnerEmotes" | "invitePartner" | "cancelInvite" | "onInviteEvent"
> {
  let onInvite: ((event: StageEvent) => void) | null = null;
  let answer: ReturnType<typeof setTimeout> | undefined;
  return {
    readPartnerEmotes: () => Promise.resolve(PREVIEW_CATALOG.partner_emotes),
    invitePartner: (key, partnerId) => {
      const invite = createInvite(key, partnerId);
      answer = setTimeout(() => answerInvite(invite, (event) => onInvite?.(event)), ANSWER_MS);
      return Promise.resolve(invite);
    },
    cancelInvite: () => {
      clearTimeout(answer);
      return Promise.resolve();
    },
    onInviteEvent: (handler) => {
      onInvite = handler;
    },
  };
}

/** Wege und Ereignisse an die Bühne, sobald sie hört. */
type PreviewSend = Parameters<typeof createStackPreview>[2];

/**
 * Was das eigene Jelly in der Vorschau tut: dazustellen, Ausflug und Stapel. Losgehen nimmt es wie
 * beim Server vom Stapel, Klettern und Beginnen beenden Ausflug und Dazustellen. Ein neuer Weg
 * beginnt, wo der letzte (`lastMove`) es gerade hinstellt, etwa mitten auf dem Weg zu den News.
 * Neben ein Jelly der Polonaise stellt es sich wie beim Server, so reiht es sich ein. Wer zu ihr
 * gehört, bummelt nicht: Das Bummeln der Vorschau kennt keinen Abstand zu anderen.
 */
function createOwnPreview(
  players: StagePlayer[],
  send: PreviewSend,
  lastMove: (playerId: number) => StageMove | undefined,
  conga: CongaPreview,
) {
  const own = players[0];
  const trips = createTrips(own, send.move);
  const followed = () => players.find((player) => player.id === own.follow?.player_id);
  const besideOrHome = () => {
    const target = followed();
    if (!target) return homeOf(own);
    const beside = { x: target.home_x - FOLLOW_GAP, y: target.home_y };
    return conga.joinSpot(own.id, target.id) ?? beside;
  };
  // Ein Ausflug geht vor, Dazustellen und Stapel schließen sich mit ihm aus.
  const ownSpot = (): StagePoint => trips.current() ?? stacks.spotOf(own.id) ?? besideOrHome();
  const endWalks = () => {
    trips.end();
    own.follow = null;
  };
  const stacks = createStackPreview(players, { id: own.id, spot: ownSpot, endWalks }, send);
  const here = () => positionAt(lastMove(own.id), ownSpot(), Date.now());
  const actions: Pick<MapSource, "setFollow" | "goTo"> = {
    setFollow: (playerId) => {
      const from = here();
      endWalks();
      stacks.drop(own.id);
      own.follow =
        playerId === null ? null : { player_id: playerId, ends_at: Date.now() + FOLLOW_MS };
      send.move(createWalk(own.id, from, besideOrHome(), playerId === null ? "wander" : "follow"));
      return Promise.resolve(playerId);
    },
    goTo: (point) => {
      const from = here();
      stacks.drop(own.id);
      trips.go(point, from);
      return Promise.resolve();
    },
  };
  const isBusy = (player: StagePlayer) =>
    stacks.spotOf(player.id) !== undefined ||
    conga.spotOf(player.id) !== undefined ||
    (player === own && (own.follow !== null || trips.current() !== null));
  return { trips, stacks, isBusy, actions };
}

/**
 * Schickt Wege und Ereignisse an die Bühne, sobald sie hört, und hebt den letzten Weg jedes Jellys
 * auf: So weiß ein neuer Weg, wo das Jelly gerade steht.
 */
function createSend(readListener: () => StreamListener | null) {
  const lastMoves = new Map<number, StageMove>();
  const send: PreviewSend = {
    move: (move) => {
      lastMoves.set(move.player_id, move);
      readListener()?.onMove(move);
    },
    event: (event) => readListener()?.onEvent(event),
  };
  return { send, lastMove: (playerId: number) => lastMoves.get(playerId) };
}

/**
 * Eine Bühne, die nur im Speicher lebt. Ereignisse gibt es hier nur für Aufforderungen, Licht,
 * Stapel, das Ende der Polonaise und die Jelly-News.
 */
export function createPreviewSource(): MapSource {
  const areas = createDemoRoom();
  const players = listPlayers(areas);
  let listener: StreamListener | null = null;
  const { send, lastMove } = createSend(() => listener);
  const conga = createCongaPreview(players, areas, send);
  const { trips, stacks, isBusy, actions } = createOwnPreview(players, send, lastMove, conga);
  const news = createNewsPreview(location.hash, {
    players,
    areas,
    ownId: OWN_ID,
    tallestStack: stacks.list()[0]?.member_ids ?? [],
    isFree: (player) => !isBusy(player),
    lastMove,
    send,
  });
  return {
    ...createPartnerPreview(),
    ...actions,
    startStack: stacks.startStack,
    joinStack: stacks.joinStack,
    leaveStack: stacks.leaveStack,
    readState: () =>
      Promise.resolve({
        last_event_id: 0,
        server_time: Date.now(),
        room: { width: 100, height: 100, unit: "percent", ...DEMO_HALL },
        areas,
        players,
        moves: [...stacks.moves(), ...conga.moves(), ...news.moves()],
        stacks: stacks.list(),
        gathering: news.gathering(),
      }),
    readCatalog: () => Promise.resolve(PREVIEW_CATALOG),
    subscribe: (_firstEventId, next) => {
      listener = next;
      next.onConnectionChange(true);
      startWalks(players, (player) => isBusy(player) || news.isBusy(player.id), send.move);
      news.start();
    },
    // Die Vorschau teilt keine Einstellungen mit dem Pet: `map.html?optimized&fps=60` zeigt sie.
    readOwn: () => ({
      id: OWN_ID,
      reducedMotion: false,
      optimizedRendering: new URLSearchParams(location.search).has("optimized"),
      frameLimit: previewFrameLimit(),
      nearDistance: PREVIEW_RULES.near_distance,
      trip: trips.current(),
    }),
    highlight: (playerId) => {
      listener?.onEvent(highlightEvent(playerId));
      return Promise.resolve();
    },
  };
}
