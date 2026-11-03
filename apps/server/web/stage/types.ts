/**
 * Shapes of the server responses the stage reads, see `docs/api.md`.
 *
 * @module
 */

/**
 * What an area is: where jellies stand (seats, stage, lounge), what they walk around (desk,
 * snackbar) and what they walk over (cable).
 */
export type AreaKind = "seats" | "desk" | "cable" | "stage" | "lounge" | "snackbar";

/** A rectangle on the stage in percent. Areas have no names on purpose. */
export interface StageArea {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: AreaKind;
}

/** A jelly as the server reports it. */
export interface StagePlayer {
  id: number;
  name: string;
  color: string;
  equipped: Record<string, { key: string; color: string | null }>;
  level: number;
  sign: string | null;
  follow_player_id: number | null;
  area_id: number | null;
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

/** Response of `GET /v1/stage`. */
export interface StageState {
  last_event_id: number;
  server_time: number;
  room: { width: number; height: number; unit: string };
  areas: StageArea[];
  players: StagePlayer[];
  moves: StageMove[];
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
