/**
 * Eine Polonaise in der Browser-Vorschau, wie sonst beim Server: Zwei Jellies folgen einem dritten
 * und stehen vom Start an neben ihm, mit `follow` im Stand und Wegen der Art `follow`. Der Platz
 * neben dem Ziel kommt wie beim Server zustande (`findFollowGoal` und `findFreeSpot` in
 * `apps/server/internal/movement/walker.go`): 1,8 Jelly-Einheiten links oder rechts, die Seite
 * entscheidet die ID, sonst der nächste freie Platz. Nach anderthalb Minuten endet das Folgen mit
 * `follow.changed`, und beide gehen zurück an ihren Platz. Die Desktop-App lädt diese Datei nie.
 *
 * @module
 */

import type { StageArea, StageMove, StagePlayer, StagePoint } from "@jelly/stage";

import { DEMO_HALL } from "@jelly/stage/demo-room";

import type { PreviewSend } from "./previewStacks";

import { isNearArea } from "./previewNewsWalks";

/**
 * Wer vorangeht und wer ihm folgt, als Plätze in der Liste der Jellies. Keines davon braucht die
 * Vorschau sonst: nicht das eigene, nicht der Turm (`TOWER` in `previewStacks.ts`), nicht Vorleser
 * und Genannte der Jelly-News (`previewNews.ts`). Alle drei sitzen am selben Gang, rechts im
 * zweiten: So führt der Weg zurück an den Platz durch keinen Tisch.
 */
const HEAD = 14;
const FOLLOWERS = [10, 15];
const CONGA_MS = 90_000;
/** So lange dauert der Weg zurück an den Platz. */
const HOME_MS = 2000;
/** So viel Abstand halten zwei Ziele beim Server, in Jelly-Einheiten (`personalSpace`). */
export const PERSONAL_SPACE = 1.8;
/** Die Suche nach einem freien Platz beim Server: `spotSpacing`, `spotCandidates`, `goldenAngle`. */
const SPOT_SPACING = PERSONAL_SPACE / 2;
const SPOT_CANDIDATES = 400;
const GOLDEN_ANGLE = 2.399963;
/** Rechnen mit Kommazahlen: Genau `PERSONAL_SPACE` daneben gilt als frei. */
const TOLERANCE = 1e-6;
/** So viel Luft hält ein Platz zu Tischen, in Metern: ein halbes Jelly. */
const CLEARANCE = DEMO_HALL.jelly_m / 2;
const PERCENT = 100;
/** Breite eines Jellys in Jelly-Einheiten, `JELLY_WIDTH` der Bühne und `unitsPerJelly` des Servers. */
const JELLY_WIDTH = 1.7;
/**
 * Jelly-Einheiten je Prozent der Bühne. Die Demo-Halle ist tiefer als breit, die Werte sind
 * verschieden.
 */
const UNITS = {
  x: ((DEMO_HALL.width_m / DEMO_HALL.jelly_m) * JELLY_WIDTH) / PERCENT,
  y: ((DEMO_HALL.depth_m / DEMO_HALL.jelly_m) * JELLY_WIDTH) / PERCENT,
};

/** Die Polonaise der Vorschau. */
export interface CongaPreview {
  /** Wo ein Jelly der Polonaise steht, solange sie läuft. */
  spotOf: (playerId: number) => StagePoint | undefined;
  /**
   * Der Platz für ein weiteres Jelly, das sich zu einem der Polonaise stellt. `undefined`, wenn das
   * Ziel nicht dazugehört.
   */
  joinSpot: (followerId: number, targetId: number) => StagePoint | undefined;
  /** Die Wege, die die Folgenden neben ihr Ziel stellen, für das Lesen. */
  moves: () => StageMove[];
}

/** Abstand zweier Punkte der Bühne in Jelly-Einheiten der Demo-Halle. */
export function measureUnits(from: StagePoint, to: StagePoint): number {
  return Math.hypot((to.x - from.x) * UNITS.x, (to.y - from.y) * UNITS.y);
}

/** Ein Punkt der Bühne, um `x` und `y` Jelly-Einheiten versetzt. */
export function offsetSpot(point: StagePoint, x: number, y: number): StagePoint {
  return { x: point.x + x / UNITS.x, y: point.y + y / UNITS.y };
}

/** Ob ein Platz zu jedem der anderen Ziele {@link PERSONAL_SPACE} Abstand hält. */
export function keepsSpace(spot: StagePoint, others: StagePoint[]): boolean {
  return others.every((other) => measureUnits(spot, other) >= PERSONAL_SPACE - TOLERANCE);
}

