/**
 * Everything about one LAN.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { createElement } from "./dom.ts";
import { findLANPhase, formatDateTime, nameLANPhase } from "./format.ts";

/** Creates a chip that says where a LAN stands in time. */
export function createPhaseChip(lan: LANSummary): HTMLElement {
  const phase = findLANPhase(lan, Date.now());
  return createElement("span", `chip chip-${phase}`, nameLANPhase(phase));
}

/** Creates the panel of a LAN. */
export function createLANDetail(lan: LANSummary): HTMLElement {
  const period = `${formatDateTime(lan.starts_at)} bis ${formatDateTime(lan.ends_at)}`;
  return createElement(
    "section",
    "panel",
    createElement(
      "div",
      "detail-head",
      createElement(
        "div",
        "lan-entry-head",
        createElement("h2", "", lan.name),
        createPhaseChip(lan),
      ),
      createElement("p", "hint time", period),
      createElement("p", "hint", `Kurzname ${lan.slug}, Zeitzone ${lan.timezone}`),
    ),
  );
}
