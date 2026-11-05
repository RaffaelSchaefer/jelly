/**
 * Everything about one LAN.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { createElement } from "./dom.ts";
import { findLANPhase, formatDateTime, nameLANPhase } from "./format.ts";
import { createJoinCodeForm } from "./joinCodeForm.ts";
import { createRulesForm, type FailureHandler } from "./rulesForm.ts";

/** Creates a chip that says where a LAN stands in time. */
export function createPhaseChip(lan: LANSummary): HTMLElement {
  const phase = findLANPhase(lan, Date.now());
  return createElement("span", `chip chip-${phase}`, nameLANPhase(phase));
}

/** Creates the part with name and period. */
function createHead(lan: LANSummary): HTMLElement {
  const period = `${formatDateTime(lan.starts_at)} bis ${formatDateTime(lan.ends_at)}`;
  return createElement(
    "section",
    "panel detail-head",
    createElement("div", "lan-entry-head", createElement("h2", "", lan.name), createPhaseChip(lan)),
    createElement("p", "hint time", period),
    createElement("p", "hint", `Kurzname ${lan.slug}, Zeitzone ${lan.timezone}`),
  );
}

/** Creates all panels of a LAN. */
export function createLANDetail(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  return createElement(
    "div",
    "detail",
    createHead(lan),
    createJoinCodeForm(lan, onFailure),
    createRulesForm(lan, onFailure),
  );
}
