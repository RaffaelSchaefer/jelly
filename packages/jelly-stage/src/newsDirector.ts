/**
 * Runs the Jelly-News in a view: keeps the show of the running gathering, knows which report is on
 * and starts its effects once, light on the jellies it names and a gesture of the presenter. Also
 * keeps the breaking news an award brings, which shows with or without a show.
 *
 * @module
 */

import { EMOTE_SECONDS, type EmoteKey } from "@jelly/scene/emotes";

import type { StageEffect } from "./effects.ts";
import type { StageCatalog, StageEvent, StageGathering, StagePlayer } from "./types.ts";

import { isFreshEvent } from "./effects.ts";
import {
  findMoment,
  listNamed,
  planShow,
  scramble,
  type NewsMoment,
  type NewsShow,
} from "./news.ts";
import { writeCard, type NewsCard, type NewsScene } from "./newsLines.ts";

/** The light of the channel and of an urgent report, as hues from 0 to 1. */
const HUES = { usual: 0.61, urgent: 0.01 };
/** The camera films the lit jelly from close up, where a full beam would wash it out. */
const LIGHT_STRENGTH = 0.4;
/** A report about many jellies lights only this many, like the beams the stage has. */
const MOST_LIT = 8;
const HOP_MS = 2400;
const SECOND_MS = 1000;
/** Stands between two reports of the ticker. */
export const TICKER_GAP = "   +++   ";
/** The event that becomes a breaking news, and how long that stays on air. */
const AWARD = "award.given";
const FLASH_MS = 8000;
/** A breaking news is kept this long after its end, so the show knows when it got its bar back. */
const FLASH_KEPT_MS = 5000;
const FLASH_LOOK = { rubric: "EILMELDUNG", glyph: "🚨", picture: "breaking" } as const;
/** What a breaking news adds below its headline. It never adds anything. */
const FLASH_SUBS = [
  "WEITERE INFORMATIONEN FOLGEN",
  "EINE STELLUNGNAHME STEHT AUS",
  "DIE REDAKTION IST ERSCHÜTTERT",
];
const SOMEBODY = "Ein Jelly";
/** What the presenter does while each kind of report is on. */
const GESTURES: Record<NewsMoment["beat"]["kind"], EmoteKey> = {
  intro: "wave",
  top_xp: "cheer",
  achievement: "point",
  stack: "point",
  extra: "think",
  next: "point",
  outro: "wave",
};
const GATHERING_CHANGED = "gathering.changed";
const NEWS = "news";
const TIME_FORMAT = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/** The report that is on right now. */
export interface NewsLive {
  show: NewsShow;
  moment: NewsMoment;
  card: NewsCard;
  /** The headlines of the whole show in a row, for the ticker. */
  ticker: string;
}

/** A breaking news: a red lower third for a few seconds, with or without a show on air. */
export interface NewsFlash {
  /** The event it reports, so a second delivery of it changes nothing. */
  eventId: number;
  card: NewsCard;
  /** What its ticker runs when no show is on air. */
  ticker: string;
  /** Server times it is on air from and until. */
  startedAt: number;
  endsAt: number;
}

/** What a view keeps about the news between two frames. */
export interface NewsDirector {
  /** The gathering the show was planned for. A reload brings a new object. */
  gathering: StageGathering | null;
  show: NewsShow | null;
  /** The beat whose effects have started, by show, run and index. */
  beatKey: string;
  live: NewsLive | null;
  /**
   * The latest breaking news. It stays a few seconds past its end, so the show under it knows when
   * it got the picture back. Whether it is on air follows from the server time.
   */
  flash: NewsFlash | null;
  /**
   * When the news that end at `endsAt` began, as the event that started them told. The gathering
   * itself does not say it yet, and a screen that loads later never saw the event.
   */
  started: { endsAt: number; at: number } | null;
}

/** What {@link flashNews} needs besides the event. */
export interface FlashScene {
  players: StagePlayer[];
  /** Server time in milliseconds. */
  serverTime: number;
}

/** What {@link stepNews} needs for a frame. */
export interface NewsFrame {
  gathering: StageGathering | null;
  players: StagePlayer[];
  /** Null until the view has read it. The news wait for it, their texts need it. */
  catalog: StageCatalog | null;
  /** Server time in milliseconds, as the gathering counts. */
  serverTime: number;
  /** The clock of the effects, in milliseconds. */
  now: number;
}

/** Creates a director with nothing on air. */
export function createNewsDirector(): NewsDirector {
  return { gathering: null, show: null, beatKey: "", live: null, flash: null, started: null };
}

/**
 * Takes the event that starts news and remembers when they began, so the show opens with the
 * gathering whatever its length. A replay of the event tells the same time.
 */
export function noteNewsStart(director: NewsDirector, event: StageEvent): void {
  const { type, payload, created_at: at } = event;
  if (type !== GATHERING_CHANGED || payload.kind !== NEWS || payload.ends_at === undefined) return;
  director.started = { endsAt: payload.ends_at, at };
  // Plans the show again in the next frame, now with its start.
  director.gathering = null;
}

