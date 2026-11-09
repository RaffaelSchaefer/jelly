/**
 * What the moves of the server mean for one frame: where every jelly is and how high it stands.
 *
 * @module
 */

import type { StageGathering, StageMove, StagePlayer } from "./types.ts";
import type { FloorPoint, RoomSize } from "./world.ts";

import { findMovePosition, findStackLevel } from "./walking.ts";
import { measureServerDistance, toFloorPoint } from "./world.ts";

/** Below this a ring that goes away counts as gone. */
const RING_GONE = 0.01;
/** The gathering whose winner grows on the stage. */
const CEREMONY = "ceremony";

/** Which jellies light up on a personal screen: all others, or those within `reach` of the own. */
export type StageHighlight = { kind: "others" } | { kind: "near"; reach: number };

/** Returns where the move of every jelly puts it. A jelly without a move stands at home. */
export function findPositions(
  players: StagePlayer[],
  moves: Map<number, StageMove>,
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

/** Returns how many jellies stand below each jelly right now. */
export function findLevels(moves: Map<number, StageMove>, serverTime: number): Map<number, number> {
  const levels = new Map<number, number>();
  for (const move of moves.values()) {
    levels.set(move.player_id, findStackLevel(move, serverTime));
  }
  return levels;
}

/** Returns the winner of a running ceremony, who grows on the stage. It ends without an event. */
export function findWinner(gathering: StageGathering | null, serverTime: number): number | null {
  if (gathering?.kind !== CEREMONY || serverTime >= gathering.ends_at) return null;
  return gathering.winner_id;
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
