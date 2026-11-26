/**
 * Who and what the news camera films: every jelly with where it stands and where its walk takes it,
 * the towers, the stage with its screens and the props it cannot look through. All of it comes from
 * the state of the server and the server time, never from how a jelly is animated on this screen,
 * so every screen films the same. Without three.
 *
 * @module
 */

import type { StageArea, StageMove, StagePlayer, StageStack } from "./types.ts";
import type { FloorPoint, RoomSize, ScenePoint } from "./world.ts";

import { findPositions } from "./moves.ts";
import { listBlocks, type NewsBlock } from "./newsCameraProps.ts";
import { STACK_STEP } from "./stacking.ts";
import { findArrival, findMovePosition } from "./walking.ts";
import { toFloorPoint } from "./world.ts";
import {
  containsPoint,
  findFloorHeight,
  listScreenRects,
  placeArea,
  STAGE_HEIGHT,
  toLocalRect,
  toRoomPoint,
  type Placement,
} from "./zones.ts";

const STACK_KIND = "stack";
const SCREEN_PROP = "screen";
const STAGE_SET_PROP = "stage-set";
/** The picture of a beamer screen hangs 0.55 over its floor and is 2.3 tall, see `createScreen`. */
const SCREEN_MIDDLE = 0.55 + 2.3 / 2;
/**
 * Half the width of a jelly's body, for sight lines, and of the box it is drawn in, see `BOUNDS` in
 * `body.ts` of the scene. Both grow with the jelly.
 */
const BODY = { half: 0.85, reach: 1.65 };

/** Sizes from `jellies.ts`, which brings three and the shaders and so is not imported here. */
export interface NewsSizes {
  /** From the feet to the top of the head. */
  jellyHeight: number;
  /** The presenter grows on the stage like the winner of a ceremony. */
  presenterScale: number;
}

/** A jelly as the news camera sees it. */
export interface NewsActor {
  id: number;
  /** Where its move puts it now. The camera follows this. */
  now: FloorPoint;
  /** Where its move ends. */
  goal: FloorPoint;
  /** Where its move puts it at a server time. Choices that hold for a whole take are made with it. */
  walk: (serverTime: number) => FloorPoint;
  /**
   * Server time its move ends, minus infinity without one or when it stood there all along: until
   * then it walks and faces its way.
   */
  arrival: number;
  /** How high its feet stand at the goal: on a platform or up in a tower. */
  floor: number;
  /** From the feet to the top of the head. */
  height: number;
  /** Half the width of its body, for sight lines. */
  half: number;
  /** How far the box it is drawn in reaches from its middle. The camera stays out of it. */
  reach: number;
}

/** A tower of jellies that stands right now. */
export interface NewsTower {
  /** From the bottom to the top. */
  memberIds: number[];
  foot: FloorPoint;
  /** Height of the floor under it. */
  floor: number;
  /** How much higher each level stands than the one below. */
  step: number;
}

/** The stage the news are presented on. */
export interface NewsStage {
  middle: FloorPoint;
  /** Where its front edge is, toward the hall. */
  front: number;
  width: number;
  /** Height of its floor. */
  floor: number;
}

/** The set of the news: the stage and the middles of the screen pictures. */
export interface NewsSet {
  stage: NewsStage | null;
  screens: ScenePoint[];
}

/** Everything the news camera films in a frame. */
export interface NewsCast {
  actors: Map<number, NewsActor>;
  towers: NewsTower[];
  set: NewsSet;
  /** The props the camera cannot look through. */
  blocks: NewsBlock[];
}

/** What {@link castNews} reads. */
export interface NewsCastInput {
  players: StagePlayer[];
  /** The moves as the stage plays them, see `playMoves` in `moves.ts`. */
  moves: ReadonlyMap<number, StageMove>;
  stacks: StageStack[];
  areas: StageArea[];
  platforms: Placement[];
  room: RoomSize;
  /** Where the moves put every jelly in this frame, by player ID. */
  positions: ReadonlyMap<number, FloorPoint>;
  presenterId: number | null;
  sizes: NewsSizes;
}

