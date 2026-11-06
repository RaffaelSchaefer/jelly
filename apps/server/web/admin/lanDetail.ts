/**
 * Everything about one LAN.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { createElement } from "./dom.ts";
import { findLANPhase, formatDateTime, nameLANPhase } from "./format.ts";
import { createJoinCodeForm } from "./joinCodeForm.ts";
import { createLANEditForm } from "./lanEditForm.ts";
import { createRulesForm, type FailureHandler } from "./rulesForm.ts";
import { createTestRulesPanel } from "./testRules.ts";

/** What the panels of a LAN need from the work area. */
export interface LANActions {
  onFailure: FailureHandler;
  /** Loads the LANs again after a change, so that every panel shows what the server saved. */
  onChanged(): void;
  onDeleted(): void;
}

/** Creates a chip that says where a LAN stands in time. */
export function createPhaseChip(lan: LANSummary): HTMLElement {
  const phase = findLANPhase(lan, Date.now());
  return createElement("span", `chip chip-${phase}`, nameLANPhase(phase));
}

/** Shows the code players join with, or says how to make it visible. */
function createJoinCodeLine(lan: LANSummary): HTMLElement {
  if (lan.join_code === null) {
    return createElement(
      "p",
      "hint",
      "LAN-Code: unbekannt, weil er nur verschlüsselt gespeichert wurde. Ersetze ihn, um ihn hier zu sehen.",
    );
  }
  return createElement("p", "", "LAN-Code: ", createElement("span", "code", lan.join_code));
}

/** Creates the part with name, period and code. */
function createHead(lan: LANSummary): HTMLElement {
  const period = `${formatDateTime(lan.starts_at)} bis ${formatDateTime(lan.ends_at)}`;
  return createElement(
    "section",
    "panel detail-head",
    createElement("div", "lan-entry-head", createElement("h2", "", lan.name), createPhaseChip(lan)),
    createElement("p", "hint time", period),
    createElement("p", "hint", `Kurzname ${lan.slug}, Zeitzone ${lan.timezone}`),
    createJoinCodeLine(lan),
  );
}

/** Creates all panels of a LAN. */
export function createLANDetail(lan: LANSummary, actions: LANActions): HTMLElement {
  return createElement(
    "div",
    "detail",
    createHead(lan),
    createTestRulesPanel(lan, actions),
    createRulesForm(lan, actions.onFailure),
    createJoinCodeForm(lan, actions),
    createLANEditForm(lan, actions),
  );
}
