/**
 * The studio of the Jelly-News as numbers: when the show is on air, where the anchor desk stands,
 * how far it has risen and how much of the broadcast the beamer screens show. All of it follows
 * from the gathering, the moves of the server and the server time, so every screen builds the same
 * studio at the same moment, also one that loads in the middle of the show. Without three.
 *
 * @module
 */

import type { NewsLive } from "./newsDirector.ts";
import type { NewsCard } from "./newsLines.ts";
import type { StageGathering, StageMove, StagePlayer } from "./types.ts";
import type { RoomSize } from "./world.ts";

import { findArrival, findMovePosition } from "./walking.ts";
import { toFloorPoint } from "./world.ts";
import { containsPoint, STAGE_HEIGHT, type Placement } from "./zones.ts";

const NEWS = "news";
/** The desk rises this long once the presenter stands behind it, and sinks this long before the end. */
const DESK_MS = { rise: 1400, sink: 1100 };
/** While it rises the desk fades in over this first share, so it never cuts sharply out of the floor. */
const DESK_FADE_SHARE = 0.35;
/** The screens switch to the broadcast and back over this long. */
const SCREEN_FADE_MS = 800;

/**
 * The anchor desk around the presenter, in jelly units of a presenter of the usual size: the view
 * grows it with the presenter. Its parts are arcs around a point behind the presenter, so the front
 * curves around the body. The panel stands in front of the widest part of the body, the top only
 * where the body is narrower again, so a jumping presenter stays clear of both. Heights count from
 * the floor the presenter stands on, x and z from its middle, front toward +z.
 */
export const DESK = {
  /** Where the arcs are centered, behind the presenter. */
  center: -2,
  /** Half the angle the desk spans around that point, in radians. */
  angle: 0.49,
  /** The light top, a slab on the panel. */
  top: { inner: 2.71, outer: 2.98, bottom: 0.79, height: 0.05 },
  /** The panel under the top, from the floor up to it. */
  panel: { inner: 2.77, outer: 2.94 },
  /** The front of the panel, which carries the look of the channel. */
  face: 2.95,
} as const;

/** When a show is on air, in server time. */
export interface ShowSpan {
  /** Minus infinity when the server does not tell: then the show was on air before anybody saw it. */
  start: number;
  end: number;
}

/** What {@link placeDesk} reads. */
export interface DeskInput {
  presenterId: number | null;
  players: StagePlayer[];
  /**
   * The moves as the stage plays them, see `playMoves` in `moves.ts`: the presenter stands at its
   * spot from the start of the show, so the desk rises with the show.
   */
  moves: ReadonlyMap<number, StageMove>;
  /** The stage platforms: the desk only stands on one of them. */
  platforms: Placement[];
  room: RoomSize;
}

/** Where the desk stands: around the spot the presenter walks to, turned like its stage. */
export interface DeskSpot {
  x: number;
  z: number;
  /** Height of the floor it stands on. */
  floor: number;
  /** Rotation around the vertical axis, the turn of the platform. */
  turn: number;
  /** Server time the presenter arrives there, minus infinity when it stood there all along. */
  arrival: number;
}

/** How the desk shows in one frame. */
export interface DeskLook {
  /** How opaque it is, from 0 to 1. */
  shown: number;
  /** How far it has risen out of the floor, from 0 (sunk) to 1 (standing). */
  lift: number;
}

/** What the screens show: the logo of the channel, or the card of a report. */
export interface BroadcastPicture {
  /** The same for two reports that look the same, so the picture is only painted when it changes. */
  key: string;
  /** Null for the logo. */
  card: NewsCard | null;
}

/** Keeps a share between 0 and 1. */
function clamp(share: number): number {
  return Math.min(1, Math.max(0, share));
}

/** Starts fast and settles, like a stage lift that arrives. */
function easeOut(share: number): number {
  return 1 - (1 - clamp(share)) ** 3;
}

/** Smooth at both ends. */
function smooth(share: number): number {
  const value = clamp(share);
  return value * value * (3 - 2 * value);
}

/**
 * Returns when the news of a gathering are on air, null for any other gathering. Without a start
 * from the server nobody knows when they began: a longer gathering repeats the show from the
 * middle of a run, so a guessed start would leave the studio dark at first. Then the studio simply
 * stands whenever the show is on air, and only its end and the arrival of the presenter move it.
 */
export function findShowSpan(gathering: StageGathering | null): ShowSpan | null {
  if (gathering?.kind !== NEWS) return null;
  const { starts_at: start, ends_at: end } = gathering;
  const isKnown = start !== undefined && start < end;
  return { start: isKnown ? start : Number.NEGATIVE_INFINITY, end };
}

/**
 * Returns where the desk stands: in front of the spot the presenter walks to, as long as that lies
 * on a stage platform. Without a presenter in the room or off the stage there is no desk.
 */
export function placeDesk(input: DeskInput): DeskSpot | null {
  const presenter = input.players.find((player) => player.id === input.presenterId);
  if (!presenter) return null;
  const move = input.moves.get(presenter.id);
  const spot = move
    ? findMovePosition(move, Number.POSITIVE_INFINITY, input.room)
    : toFloorPoint({ x: presenter.home_x, y: presenter.home_y }, input.room);
  const platform = input.platforms.find((candidate) => containsPoint(candidate, spot));
  if (!platform) return null;
  return {
    ...spot,
    floor: STAGE_HEIGHT,
    turn: platform.turn,
    arrival: move ? findArrival(move) : Number.NEGATIVE_INFINITY,
  };
}

/**
 * Returns how the desk shows at a server time. It rises once the show is on air and the presenter
 * has arrived, so it never stands in its way, and sinks before the show ends. With reduced motion
 * it fades in and out where it stands.
 */
export function measureDesk(
  span: ShowSpan,
  spot: DeskSpot,
  moment: { serverTime: number; reducedMotion: boolean },
): DeskLook {
  const start = Math.max(span.start, spot.arrival);
  const up = (moment.serverTime - start) / DESK_MS.rise;
  const down = (span.end - moment.serverTime) / DESK_MS.sink;
  if (moment.reducedMotion) return { shown: smooth(Math.min(up, down)), lift: 1 };
  const lift = Math.min(easeOut(up), easeOut(down));
  return { shown: clamp(lift / DESK_FADE_SHARE), lift };
}

/** Returns how much of the broadcast the screens show at a server time, from 0 to 1. */
export function measureScreens(span: ShowSpan, serverTime: number): number {
  const fadeIn = (serverTime - span.start) / SCREEN_FADE_MS;
  const fadeOut = (span.end - serverTime) / SCREEN_FADE_MS;
  return smooth(Math.min(fadeIn, fadeOut));
}

/** Returns what the screens show for the report on air: the logo around the show, else its card. */
export function describeBroadcast(live: NewsLive): BroadcastPicture {
  const { kind } = live.moment.beat;
  if (kind === "intro" || kind === "outro") return { key: "channel", card: null };
  const { card } = live;
  const key = ["card", card.rubric, card.glyph, card.figure, card.isUrgent, card.picture].join("|");
  return { key, card };
}
