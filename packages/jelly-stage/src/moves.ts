/**
 * What the moves of the server mean for one frame: where every jelly is and how high it stands.
 *
 * @module
 */

import type { StageMove, StagePlayer } from "./types.ts";
import type { FloorPoint } from "./world.ts";

import { findMovePosition, findStackLevel } from "./walking.ts";
import { toFloorPoint } from "./world.ts";

/** Returns where the move of every jelly puts it. A jelly without a move stands at home. */
export function findPositions(
  players: StagePlayer[],
  moves: Map<number, StageMove>,
  serverTime: number,
): Map<number, FloorPoint> {
  const positions = new Map<number, FloorPoint>();
  for (const player of players) {
    const move = moves.get(player.id);
    positions.set(
      player.id,
      move
        ? findMovePosition(move, serverTime)
        : toFloorPoint({ x: player.home_x, y: player.home_y }),
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

/** Forgets the moves of jellies that left the stage. */
export function pruneMoves(moves: Map<number, StageMove>, players: StagePlayer[]): void {
  const present = new Set(players.map((player) => player.id));
  for (const playerId of moves.keys()) {
    if (!present.has(playerId)) moves.delete(playerId);
  }
}
