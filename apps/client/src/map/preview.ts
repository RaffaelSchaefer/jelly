/**
 * Daten der Karte für die Browser-Vorschau, ohne Backend: die Halle der Server-Demo mit ein paar
 * Jellies. Die Desktop-App lädt diese Datei nie.
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

import { createDemoRoom } from "@jelly/stage/demo-room";

import type { MapSource } from "./source";

import { FRAME_RATE, PREVIEW_CATALOG, PREVIEW_ME, PREVIEW_RULES, type PartnerInvite } from "../pet";

/**
 * Das eigene Jelly. Nicht 0: Die Bühne liest ein fehlendes Ziel als ID 0, sonst stünden alle bei
 * ihm.
 */
const OWN_ID = 1;
const COLORS = ["mint", "lilac", "peach"];
const SIGN = "cs2";
/** So viele Jellies stehen je Tischreihe, jedes vierte hält ein Schild hoch. */
const PLACES_PER_SEAT = [0.25, 0.75];
const SIGN_EVERY = 4;
const LEVELS = 9;
/** Was die Jellies tragen, je zwei von dreien eines der Headsets. */
const HEADSETS = ["headset", "headset-neutral"];
const BARE_EVERY = 3;
/** Alle paar Augenblicke läuft das nächste Jelly los, so lange und so weit. */
const WALK_EVERY_MS = 500;
const WALK_MS = 2000;
const WALK_REACH = 3;
/** So lange überlegt das andere Jelly und so lange gilt eine Aufforderung. */
const ANSWER_MS = 2000;
const INVITE_MS = 120_000;
/** So lange dauert hier ein Ausflug und so lange leuchtet ein Jelly. */
const TRIP_MS = 20_000;
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
  return { head: { key: HEADSETS[index % HEADSETS.length] ?? "headset", color: null } };
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

/**
 * Lässt die Jellies abwechselnd um ihren Platz bummeln, wie sonst der Server. Das eigene läuft bei
 * einem Ziel oder Ausflug dorthin und bummelt dann nicht mehr.
 */
function startWalks(players: StagePlayer[], trips: Trips, listener: StreamListener) {
  let next = 0;
  let isAway = false;
  setInterval(() => {
    next = (next + 1) % players.length;
    const player = players[next];
    if (next === 0 && (player.follow !== null || trips.current() !== null)) return;
    if (next === 0) isAway = !isAway;
    const home = { x: player.home_x, y: player.home_y };
    const away = { x: home.x + WALK_REACH, y: home.y };
    const [from, to] = isAway ? [home, away] : [away, home];
    listener.onMove(createWalk(player.id, from, to));
  }, WALK_EVERY_MS);
}

/** Die Ausflüge des eigenen Jellys in der Vorschau. */
interface Trips {
  /** Der laufende Ausflug, wie ihn sonst der eigene Stand nennt. */
  current: () => StageTrip | null;
  go: (point: StagePoint) => void;
  /** Beendet den Ausflug und liefert, wo das Jelly jetzt steht. */
  end: () => StagePoint;
}

/** Ausflüge des eigenen Jellys, wie sonst beim Server: hin, warten und von selbst zurück. */
function createTrips(own: StagePlayer, onMove: (move: StageMove) => void): Trips {
  const home = { x: own.home_x, y: own.home_y };
  let trip: StageTrip | null = null;
  let back: ReturnType<typeof setTimeout> | undefined;
  const end = (): StagePoint => {
    clearTimeout(back);
    const here = trip ? { x: trip.x, y: trip.y } : home;
    trip = null;
    return here;
  };
  const go = (point: StagePoint) => {
    onMove(createWalk(own.id, end(), point, "trip"));
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

/** Eine Bühne, die nur im Speicher lebt. Ereignisse gibt es hier nur für Aufforderungen und Licht. */
export function createPreviewSource(): MapSource {
  const areas = createDemoRoom();
  const players = listPlayers(areas);
  let listener: StreamListener | null = null;
  const trips = createTrips(players[0], (move) => listener?.onMove(move));
  return {
    ...createPartnerPreview(),
    readState: () =>
      Promise.resolve({
        last_event_id: 0,
        server_time: Date.now(),
        room: {
          width: 100,
          height: 100,
          unit: "percent",
          width_m: 22,
          depth_m: 16.1,
          jelly_m: 0.5,
        },
        areas,
        players,
        moves: [],
        stacks: [],
        gathering: null,
      }),
    readCatalog: () => Promise.resolve(PREVIEW_CATALOG),
    subscribe: (_firstEventId, next) => {
      listener = next;
      next.onConnectionChange(true);
      startWalks(players, trips, next);
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
    setFollow: (playerId) => {
      const own = players[0];
      own.follow =
        playerId === null ? null : { player_id: playerId, ends_at: Date.now() + TRIP_MS };
      const target = players.find((player) => player.id === playerId) ?? own;
      listener?.onMove(createWalk(own.id, trips.end(), { x: target.home_x, y: target.home_y }));
      return Promise.resolve(playerId);
    },
    goTo: (point) => {
      trips.go(point);
      return Promise.resolve();
    },
    highlight: (playerId) => {
      listener?.onEvent(highlightEvent(playerId));
      return Promise.resolve();
    },
  };
}