/**
 * Der Platz eines Jellys neben seinem Ziel, wie ihn der Server wählt: gerade IDs links, ungerade
 * rechts. Ist der Platz nicht frei, folgt der nächste freie auf einer Spirale darum. Das gibt einen
 * Pulk, keine Reihe.
 */
export function findFollowSpot(
  followerId: number,
  target: StagePoint,
  isFree: (spot: StagePoint) => boolean,
): StagePoint {
  const side = followerId % 2 === 0 ? -PERSONAL_SPACE : PERSONAL_SPACE;
  const wanted = offsetSpot(target, side, 0);
  for (let index = 0; index < SPOT_CANDIDATES; index += 1) {
    const distance = SPOT_SPACING * Math.sqrt(index);
    const angle = index * GOLDEN_ANGLE;
    const spot = offsetSpot(wanted, distance * Math.cos(angle), distance * Math.sin(angle));
    if (isFree(spot)) return spot;
  }
  return wanted;
}

/** Wo ein Jelly zu Hause ist. */
function homeOf(player: StagePlayer): StagePoint {
  return { x: player.home_x, y: player.home_y };
}

/** Ein Weg der Art `follow`, der das Jelly an seinen Platz stellt. */
function standAt(playerId: number, spot: StagePoint): StageMove {
  return {
    player_id: playerId,
    kind: "follow",
    start_at: Date.now(),
    stack_level: 0,
    points: [{ ...spot, t: 0 }],
  };
}

/**
 * Beendet das Folgen eines Jellys, wie der Server nach `follow_seconds`: Ereignis und Weg zurück.
 * Der Server schickt als Nutzlast `{"target_id": null}`, die Bühne liest nur die Art.
 */
function sendHome(player: StagePlayer, from: StagePoint, send: PreviewSend) {
  const now = Date.now();
  player.follow = null;
  send.event({
    id: 0,
    type: "follow.changed",
    player_id: player.id,
    payload: {},
    created_at: now,
  });
  send.move({
    player_id: player.id,
    kind: "wander",
    start_at: now,
    stack_level: 0,
    points: [
      { ...from, t: 0 },
      { ...homeOf(player), t: HOME_MS },
    ],
  });
}

/**
 * Die Polonaise im Speicher, vom Start an: Der Kopf bleibt an seinem Platz, die Folgenden stehen
 * daneben. Frei ist ein Platz, wo kein Tisch steht und weder ein Jelly der Polonaise noch der Platz
 * eines anderen zu nahe ist.
 */
export function createCongaPreview(
  players: StagePlayer[],
  areas: StageArea[],
  send: PreviewSend,
): CongaPreview {
  const head = players[HEAD];
  const followers = FOLLOWERS.flatMap((index) => players[index] ?? []);
  const spots = new Map<number, StagePoint>();
  const standing = new Map<number, StageMove>();
  const desks = areas.filter((area) => area.blocks);
  const findSpot = (followerId: number, target: StagePoint) => {
    const homes = players.filter((player) => player.id !== followerId && !spots.has(player.id));
    const taken = [...spots.values(), ...homes.map(homeOf)];
    return findFollowSpot(
      followerId,
      target,
      (spot) => keepsSpace(spot, taken) && !desks.some((desk) => isNearArea(spot, desk, CLEARANCE)),
    );
  };
  if (head) {
    spots.set(head.id, homeOf(head));
    const ends_at = Date.now() + CONGA_MS;
    for (const follower of followers) {
      // Erst der Platz, dann der Eintrag: Solange ein Jelly fehlt, zählt sein Platz zu Hause.
      const spot = findSpot(follower.id, homeOf(head));
      spots.set(follower.id, spot);
      follower.follow = { player_id: head.id, ends_at };
      const move = standAt(follower.id, spot);
      standing.set(follower.id, move);
      send.move(move);
    }
    // ponytail: Hat sich das eigene Jelly dazugestellt, bleibt es am Ende stehen, wo es ist. Der
    // Server ließe es dem Jelly nachlaufen, das nach Hause geht.
    setTimeout(() => {
      for (const follower of followers) sendHome(follower, spots.get(follower.id)!, send);
      spots.clear();
      standing.clear();
    }, CONGA_MS);
  }
  return {
    spotOf: (playerId) => spots.get(playerId),
    joinSpot: (followerId, targetId) => {
      const target = spots.get(targetId);
      return target && findSpot(followerId, target);
    },
    moves: () => [...standing.values()],
  };
}