/** Returns the jellies as the camera sees them. A jelly on a tower stands as high as its level. */
function listActors(input: NewsCastInput, step: number): Map<number, NewsActor> {
  const { players, moves, room, platforms, sizes } = input;
  const goals = findPositions(players, moves, Number.POSITIVE_INFINITY, room);
  const actors = new Map<number, NewsActor>();
  for (const player of players) {
    const goal = goals.get(player.id) ?? { x: 0, z: 0 };
    const scale = player.id === input.presenterId ? sizes.presenterScale : 1;
    const move = moves.get(player.id);
    const perched = move?.kind === STACK_KIND ? move.stack_level * step : 0;
    actors.set(player.id, {
      id: player.id,
      now: input.positions.get(player.id) ?? goal,
      goal,
      walk: (serverTime) => (move ? findMovePosition(move, serverTime, room) : goal),
      arrival: move ? findArrival(move) : Number.NEGATIVE_INFINITY,
      floor: findFloorHeight(goal, platforms) + perched,
      height: sizes.jellyHeight * scale,
      half: BODY.half * scale,
      reach: BODY.reach * scale,
    });
  }
  return actors;
}

/** Returns the towers that stand, from the stacks of the server. */
function listTowers(input: NewsCastInput, step: number): NewsTower[] {
  return input.stacks.map((stack) => {
    const foot = toFloorPoint(stack, input.room);
    return {
      memberIds: stack.member_ids,
      foot,
      floor: findFloorHeight(foot, input.platforms),
      step,
    };
  });
}

/** Returns the middles of the screen pictures of one area: one screen, two on a whole stage set. */
function listScreens(area: StageArea, input: NewsCastInput): ScenePoint[] {
  if (area.prop !== SCREEN_PROP && area.prop !== STAGE_SET_PROP) return [];
  const placement = placeArea(area, input.room);
  if (area.prop === SCREEN_PROP) {
    const { x, z } = placement.middle;
    return [{ x, y: findFloorHeight(placement.middle, input.platforms) + SCREEN_MIDDLE, z }];
  }
  return listScreenRects(toLocalRect(placement)).map((rect) => {
    const middle = { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
    const { x, z } = toRoomPoint(middle, placement);
    return { x, y: STAGE_HEIGHT + SCREEN_MIDDLE, z };
  });
}

/** Returns a platform as a stage: its middle, its front edge toward the hall and its width. */
function toStage(platform: Placement): NewsStage {
  const corners = [-1, 1].flatMap((sideX) =>
    [-1, 1].map((sideZ) =>
      toRoomPoint({ x: (sideX * platform.width) / 2, z: (sideZ * platform.depth) / 2 }, platform),
    ),
  );
  const xs = corners.map((corner) => corner.x);
  return {
    middle: platform.middle,
    front: Math.max(...corners.map((corner) => corner.z)),
    width: Math.max(...xs) - Math.min(...xs),
    floor: STAGE_HEIGHT,
  };
}

/** Returns the stage of the show: where the presenter stands, otherwise the largest platform. */
function findStage(input: NewsCastInput, actors: Map<number, NewsActor>): NewsStage | null {
  const presenter = input.presenterId === null ? undefined : actors.get(input.presenterId);
  const own =
    presenter && input.platforms.find((platform) => containsPoint(platform, presenter.goal));
  const largest = [...input.platforms].sort(
    (first, second) => second.width * second.depth - first.width * first.depth,
  )[0];
  const platform = own ?? largest;
  return platform ? toStage(platform) : null;
}

/** Returns everything the news camera films, from the state of the server. */
export function castNews(input: NewsCastInput): NewsCast {
  const step = STACK_STEP * input.sizes.jellyHeight;
  const actors = listActors(input, step);
  const screens = input.areas.flatMap((area) => listScreens(area, input));
  return {
    actors,
    towers: listTowers(input, step),
    set: { stage: findStage(input, actors), screens },
    blocks: listBlocks(input.areas, input.room, input.platforms),
  };
}
