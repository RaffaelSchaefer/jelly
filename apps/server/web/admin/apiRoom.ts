/**
 * Admin routes for the room of a LAN: zones, seat codes, assignments and the map file.
 *
 * @module
 */

import { sendRequest } from "./api.ts";

/** A zone of the room. Position and size are in percent of the stage. */
export interface AdminArea {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  kind: string;
  blocks: boolean;
  prop: string;
  name: string;
  /** The ID in the map file, empty for zones made by hand. */
  map_id: string;
}

/** Which zone a player of the LAN belongs to. */
export interface AreaAssignment {
  player_id: number;
  name: string;
  area_id: number | null;
}

/** The zones of a LAN with the players in them. */
export interface AreaList {
  areas: AdminArea[];
  assignments: AreaAssignment[];
  /** The size of every zone in meters of the real hall, from the room rules of the LAN. */
  sizes: ZoneSize[];
}

/** The size of a zone in meters. */
export interface ZoneSize {
  area_id: number;
  width_m: number;
  height_m: number;
}

/** A seat code and whether someone used it. */
export interface SeatCode {
  area_id: number;
  code: string;
  used_at: number | null;
  player_id: number | null;
  name: string | null;
  is_seated: boolean;
}

/** What a map import changes, by zone IDs of the file. */
export interface MapReport {
  created: string[];
  updated: string[];
  removed: string[];
  unknown_props: string[];
  unassigned_players: number;
}

/** Lists the zones of a LAN. */
export function listAreas(lanID: number): Promise<AreaList> {
  return sendRequest("GET", `/lans/${lanID}/areas`);
}

/** Saves a zone. The server takes every field, so the page sends the whole zone. */
export function updateArea(lanID: number, area: AdminArea): Promise<AdminArea> {
  return sendRequest("PUT", `/lans/${lanID}/areas/${area.id}`, area);
}

/** Lists all seat codes of a LAN. */
export function listSeatCodes(lanID: number): Promise<SeatCode[]> {
  return sendRequest("GET", `/lans/${lanID}/seat-codes`);
}

/** Gives a seat a new code, which replaces an older one. */
export function issueSeatCode(lanID: number, areaID: number): Promise<SeatCode> {
  return sendRequest("POST", `/lans/${lanID}/areas/${areaID}/code`, {});
}

/** Puts a player in a zone, or takes the player out with `null`. */
export function assignArea(lanID: number, playerID: number, areaID: number | null) {
  return sendRequest("PUT", `/lans/${lanID}/players/${playerID}/area`, { area_id: areaID });
}

/** Imports a map file, or only reports what an import would change. */
export function importMap(lanID: number, roomMap: unknown, isPreview: boolean): Promise<MapReport> {
  const query = isPreview ? "?dry_run=true" : "";
  return sendRequest("PUT", `/lans/${lanID}/map${query}`, roomMap);
}
