/**
 * Wo die Jelly-News der Kartenvorschau (`previewNews.ts`) ihre Jellies hinstellen und wie diese
 * dorthin laufen. Die Demo-Halle kennt keine Zonen für Zuschauer und Vorleser, ohne sie liefe beim
 * Server niemand. Die Plätze kommen deshalb von hier: der Vorleser vorn auf der Bühne, das Publikum
 * in Reihen davor, wo keine Zone steht. Gelaufen wird über die Gänge an den Wänden der Halle, nicht
 * durch Tische. Gerechnet wird in Metern der Demo-Halle, die Bühne bekommt Prozent.
 *
 * @module
 */

import type { StageArea, StageMove, StagePoint } from "@jelly/stage";

import { DEMO_HALL } from "@jelly/stage/demo-room";

/** Schneller als `walk_speed` des Servers: Sonst stünde das Publikum erst zur Abmoderation. */
const WALK_SPEED = 1.8;
const PERCENT = 100;
const SECOND_MS = 1000;
const HALF_TURN_DEGREES = 180;
/**
 * Reihen vor der Bühne in Metern: Abstand der ersten zur Vorderkante, von Reihe zu Reihe und von
 * Jelly zu Jelly. Ein Platz hält so viel Luft zu jeder Zone, etwas mehr als ein halbes Jelly.
 */
const ROWS = { count: 4, front: 0.35, step: 0.58, gap: 0.62, clearance: 0.3 };
/** Der Vorleser steht so weit hinter der Vorderkante der Bühne, vor ihrem Pult. */
const PRESENTER_INSET = 0.5;
/** Die Gänge an den Wänden der Halle, ein halbes Jelly vom Rand. */
const AISLE = 0.25;
/** Kürzere Stücke eines Wegs fallen weg. */
const SHORTEST_STEP = 0.01;

/** Ein Punkt in Metern der Demo-Halle. */
interface Meters {
  x: number;
  y: number;
}

/** Rechnet Prozent der Bühne in Meter der Demo-Halle. */
function toMeters(point: StagePoint): Meters {
  return {
    x: (point.x * DEMO_HALL.width_m) / PERCENT,
    y: (point.y * DEMO_HALL.depth_m) / PERCENT,
  };
}

/** Rechnet Meter der Demo-Halle in Prozent der Bühne. */
function toPercent(point: Meters): StagePoint {
  return {
    x: (point.x * PERCENT) / DEMO_HALL.width_m,
    y: (point.y * PERCENT) / DEMO_HALL.depth_m,
  };
}

