/**
 * What every section of the page gets: the chosen LAN and the ways back to the frame.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { createElement } from "./dom.ts";
import type { FailureHandler } from "./failure.ts";
import { findLANPhase, nameLANPhase } from "./format.ts";

/** The parts of the page in the order of the navigation. */
export type Section = "overview" | "players" | "actions" | "room" | "settings" | "workshop";

/** What the panels of a LAN need from the frame. */
export interface LANActions {
  onFailure: FailureHandler;
  /** Loads the LANs again after a change, so that every panel shows what the server saved. */
  onChanged(): void;
  onDeleted(): void;
}

/** The chosen LAN with the actions of the frame. */
export interface SectionContext extends LANActions {
  lan: LANSummary;
  /** Opens another section, the players section optionally with a search. */
  open(section: Section, search?: string): void;
}

/** Creates a chip that says where a LAN stands in time. */
export function createPhaseChip(lan: LANSummary): HTMLElement {
  const phase = findLANPhase(lan, Date.now());
  return createElement("span", `chip chip-${phase}`, nameLANPhase(phase));
}
