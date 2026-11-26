/**
 * The math behind a conga line, without three: which jellies form one, how close each of them has to
 * be to belong to it, how they dance in step and how the garland hangs between their heads. A line
 * is what the server rewards with `conga`: several follow the same jelly, or a jelly follows one
 * that follows too. Everything is a pure function of the state and the server time, so every screen
 * shows the same line in the same step.
 *
 * @module
 */

import type { MotionPose } from "./effects.ts";
import type { StagePlayer } from "./types.ts";
import type { FloorPoint } from "./world.ts";

import { measureDistance } from "./world.ts";

/** A follow tree of at least this many jellies is a conga line. */
const CONGA_MEMBERS = 3;
/**
 * One beat of the conga in milliseconds, and how many make a bar. The last beat is the kick. The
 * beat is the one of the music the pet plays to its line, about 130 beats a minute
 * (`apps/client/src/sounds/conga`).
 */
export const CONGA_BEAT_MS = 461;
/** Beats in a bar of the dance. */
export const CONGA_BAR = 4;
/**
 * A follower closer than `near` to the jelly it follows is fully part of the line, one farther than
 * `far` is still on its way. In jelly units: the server puts a follower 1.8 beside its target.
 */
const REACH = { near: 4, far: 7 };
/** Each jelly dances this many beats after the one before it, so a wave runs down the line. */
const WAVE_DELAY = 0.25;
/** The steps of the dance: lift in jelly heights, tilt and turn in radians. */
const DANCE = { stepLift: 0.07, kickLift: 0.22, sway: 0.12, kickTilt: 0.26, kickTurn: 0.35 };
/** A garland sags by this share of its length and never deeper than `deepest`, in jelly units. */
const SAG = { share: 0.1, deepest: 0.5 };
/**
 * The light that runs along a garland toward the head of the line: `steps` bulbs per beat, every
 * bulb of `group` is lit and fades out with `fade`. A link has `bulbs` from head to head. With
 * reduced motion every bulb glows at `still`. The pattern repeats within a bar.
 */
export const CONGA_CHASE = { bulbs: 6, steps: 2, group: 4, fade: 2.2, still: 0.6 };

/** What a line needs to know about a jelly. */
export type CongaPlayer = Pick<StagePlayer, "id" | "follow">;

/** One jelly following another one within a line. */
export interface CongaFollow {
  followerId: number;
  targetId: number;
}

/** A conga line: the jelly in front and everybody behind it. */
export interface CongaLine {
  /** The jelly in front, the only one that follows nobody. */
  headId: number;
  /** Everybody in the line from front to back, the head first. */
  memberIds: number[];
  follows: CongaFollow[];
}

/** A follow of a line in one frame, with how much of it shows. */
export interface CongaLink extends CongaFollow {
  headId: number;
  /** Place of the follower in its line, 1 right behind the head. */
  rank: number;
  /** Place of the followed jelly in its line, 0 for the head. */
  targetRank: number;
  /** 0 while the follower is still far away, 1 once it has arrived. */
  presence: number;
}

/** How one jelly takes part in its line in one frame. */
export interface CongaDancer {
  headId: number;
  /** Place in the line, 0 for the head. */
  rank: number;
  /** How much it dances, from 0 to 1: as much as its closest link shows. */
  presence: number;
}

/** The conga lines of one frame. */
export interface CongaFrame {
  links: CongaLink[];
  /** Everybody who dances right now, by player ID. */
  dancers: Map<number, CongaDancer>;
}

/** A frame without any line. */
export const NO_CONGA: CongaFrame = { links: [], dancers: new Map() };

/** Lists who follows whom right now, by the followed jelly. Followers sort by their ID. */
function groupFollowers(players: CongaPlayer[], serverTime: number): Map<number, number[]> {
  const present = new Set(players.map((player) => player.id));
  const followers = new Map<number, number[]>();
  for (const player of [...players].sort((first, second) => first.id - second.id)) {
    const { follow } = player;
    if (!follow || follow.ends_at <= serverTime || !present.has(follow.player_id)) continue;
    followers.set(follow.player_id, [...(followers.get(follow.player_id) ?? []), player.id]);
  }
  return followers;
}

/** Walks from the head through everybody behind it, row by row. */
function collectLine(headId: number, followers: ReadonlyMap<number, number[]>): CongaLine {
  const line: CongaLine = { headId, memberIds: [headId], follows: [] };
  // The server refuses circles, the check for known members only keeps a broken state from looping.
  for (let index = 0; index < line.memberIds.length; index += 1) {
    const targetId = line.memberIds[index]!;
    for (const followerId of followers.get(targetId) ?? []) {
      if (line.memberIds.includes(followerId)) continue;
      line.memberIds.push(followerId);
      line.follows.push({ followerId, targetId });
    }
  }
  return line;
}

