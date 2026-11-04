/**
 * Where a stage view gets its data. The server page reads the server directly, the app goes through
 * its backend.
 *
 * @module
 */

import type { StageCatalog, StageEvent, StageState } from "./types.ts";

/** Events that change what the state holds, so it has to be read again. */
export const STATE_EVENTS = [
  "player.active",
  "player.updated",
  "player.hidden",
  "player.removed",
  "level.up",
  "sign.changed",
  "follow.changed",
  "stage.changed",
];

/** Events that only trigger animations. */
export const ANIMATION_EVENTS = [
  "xp.gained",
  "achievement.earned",
  "award.given",
  "emote",
  "partner.emote",
];

/** What the view wants to hear from the event stream. */
export interface StreamListener {
  onEvent: (event: StageEvent) => void;
  onConnectionChange: (isOpen: boolean) => void;
}

/** The data of a stage view. */
export interface StageSource {
  /** Reads all jellies and areas. */
  readState: () => Promise<StageState>;
  /** Reads the fixed lists. */
  readCatalog: () => Promise<StageCatalog>;
  /** Starts the events after `firstEventId`. The view calls this once, after its first state. */
  subscribe: (firstEventId: number, listener: StreamListener) => void;
}