/** Returns a gathering with the start its event told, as long as the server does not send one. */
function withStart(
  director: NewsDirector,
  gathering: StageGathering | null,
): StageGathering | null {
  const { started } = director;
  if (!gathering || gathering.starts_at !== undefined || started?.endsAt !== gathering.ends_at) {
    return gathering;
  }
  return { ...gathering, starts_at: started.at };
}

/** Writes the breaking news of an award, as dry as the show. */
function writeFlash(event: StageEvent, title: string, players: StagePlayer[]): NewsCard {
  const jelly = players.find((player) => player.id === event.player_id);
  return {
    ...FLASH_LOOK,
    headline: `${jelly?.name ?? SOMEBODY} erhält „${title}“.`,
    sub: FLASH_SUBS[scramble(event.id) % FLASH_SUBS.length] ?? "",
    figure: "",
    isUrgent: true,
    playerIds: jelly ? [jelly.id] : [],
    isLive: false,
  };
}

/**
 * Takes an event of the stream: a fresh award becomes a breaking news. It runs from the moment the
 * server gave the award, so all screens show it at once and a replay after a reconnect, which comes
 * with the same time, cannot show it twice. An older award never pushes a newer one off the air.
 */
export function flashNews(director: NewsDirector, event: StageEvent, scene: FlashScene): void {
  const title = event.type === AWARD ? event.payload.title : undefined;
  if (!title || !isFreshEvent(event, scene.serverTime)) return;
  const current = director.flash;
  if (current && (current.eventId === event.id || current.startedAt > event.created_at)) return;
  const card = writeFlash(event, title, scene.players);
  director.flash = {
    eventId: event.id,
    card,
    ticker: `${card.rubric}: ${card.headline}`,
    startedAt: event.created_at,
    endsAt: event.created_at + FLASH_MS,
  };
}

/** Writes a server time as a time of day. */
export function formatNewsTime(time: number): string {
  return TIME_FORMAT.format(time);
}

/** Returns what the texts of a show are written from, at one moment. */
function describeScene(show: NewsShow, frame: NewsFrame, catalog: StageCatalog): NewsScene {
  return {
    players: frame.players,
    catalog,
    presenterId: show.presenterId,
    named: listNamed(show),
    seed: show.seed,
    hour: new Date(frame.serverTime).getHours(),
    formatTime: formatNewsTime,
  };
}

/** Returns the effects of a report, on the clock of the effects. A late screen joins in the middle. */
function createBeatEffects(live: NewsLive, frame: NewsFrame): StageEffect[] {
  const { moment, card, show } = live;
  const startedAt = frame.now + (moment.startedAt - frame.serverTime);
  const endsAt = frame.now + (moment.endsAt - frame.serverTime);
  const hue = card.isUrgent ? HUES.urgent : HUES.usual;
  const effects: StageEffect[] = [];
  for (const playerId of card.playerIds.slice(0, MOST_LIT)) {
    effects.push({ playerId, startedAt, endsAt, kind: "spotlight", hue, strength: LIGHT_STRENGTH });
    effects.push({
      playerId,
      startedAt,
      endsAt: startedAt + HOP_MS,
      kind: "motion",
      motion: "hop",
    });
  }
  if (show.presenterId !== null) {
    effects.push({
      playerId: show.presenterId,
      startedAt,
      endsAt: startedAt + EMOTE_SECONDS * SECOND_MS,
      kind: "emote",
      key: GESTURES[moment.beat.kind],
    });
  }
  return effects;
}

/** Returns the headlines of all reports between opening and closing, as one line. */
function writeTicker(show: NewsShow, scene: NewsScene): string {
  return show.beats
    .filter((beat) => beat.kind !== "intro" && beat.kind !== "outro")
    .map((beat) => writeCard(beat, scene).headline)
    .join(TICKER_GAP);
}

/**
 * Moves the news one frame on. Returns the effects of a report that just came on, and nothing in
 * all other frames. `director.live` tells what to show, null without news.
 */
export function stepNews(director: NewsDirector, frame: NewsFrame): StageEffect[] {
  if (director.flash && frame.serverTime > director.flash.endsAt + FLASH_KEPT_MS) {
    director.flash = null;
  }
  if (frame.gathering !== director.gathering) {
    director.gathering = frame.gathering;
    director.show = planShow(withStart(director, frame.gathering));
  }
  const { show } = director;
  const moment = show ? findMoment(show, frame.serverTime) : null;
  if (!show || !moment || !frame.catalog) {
    director.live = null;
    return [];
  }
  const beatKey = `${show.key}:${moment.run}:${moment.index}`;
  if (director.live && beatKey === director.beatKey) {
    director.live.moment = moment;
    return [];
  }
  // Ponytail: A show that is called off leaves the light of its last report on until the report
  // would have ended, at most ten seconds. Effects do not know where they came from.
  director.beatKey = beatKey;
  const scene = describeScene(show, frame, frame.catalog);
  const card = writeCard(moment.beat, scene);
  director.live = { show, moment, card, ticker: writeTicker(show, scene) };
  return createBeatEffects(director.live, frame);
}
