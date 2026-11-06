/**
 * What every panel of the room tab gets.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import type { AreaList, SeatCode } from "./apiRoom.ts";
import type { FailureHandler } from "./failure.ts";

/** The loaded room and a way to load it again after a change. */
export interface Room {
  lan: LANSummary;
  areaList: AreaList;
  seatCodes: SeatCode[];
  onFailure: FailureHandler;
  reload: () => void;
}
