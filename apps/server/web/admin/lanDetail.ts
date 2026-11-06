/**
 * Everything about one LAN, in tabs.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { createButton, createElement } from "./dom.ts";
import { createEventCodesTab } from "./eventCodes.ts";
import type { FailureHandler } from "./failure.ts";
import { findLANPhase, formatDateTime, nameLANPhase } from "./format.ts";
import { createJoinCodeForm } from "./joinCodeForm.ts";
import { createLANEditForm } from "./lanEditForm.ts";
import { createRoomTab } from "./room.ts";
import { createRulesForm } from "./rulesForm.ts";
import { createScheduleTab } from "./schedule.ts";
import { createTestRulesPanel } from "./testRules.ts";

/** What the panels of a LAN need from the work area. */
export interface LANActions {
  onFailure: FailureHandler;
  /** Loads the LANs again after a change, so that every panel shows what the server saved. */
  onChanged(): void;
  onDeleted(): void;
}

/** The tabs of a LAN, with their part of the address. */
function listTabs(): [hash: string, text: string][] {
  return [
    ["einstellungen", "Einstellungen"],
    ["raum", "Raum"],
    ["codes", "Event-Codes"],
    ["ablauf", "Ablauf"],
  ];
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

/** Creates the content of one tab. */
function createTab(tab: string, lan: LANSummary, actions: LANActions): HTMLElement {
  if (tab === "raum") {
    return createRoomTab(lan, actions.onFailure);
  }
  if (tab === "codes") {
    return createEventCodesTab(lan, actions.onFailure);
  }
  if (tab === "ablauf") {
    return createScheduleTab(lan, actions.onFailure);
  }
  return createElement(
    "div",
    "detail",
    createTestRulesPanel(lan, actions),
    createRulesForm(lan, actions.onFailure),
    createJoinCodeForm(lan, actions),
    createLANEditForm(lan, actions),
  );
}

/** Reads the tab from the address, `#lan-3/raum`, and falls back to the settings. */
function readTab(): string {
  const tab = location.hash.split("/")[1] ?? "";
  return listTabs().some(([hash]) => hash === tab) ? tab : "einstellungen";
}

/** Creates all panels of a LAN. */
export function createLANDetail(lan: LANSummary, actions: LANActions): HTMLElement {
  const tabs = createElement("nav", "tabs");
  const content = createElement("div", "");
  const open = (tab: string) => {
    // Replacing the address keeps the work area from opening the LAN again.
    history.replaceState(null, "", `#lan-${lan.id}/${tab}`);
    tabs.replaceChildren(
      ...listTabs().map(([hash, text]) => {
        const button = createButton(text, "quiet", () => open(hash));
        button.setAttribute("aria-current", String(hash === tab));
        return button;
      }),
    );
    content.replaceChildren(createTab(tab, lan, actions));
  };
  open(readTab());
  return createElement("div", "detail", createHead(lan), tabs, content);
}
