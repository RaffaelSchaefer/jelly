/**
 * The frame after the login: the chosen LAN on top, the sections below, and the open section.
 *
 * @module
 */

import { listLANs, type LANSummary } from "./api.ts";
import { createButton, createElement } from "./dom.ts";
import { createFailureHandler, type FailureHandler } from "./failure.ts";
import { formatDateTime } from "./format.ts";
import { createPhaseChip, type Section, type SectionContext } from "./lanContext.ts";
import { createLANForm } from "./lanForm.ts";
import { createOverview } from "./overview.ts";
import { listSections, readPlace, writePlace, type Place } from "./place.ts";
import { createPlayersSection } from "./players.ts";
import { createRoomTab } from "./room.ts";
import { createActionsSection } from "./schedule.ts";
import { createSettingsSection } from "./settings.ts";
import { areTestRulesActive } from "./testRules.ts";
import { createWorkshop } from "./workshop.ts";

const VALUE_NEW = "new";

/** Creates the dropdown that chooses the LAN, with a last entry for a new one. */
function createLANSelect(lans: LANSummary[], place: Place, go: (place: Place) => void) {
  const select = createElement("select", "lan-select");
  select.setAttribute("aria-label", "LAN");
  for (const lan of lans) {
    const option = createElement("option", "", lan.name);
    option.value = String(lan.id);
    option.selected = lan.id === place.lanID;
    select.append(option);
  }
  const fresh = createElement("option", "", "+ Neue LAN anlegen");
  fresh.value = VALUE_NEW;
  fresh.selected = place.lanID === "new";
  select.append(fresh);
  select.addEventListener("change", () => {
    const lanID = select.value === VALUE_NEW ? "new" : Number(select.value);
    go({ lanID, section: place.section });
  });
  return select;
}

/** Creates the line with the LAN, its phase and its period. */
function createContextBar(lans: LANSummary[], place: Place, go: (place: Place) => void) {
  const lan = lans.find((candidate) => candidate.id === place.lanID);
  return createElement(
    "div",
    "context-bar",
    createLANSelect(lans, place, go),
    lan === undefined ? null : createPhaseChip(lan),
    lan === undefined
      ? null
      : createElement(
          "span",
          "hint time",
          `${formatDateTime(lan.starts_at)} bis ${formatDateTime(lan.ends_at)}`,
        ),
  );
}

/** Creates the navigation. Phones show it as a bar at the bottom with the short names. */
function createNav(place: Place, go: (place: Place) => void): HTMLElement {
  return createElement(
    "nav",
    "section-nav",
    ...listSections().map((entry) => {
      const button = createButton("", entry.section === "workshop" ? "quiet apart" : "quiet", () =>
        go({ lanID: place.lanID, section: entry.section }),
      );
      button.append(
        createElement("span", "long-name", entry.text),
        createElement("span", "short-name", entry.shortText),
      );
      button.setAttribute("aria-current", String(entry.section === place.section));
      return button;
    }),
  );
}

/** Warns on every section while the short test times still hold. */
function createTestBanner(lan: LANSummary, go: (place: Place) => void): HTMLElement | null {
  if (!areTestRulesActive(lan.rules)) {
    return null;
  }
  return createElement(
    "div",
    "banner",
    createElement("span", "", "Kurze Testzeiten sind aktiv."),
    createButton("In der Werkstatt ändern", "quiet", () =>
      go({ lanID: lan.id, section: "workshop" }),
    ),
  );
}

/** Creates the content of one section. */
function createSection(section: Section, context: SectionContext, search: string): HTMLElement {
  switch (section) {
    case "players":
      return createPlayersSection(context, search);
    case "actions":
      return createActionsSection(context.lan, context.onFailure);
    case "room":
      return createRoomTab(context);
    case "settings":
      return createSettingsSection(context);
    case "workshop":
      return createWorkshop(context);
    default:
      return createOverview(context);
  }
}

/** What the frame keeps between two renders. */
interface Frame {
  root: HTMLElement;
  lans: LANSummary[];
  onFailure: FailureHandler;
  search: string;
}

/** Shows the frame for the place in the address. */
function renderFrame(frame: Frame, refresh: (slug?: string) => void): void {
  const place = readPlace(location.hash, frame.lans, Date.now());
  // The same place loads anew, so that a click on the open section shows fresh data.
  const go = (target: Place, search = "") => {
    frame.search = search;
    const hash = writePlace(target);
    if (location.hash === hash) {
      renderFrame(frame, refresh);
    } else {
      location.hash = hash;
    }
  };
  const lan = frame.lans.find((candidate) => candidate.id === place.lanID);
  const search = frame.search;
  frame.search = "";
  if (lan === undefined) {
    frame.root.replaceChildren(
      createContextBar(frame.lans, place, go),
      createLANForm({
        onCreated: refresh,
        onFailure: frame.onFailure,
      }),
    );
    return;
  }
  const context: SectionContext = {
    lan,
    onFailure: frame.onFailure,
    onChanged: () => refresh(),
    onDeleted: () => {
      history.replaceState(null, "", location.pathname);
      refresh();
    },
    open: (section, query) => go({ lanID: lan.id, section }, query),
  };
  const banner = createTestBanner(lan, go);
  frame.root.replaceChildren(
    createContextBar(frame.lans, place, go),
    createNav(place, go),
    ...(banner === null ? [] : [banner]),
    createSection(place.section, context, search),
  );
}

/**
 * Creates the frame and opens the place of the address. Fails when nobody is logged in, so that
 * the caller shows the login.
 */
export async function createShell(onSessionEnded: () => void): Promise<HTMLElement> {
  const frame: Frame = {
    root: createElement("div", "shell"),
    lans: await listLANs(),
    onFailure: createFailureHandler(onSessionEnded),
    search: "",
  };
  // A new LAN passes its slug, so that the frame opens it.
  const refresh = (slug?: string) => {
    listLANs()
      .then((lans) => {
        frame.lans = lans;
        const created = lans.find((lan) => lan.slug === slug);
        if (created !== undefined) {
          history.replaceState(null, "", writePlace({ lanID: created.id, section: "overview" }));
        }
        renderFrame(frame, refresh);
      })
      .catch(() => location.reload());
  };
  window.addEventListener("hashchange", () => renderFrame(frame, refresh));
  renderFrame(frame, refresh);
  return frame.root;
}
