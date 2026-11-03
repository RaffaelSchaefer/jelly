/**
 * Ways around obstacles: desks, the snack bar counter and the props on the stage. The floor is a
 * grid of small cells, and a cell is blocked when a jelly standing there would touch an obstacle.
 * Paths go cell by cell and are then pulled straight.
 *
 * @module
 */

import type { FloorPoint, FloorRect } from "./world.ts";

/** Edge length of a cell in jelly units. Small enough for the narrow gaps of a real room. */
const CELL_SIZE = 0.25;
/** Line of sight is checked at this share of a cell, so no blocked cell is skipped. */
const SIGHT_STEP_SHARE = 0.5;
const NO_CELL = -1;
/** Right, left, down and up in the grid. */
const NEIGHBOR_STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** The walkable floor, with reusable scratch memory for path searches. */
export interface NavGrid {
  room: FloorRect;
  columns: number;
  rows: number;
  blocked: Uint8Array;
  cameFrom: Int32Array;
  visitedIn: Uint32Array;
  queue: Int32Array;
  search: number;
}

/** Returns the distance from a point to a rectangle, 0 inside. */
function measureRectDistance(point: FloorPoint, rect: FloorRect): number {
  const outsideX = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
  const outsideZ = Math.max(rect.minZ - point.z, 0, point.z - rect.maxZ);
  return Math.hypot(outsideX, outsideZ);
}

/** Builds the grid of a room. A cell is blocked when its center is closer than `clearance`. */
export function createNavGrid(
  room: FloorRect,
  obstacles: FloorRect[],
  clearance: number,
): NavGrid {
  const columns = Math.ceil((room.maxX - room.minX) / CELL_SIZE);
  const rows = Math.ceil((room.maxZ - room.minZ) / CELL_SIZE);
  const grid: NavGrid = {
    room,
    columns,
    rows,
    blocked: new Uint8Array(columns * rows),
    cameFrom: new Int32Array(columns * rows),
    visitedIn: new Uint32Array(columns * rows),
    queue: new Int32Array(columns * rows),
    search: 0,
  };
  for (let cell = 0; cell < columns * rows; cell++) {
    const center = findCellCenter(grid, cell);
    const isNearObstacle = obstacles.some(
      (obstacle) => measureRectDistance(center, obstacle) < clearance,
    );
    grid.blocked[cell] = isNearObstacle ? 1 : 0;
  }
  return grid;
}

/** Returns the cell under a point. Points outside the room use the nearest edge cell. */
function findCell(grid: NavGrid, point: FloorPoint): number {
  const column = Math.floor((point.x - grid.room.minX) / CELL_SIZE);
  const row = Math.floor((point.z - grid.room.minZ) / CELL_SIZE);
  const clampedColumn = Math.min(grid.columns - 1, Math.max(0, column));
  const clampedRow = Math.min(grid.rows - 1, Math.max(0, row));
  return clampedRow * grid.columns + clampedColumn;
}

/** Returns the middle of a cell. */
function findCellCenter(grid: NavGrid, cell: number): FloorPoint {
  return {
    x: grid.room.minX + ((cell % grid.columns) + 0.5) * CELL_SIZE,
    z: grid.room.minZ + (Math.floor(cell / grid.columns) + 0.5) * CELL_SIZE,
  };
}

/** Says whether a jelly may stand at this point. Outside the room counts as blocked. */
export function isWalkable(grid: NavGrid, point: FloorPoint): boolean {
  const { room } = grid;
  const isInside =
    point.x >= room.minX && point.x <= room.maxX && point.z >= room.minZ && point.z <= room.maxZ;
  return isInside && grid.blocked[findCell(grid, point)] === 0;
}

/** Says whether a jelly can walk straight from one point to the other. */
export function hasLineOfSight(grid: NavGrid, from: FloorPoint, to: FloorPoint): boolean {
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(length / (CELL_SIZE * SIGHT_STEP_SHARE)));
  for (let step = 0; step <= steps; step++) {
    const share = step / steps;
    const point = { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share };
    if (grid.blocked[findCell(grid, point)] === 1) {
      return false;
    }
  }
  return true;
}

