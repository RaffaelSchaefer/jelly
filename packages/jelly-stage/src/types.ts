/**
 * Shapes of the server responses the stage reads, see `apps/server/docs/api.md`.
 *
 * @module
 */

/**
 * What an area is assigned to: where jellies stand (seats, stage, lounge, visitors), what they walk
 * around (desk, snackbar) and what they walk over (cable). `none` means nothing yet.
 */
export type AreaKind =
  | "seats"
  | "desk"
  | "cable"
  | "stage"
  | "lounge"
  | "snackbar"
  | "visitors"
  | "none";

/** A rectangle on the stage in percent. Areas have no names on purpose. */
export interface StageArea {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: AreaKind;
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
  until: number;
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
  follow_player_id: number | null;
  /** When following ends by itself, in server time. */
  follow_until: number | null;
  area_id: number | null;
  /** A jelly without its own area wanders as a visitor. */
  is_visitor: boolean;
  trip: StageTrip | null;
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
  /** How many jellies stand below this one, once it has arrived on a stack. */
  level: number;
}

/** A running stack. `member_ids` goes from bottom to top. */
export interface StageStack {
  id: number;
  x: number;
  y: number;
  ends_at: number;
  member_ids: number[];
}

/** Size of the stage in the unit of all positions. */
export interface StageRoom {
  width: number;
  height: number;
  unit: string;
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
  /** Whom `highlight` lights up, and when it goes out. */
  target_id?: number;
  until?: number;
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
