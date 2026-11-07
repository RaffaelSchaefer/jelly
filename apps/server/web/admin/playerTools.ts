/**
 * What the actions inside an opened player row share: the player, the catalogs and a way to run.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import type { Cosmetic } from "./apiEvents.ts";
import type { Achievement, PlayerSummary } from "./apiPeople.ts";
import type { AreaList } from "./apiRoom.ts";
import { createElement, type Child, type Message } from "./dom.ts";
import type { FailureHandler } from "./failure.ts";

/** Everything the rows choose from, loaded once per list. */
export interface Catalogs {
  achievements: Achievement[];
  cosmetics: Cosmetic[];
  /** The zones of the chosen LAN and who stands where. */
  areas: AreaList;
}

/** The player of an opened row with what its actions need. */
export interface PlayerTools {
  player: PlayerSummary;
  lan: LANSummary;
  catalogs: Catalogs;
  message: Message;
  onFailure: FailureHandler;
  /** Runs an action, shows `done` in the row and loads the list again. */
  run(action: Promise<unknown>, done: string): void;
}

/** Creates a titled group of actions inside an opened row. */
export function createToolGroup(title: string, className: string, ...children: Child[]) {
  return createElement(
    "section",
    `tool-group ${className}`.trim(),
    createElement("h4", "", title),
    ...children,
  );
}

/** Gives an input or select an ID that is unique on the page, because many rows can be open. */
export function makeToolID(tools: PlayerTools, name: string): string {
  return `${name}-${tools.player.id}`;
}
