/**
 * Shapes of the server responses the stage reads, see `docs/api.md`.
 *
 * @module
 */

/** A rectangle on the stage in percent. Areas have no names on purpose. */
export interface StageArea {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A jelly as the server reports it. */
export interface StagePlayer {
  id: number;
  name: string;
  color: string;
  cosmetic: string | null;
  level: number;
  sign: string | null;
  follow_player_id: number | null;
  area_id: number | null;
  home_x: number;
  home_y: number;
}

/** Response of `GET /state`. */
export interface StageState {
  last_event_id: number;
  server_time: number;
  areas: StageArea[];
  players: StagePlayer[];
}

/** One entry of `GET /events/stream`. The payload depends on the event type. */
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
}

/** The fixed lists of `GET /catalog` the stage needs for its texts. */
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
