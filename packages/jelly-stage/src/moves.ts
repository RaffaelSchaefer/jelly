/**
 * What the moves of the server mean for one frame: where every jelly is and how high it stands.
 *
 * @module
 */

import type { StageGathering, StageMove, StagePlayer } from "./types.ts";
import type { FloorPoint, RoomSize } from "./world.ts";

import { findMovePosition } from "./walking.ts";
import { measureServerDistance, toFloorPoint } from "./world.ts";

/** Below this a ring that goes away counts as gone. */
const RING_GONE = 0.01;
/** The gatherings with a jelly that grows on the stage: the winner, or the presenter of the news. */
const CEREMONY = "ceremony";
const NEWS = "news";
/** The kind of move that sends the presenter of the news to the stage, `KindNews` of the server. */
const NEWS_WALK = "news";

/** Which jellies light up on a personal screen: all others, or those within `reach` of the own. */
export type StageHighlight = { kind: "others" } | { kind: "near"; reach: number };

/** Returns where the move of every jelly puts it. A jelly without a move stands at home. */
export function findPositions(
  players: StagePlayer[],
  moves: ReadonlyMap<number, StageMove>,
  serverTime: number,
  room: RoomSize,
): Map<number, FloorPoint> {
  const positions = new Map<number, FloorPoint>();
  for (const player of players) {
    const move = moves.get(player.id);
    positions.set(
      player.id,
      move
        ? findMovePosition(move, serverTime, room)
        : toFloorPoint({ x: player.home_x, y: player.home_y }, room),
    );
  }
  return positions;
}

/**
 * Returns the presenter of running news, the one place that decides it. It grows on the stage and
 * shows nothing in or on its hands until the show ends. A gathering ends without an event.
 */
export function findPresenter(gathering: StageGathering | null, serverTime: number): number | null {
  return isNewsOnAir(gathering, serverTime) ? (gathering?.presenter_id ?? null) : null;
}

/** Returns whether the news are on air, with or without a presenter. */
export function isNewsOnAir(gathering: StageGathering | null, serverTime: number): boolean {
  return gathering?.kind === NEWS && serverTime < gathering.ends_at;
}

/**
 * Returns the jelly that grows on the stage: the winner of a running ceremony or the presenter of
 * running news. A gathering ends without an event.
 */
export function findWinner(gathering: StageGathering | null, serverTime: number): number | null {
  if (gathering?.kind === CEREMONY && serverTime < gathering.ends_at) return gathering.winner_id;
  return findPresenter(gathering, serverTime);
}

/**
 * Returns the moves as the stage plays them at a server time, the one place that decides it: the
 * moves of the server, except the `news` move of the presenter of running news. The server sends
 * the presenter to the stage at walking pace, which takes most of a show in a large hall, so the
 * stage plays that move as finished: from the first moment of the show the presenter stands where
 * it ends, as if it had stood there all along, on every screen and also on one that loads late.
 * Everything that reads moves reads these, so jellies, camera, desk and towers agree. Once the show
 * is over the move of the server counts again, and the move back starts where the server says.
 */
export function playMoves(
  moves: ReadonlyMap<number, StageMove>,
  gathering: StageGathering | null,
  serverTime: number,
): ReadonlyMap<number, StageMove> {
  const presenterId = findPresenter(gathering, serverTime);
  const move = presenterId === null ? undefined : moves.get(presenterId);
  const end = move?.points.at(-1);
  if (!move || !end || move.kind !== NEWS_WALK) return moves;
  const played = new Map(moves);
  played.set(move.player_id, {
    ...move,
    start_at: Number.NEGATIVE_INFINITY,
    points: [{ ...end, t: 0 }],
  });
  return played;
}

/** Forgets the moves of jellies that left the stage. */
export function pruneMoves(moves: Map<number, StageMove>, players: StagePlayer[]): void {
  const present = new Set(players.map((player) => player.id));
  for (const playerId of moves.keys()) {
    if (!present.has(playerId)) moves.delete(playerId);
  }
}

/**
 * Returns the jellies that light up. The own jelly never does, and without it on the stage nobody is
 * near. Distances count as the server measures `near_distance`, whatever the size of the room.
 */
export function listHighlighted(
  positions: Map<number, FloorPoint>,
  ownId: number | null,
  highlight: StageHighlight,
  room: RoomSize,
): Set<number> {
  const own = ownId === null ? undefined : positions.get(ownId);
  const lit = new Set<number>();
  for (const [playerId, position] of positions) {
    if (playerId === ownId) continue;
    const isNear =
      highlight.kind === "near" &&
      own &&
      measureServerDistance(own, position, room) <= highlight.reach;
    if (highlight.kind === "others" || isNear) lit.add(playerId);
  }
  return lit;
}

/**
 * Moves the ring of every jelly toward being there or gone, by `step` of the way. New rings start at
 * 0, rings that are gone leave the map.
 */
export function stepRingPresence(
  shown: Map<number, number>,
  lit: ReadonlySet<number>,
  step: number,
): void {
  for (const playerId of lit) {
    if (!shown.has(playerId)) shown.set(playerId, 0);
  }
  for (const [playerId, presence] of shown) {
    const isLit = lit.has(playerId);
    const next = presence + ((isLit ? 1 : 0) - presence) * step;
    if (isLit || next > RING_GONE) shown.set(playerId, next);
    else shown.delete(playerId);
  }
}
