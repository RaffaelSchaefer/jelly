/**
 * Shapes of the server responses the stage reads, see `apps/server/docs/api.md`.
 *
 * @module
 */

/**
 * How jellies use an area: where they stand (seats, stage, lounge, visitors), where they line up
 * (queue), a named place to go to (public), the two zones of a ceremony (spectators, winner) and
 * `none` for nothing yet. What stands there is `prop`. Unknown values count as `none`.
 */
export type AreaKind =
  | "seats"
  | "stage"
  | "lounge"
  | "visitors"
  | "queue"
  | "public"
  | "spectators"
  | "winner"
  | "none";

/**
 * A zone of the room in percent of the stage. `x`, `y`, `width` and `height` say where it would
 * stand without `rotation`.
 */
export interface StageArea {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees clockwise seen from above, from 0 up to below 360, around the middle of the zone. */
  rotation: number;
  /** Text and not {@link AreaKind}: a newer server may add kinds. */
  kind: string;
  /** Whether jellies walk around the zone. */
  blocks: boolean;
  /** The model that stands here, empty for bare floor. Unknown props show bare floor. */
  prop: string;
  /** Only a `public` zone has a name. */
  name: string | null;
}

/** What a jelly wears in one slot. */
export interface EquippedCosmetic {
  key: string;
  color: string | null;
}

/** A walk to a point and back, with the time it ends in server time. */
export interface StageTrip {
  x: number;
  y: number;
  ends_at: number;
}

/** Whom a jelly follows and when that ends by itself, in server time. */
export interface StageFollow {
  player_id: number;
  ends_at: number;
}

/**
 * What all jellies do right now: `food` sends them to the queues, `ceremony` to the spectators and
 * the winner to the winner zone. Unknown kinds show nothing special.
 */
export interface StageGathering {
  kind: string;
  winner_id: number | null;
  ends_at: number;
}

/** A jelly as the server reports it. */
export interface StagePlayer {
  id: number;
  name: string;
  color: string;
  /** What the jelly wears, by slot. */
  equipped: Record<string, EquippedCosmetic>;
  level: number;
  sign: string | null;
  follow: StageFollow | null;
  area_id: number | null;
  /** A jelly without its own area wanders as a visitor. */
  is_visitor: boolean;
  home_x: number;
  home_y: number;
}

/** A point of a move. `t` counts milliseconds from the start of the move. */
export interface MovePoint extends StagePoint {
  t: number;
}

/**
 * One walk of a jelly, as `GET /v1/stage` and the `move` messages of the stream report it. A newer
 * move of the same jelly replaces it, and after its last point the jelly stands there.
 */
export interface StageMove {
  player_id: number;
  /** Why the jelly walks, such as `wander`, `trip`, `follow` or `snack`. */
  kind: string;
  start_at: number;
  points: MovePoint[];
  /** How many jellies stand below this one, once it has arrived on a stack. Not the XP level. */
  stack_level: number;
}

/** A running stack. `member_ids` goes from bottom to top. */
export interface StageStack {
  id: number;
  x: number;
  y: number;
  ends_at: number;
  member_ids: number[];
}

/** Size of the stage in the unit of all positions, and of the real hall in meters. */
export interface StageRoom {
  width: number;
  height: number;
  unit: string;
  /** Width of the real hall from left to right. */
  width_m: number;
  /** Depth of the real hall from back to front. */
  depth_m: number;
  /** Width of a jelly in the real hall. */
  jelly_m: number;
}

/** Response of `GET /v1/stage`. */
export interface StageState {
  last_event_id: number;
  server_time: number;
  room: StageRoom;
  areas: StageArea[];
  players: StagePlayer[];
  moves: StageMove[];
  stacks: StageStack[];
  gathering: StageGathering | null;
}

/** One entry of `GET /v1/stage/events`. The payload depends on the event type. */
export interface StageEvent {
  id: number;
  type: string;
  player_id: number | null;
  payload: EventPayload;
  created_at: number;
}

/** The fields of all event payloads the stage uses. */
export interface EventPayload {
  key?: string;
  partner_id?: number;
  amount?: number;
  level?: number;
  title?: string;
  /** What the XP of `xp.gained` was for, such as `poke`, `food` or `drink`. */
  source?: string;
  /** Whom `highlight` lights up, when it goes out and the aura it wears meanwhile. */
  target_id?: number;
  ends_at?: number;
  cosmetic_key?: string;
}

/** The fixed lists of `GET /v1/catalog` the stage needs for its texts. */
export interface StageCatalog {
  signs: CatalogEntry[];
  achievements: { key: string; title: string }[];
}

/** A choice of a fixed list. */
export interface CatalogEntry {
  key: string;
  label: string;
}

/** A position on the stage in percent. */
export interface StagePoint {
  x: number;
  y: number;
}