/** Abstand zweier Punkte der Bühne in Metern. */
function measureMeters(from: StagePoint, to: StagePoint) {
  const a = toMeters(from);
  const b = toMeters(to);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Ob ein Punkt in einer Zone liegt oder ihr näher kommt als `margin` Meter. Gedreht wird im
 * Uhrzeigersinn von oben gesehen, um die Mitte der Zone, wie auf der Bühne.
 */
export function isNearArea(point: StagePoint, area: StageArea, margin: number): boolean {
  const corner = toMeters(area);
  const size = toMeters({ x: area.width, y: area.height });
  const spot = toMeters(point);
  const dx = spot.x - (corner.x + size.x / 2);
  const dy = spot.y - (corner.y + size.y / 2);
  const turn = (area.rotation * Math.PI) / HALF_TURN_DEGREES;
  const along = dx * Math.cos(turn) + dy * Math.sin(turn);
  const across = -dx * Math.sin(turn) + dy * Math.cos(turn);
  return Math.abs(along) <= size.x / 2 + margin && Math.abs(across) <= size.y / 2 + margin;
}

/** Die Bühne der Halle: die größte Zone der Art `stage`. */
function findStage(areas: StageArea[]): StageArea | undefined {
  const stages = areas.filter((area) => area.kind === "stage");
  return stages.sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

/** Die Bühne in Metern: links, rechts und ihre Vorderkante zur Halle. */
function measureStage(stage: StageArea) {
  const corner = toMeters(stage);
  const size = toMeters({ x: stage.width, y: stage.height });
  return { left: corner.x, right: corner.x + size.x, front: corner.y + size.y };
}

/** Wo der Vorleser steht: vorn in der Mitte der Bühne. `null` ohne Bühne. */
export function findPresenterSpot(areas: StageArea[]): StagePoint | null {
  const stage = findStage(areas);
  if (!stage) return null;
  const { left, right, front } = measureStage(stage);
  return toPercent({ x: (left + right) / 2, y: front - PRESENTER_INSET });
}

/** Wie weit vorn die Wege quer durch die Halle laufen: auf der Höhe der ersten Reihe. */
export function findWalkway(areas: StageArea[]): number {
  const stage = findStage(areas);
  return stage ? toPercent({ x: 0, y: measureStage(stage).front + ROWS.front }).y : 0;
}

/** Die Plätze einer Reihe, die mittleren zuerst. Jede zweite ist um einen halben Platz versetzt. */
function listRow(row: number, stage: ReturnType<typeof measureStage>): Meters[] {
  const left = stage.left + ROWS.front + (row % 2 === 0 ? 0 : ROWS.gap / 2);
  const right = stage.right - ROWS.front;
  const middle = (stage.left + stage.right) / 2;
  const y = stage.front + ROWS.front + row * ROWS.step;
  const count = Math.floor((right - left) / ROWS.gap) + 1;
  const spots = Array.from({ length: count }, (_, index) => ({ x: left + index * ROWS.gap, y }));
  return spots.sort((a, b) => Math.abs(a.x - middle) - Math.abs(b.x - middle));
}

/**
 * Plätze für das Publikum in Reihen vor der Bühne, so breit wie sie. Ein Platz bleibt nur, wo er
 * keiner Zone zu nahe kommt. Die vordersten kommen zuerst, in jeder Reihe die mittleren.
 */
export function listCrowdSpots(areas: StageArea[]): StagePoint[] {
  const stage = findStage(areas);
  if (!stage) return [];
  const measured = measureStage(stage);
  return Array.from({ length: ROWS.count }, (_, row) => listRow(row, measured))
    .flat()
    .map(toPercent)
    .filter((spot) => !areas.some((area) => isNearArea(spot, area, ROWS.clearance)));
}

/**
 * Der Weg von `from` nach `to` über den Gang an der Wand, die `from` näher ist: erst die Reihe
 * entlang, dann den Gang hinauf bis auf die Höhe `walkway`, dann quer und zum Platz. Eckpunkte in
 * Prozent, ohne doppelte. Zurück geht es denselben Weg umgekehrt.
 */
export function planRoute(from: StagePoint, to: StagePoint, walkway: number): StagePoint[] {
  const side = toMeters(from).x < DEMO_HALL.width_m / 2 ? AISLE : DEMO_HALL.width_m - AISLE;
  const aisle = toPercent({ x: side, y: 0 }).x;
  const corners = [
    from,
    { x: aisle, y: from.y },
    { x: aisle, y: walkway },
    { x: to.x, y: walkway },
    to,
  ];
  return corners.filter((corner, index) => {
    const before = corners[index - 1];
    return !before || measureMeters(before, corner) > SHORTEST_STEP;
  });
}

/** Ein Weg entlang von Eckpunkten, so schnell wie {@link WALK_SPEED}. */
export function createRouteMove(
  playerId: number,
  corners: StagePoint[],
  kind: string,
  startAt: number,
): StageMove {
  let t = 0;
  const points = corners.map((corner, index) => {
    const before = corners[index - 1];
    if (before) t += (measureMeters(before, corner) / WALK_SPEED) * SECOND_MS;
    return { ...corner, t: Math.round(t) };
  });
  return { player_id: playerId, kind, start_at: startAt, stack_level: 0, points };
}

/** Wo ein Weg ein Jelly zu einer Zeit hinstellt. Ohne Weg steht es zu Hause. */
export function positionAt(
  move: StageMove | undefined,
  home: StagePoint,
  time: number,
): StagePoint {
  const into = time - (move?.start_at ?? 0);
  const points = move?.points ?? [];
  const next = points.findIndex((point) => point.t > into);
  const after = next === -1 ? points.at(-1) : points[next];
  const before = points[next - 1];
  if (!after) return home;
  if (next === -1 || !before) return { x: after.x, y: after.y };
  const share = (into - before.t) / (after.t - before.t);
  return { x: before.x + (after.x - before.x) * share, y: before.y + (after.y - before.y) * share };
}

/** Wann ein Weg an seinem letzten Punkt ankommt. */
export function findArrival(move: StageMove): number {
  return move.start_at + (move.points.at(-1)?.t ?? 0);
}