/**
 * Lists the conga lines among `players` at `serverTime`. A follow that has run out or points at a
 * jelly that is gone does not count.
 */
export function findCongaLines(players: CongaPlayer[], serverTime: number): CongaLine[] {
  // Most frames nobody follows anybody.
  if (!players.some((player) => player.follow)) return [];
  const followers = groupFollowers(players, serverTime);
  const following = new Set([...followers.values()].flat());
  return [...followers.keys()]
    .filter((targetId) => !following.has(targetId))
    .sort((first, second) => first - second)
    .map((headId) => collectLine(headId, followers))
    .filter((line) => line.memberIds.length >= CONGA_MEMBERS);
}

/** Returns how much of a link shows with its jellies `distance` apart, from 0 to 1. */
export function calculateLinkPresence(distance: number): number {
  const share = Math.min(1, Math.max(0, (REACH.far - distance) / (REACH.far - REACH.near)));
  return share * share * (3 - 2 * share);
}

/** Lets a jelly dance as much as the closest of its links shows. */
function joinDance(frame: CongaFrame, playerId: number, dancer: CongaDancer): void {
  const known = frame.dancers.get(playerId);
  frame.dancers.set(playerId, {
    ...dancer,
    presence: Math.max(known?.presence ?? 0, dancer.presence),
  });
}

/**
 * Returns what shows of the lines with the jellies at `positions`: a follower still on its way
 * across the hall has no link yet and does not dance, and nobody dances alone.
 */
export function gatherCongas(
  lines: CongaLine[],
  positions: ReadonlyMap<number, FloorPoint>,
): CongaFrame {
  const frame: CongaFrame = { links: [], dancers: new Map() };
  for (const line of lines) {
    for (const follow of line.follows) {
      const from = positions.get(follow.followerId);
      const to = positions.get(follow.targetId);
      const presence = from && to ? calculateLinkPresence(measureDistance(from, to)) : 0;
      if (presence === 0) continue;
      const { headId } = line;
      const rank = line.memberIds.indexOf(follow.followerId);
      const targetRank = line.memberIds.indexOf(follow.targetId);
      frame.links.push({ ...follow, headId, rank, targetRank, presence });
      joinDance(frame, follow.followerId, { headId, rank, presence });
      joinDance(frame, follow.targetId, { headId, rank: targetRank, presence });
    }
  }
  return frame;
}

/** Returns the beats of the conga so far at `serverTime`, wrapped so it stays exact in a shader. */
export function calculateCongaBeat(serverTime: number): number {
  const wrap = CONGA_BAR * 256;
  return (((serverTime / CONGA_BEAT_MS) % wrap) + wrap) % wrap;
}

/**
 * Returns how a dancer stands at `serverTime`: three small steps swaying from side to side, then a
 * kick with a hop and a turn of the hips. Each rank is a bit behind the one before it.
 */
export function calculateCongaPose(dancer: CongaDancer, serverTime: number): MotionPose {
  const beats = calculateCongaBeat(serverTime) - dancer.rank * WAVE_DELAY;
  const inBar = ((beats % CONGA_BAR) + CONGA_BAR) % CONGA_BAR;
  const beat = Math.floor(inBar);
  const hop = Math.sin(Math.PI * (inBar - beat)) * dancer.presence;
  const side = beat % 2 === 0 ? 1 : -1;
  if (beat < CONGA_BAR - 1) {
    return { lift: DANCE.stepLift * hop, turn: 0, tilt: side * DANCE.sway * hop };
  }
  return {
    lift: DANCE.kickLift * hop,
    turn: side * DANCE.kickTurn * hop,
    tilt: side * DANCE.kickTilt * hop,
  };
}

/**
 * Returns `pose` with the conga step of `dancer` on top. A jelly outside every line, with no
 * dancer, keeps its pose.
 */
export function addCongaPose(
  pose: MotionPose,
  dancer: CongaDancer | undefined,
  serverTime: number,
): MotionPose {
  if (!dancer) return pose;
  const step = calculateCongaPose(dancer, serverTime);
  return {
    lift: pose.lift + step.lift,
    turn: pose.turn + step.turn,
    tilt: pose.tilt + step.tilt,
  };
}

/**
 * Returns how bright the bulb on the head of the dancer at `rank` is at `beat`, from 0 to 1: it
 * flashes every other beat, half a beat after the one behind it. The chase of `conga.vert.glsl` with
 * `place` at `rank * LAST_BULB`.
 */
export function calculateCongaPulse(rank: number, beat: number): number {
  const steps = (rank * (CONGA_CHASE.bulbs - 1) + beat * CONGA_CHASE.steps) / CONGA_CHASE.group;
  return (1 - (steps - Math.floor(steps))) ** CONGA_CHASE.fade;
}

/** Returns how deep a garland of `length` hangs in its middle. */
export function calculateSag(length: number): number {
  return Math.min(SAG.deepest, SAG.share * length);
}