/** Visits cells outward from `start` and stops when `isDone` accepts one. Returns that cell. */
function searchCells(
  grid: NavGrid,
  start: number,
  canEnter: (cell: number) => boolean,
  isDone: (cell: number) => boolean,
): number {
  grid.search += 1;
  grid.visitedIn[start] = grid.search;
  grid.cameFrom[start] = NO_CELL;
  grid.queue[0] = start;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const cell = grid.queue[head++] ?? NO_CELL;
    if (isDone(cell)) {
      return cell;
    }
    for (const neighbor of listNeighbors(grid, cell)) {
      if (grid.visitedIn[neighbor] !== grid.search && canEnter(neighbor)) {
        grid.visitedIn[neighbor] = grid.search;
        grid.cameFrom[neighbor] = cell;
        grid.queue[tail++] = neighbor;
      }
    }
  }
  return NO_CELL;
}

/** Returns the cells next to a cell, without leaving the grid. */
function listNeighbors(grid: NavGrid, cell: number): number[] {
  const column = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  const neighbors: number[] = [];
  for (const [stepColumn, stepRow] of NEIGHBOR_STEPS) {
    const nextColumn = column + stepColumn;
    const nextRow = row + stepRow;
    if (nextColumn >= 0 && nextColumn < grid.columns && nextRow >= 0 && nextRow < grid.rows) {
      neighbors.push(nextRow * grid.columns + nextColumn);
    }
  }
  return neighbors;
}

/** Returns the point itself if a jelly may stand there, otherwise the nearest free cell center. */
export function findNearestWalkable(grid: NavGrid, point: FloorPoint): FloorPoint {
  if (isWalkable(grid, point)) {
    return point;
  }
  const isFree = (cell: number) => grid.blocked[cell] === 0;
  const cell = searchCells(grid, findCell(grid, point), () => true, isFree);
  return cell === NO_CELL ? point : findCellCenter(grid, cell);
}

/**
 * Returns the waypoints from `from` to `to`, without `from`. If `to` cannot be reached, the path
 * ends at the reachable cell closest to it.
 */
export function findPath(grid: NavGrid, from: FloorPoint, to: FloorPoint): FloorPoint[] {
  const start = findNearestWalkable(grid, from);
  const goalCell = findCell(grid, to);
  let closestCell = findCell(grid, start);
  let closestDistance = Infinity;
  const isFree = (cell: number) => grid.blocked[cell] === 0;
  const isGoal = (cell: number) => {
    const center = findCellCenter(grid, cell);
    const distance = Math.hypot(center.x - to.x, center.z - to.z);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestCell = cell;
    }
    return cell === goalCell;
  };
  const reached = searchCells(grid, findCell(grid, start), isFree, isGoal);
  const cells: number[] = [];
  for (let cell = reached === NO_CELL ? closestCell : reached; cell !== NO_CELL;) {
    cells.unshift(cell);
    cell = grid.cameFrom[cell] ?? NO_CELL;
  }
  const waypoints = cells.slice(1, -1).map((cell) => findCellCenter(grid, cell));
  const end = reached === NO_CELL ? findCellCenter(grid, closestCell) : to;
  const path = smoothPath(grid, start, [...waypoints, end]);
  // A jelly that stands too close to a desk first steps out to the nearest free spot.
  return start === from ? path : [start, ...path];
}

/** Drops every waypoint that can be skipped in a straight line. */
function smoothPath(grid: NavGrid, start: FloorPoint, waypoints: FloorPoint[]): FloorPoint[] {
  const smooth: FloorPoint[] = [];
  let anchor = start;
  let index = 0;
  while (index < waypoints.length) {
    let farthest = index;
    while (
      farthest + 1 < waypoints.length &&
      hasLineOfSight(grid, anchor, waypoints[farthest + 1] ?? anchor)
    ) {
      farthest += 1;
    }
    anchor = waypoints[farthest] ?? anchor;
    smooth.push(anchor);
    index = farthest + 1;
  }
  return smooth;
}
