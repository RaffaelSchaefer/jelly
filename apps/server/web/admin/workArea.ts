/**
 * The work area: the list of LANs beside the LAN being edited.
 *
 * @module
 */

import { AdminApiError, listLANs, type LANSummary } from "./api.ts";
import { createButton, createElement } from "./dom.ts";
import { formatDateTime } from "./format.ts";
import { createLANDetail, createPhaseChip } from "./lanDetail.ts";
import { createLANForm } from "./lanForm.ts";

const HASH_NEW = "#neu";
const HASH_LAN_PREFIX = "#lan-";
const TEXT_NO_LANS = "Noch keine LAN angelegt. Lege rechts die erste an.";

/** What is open: the form for a new LAN, or a LAN with its ID. */
type Selection = "new" | number;

/** Reads the selection from the address, so that it survives a reload. */
function readSelection(lans: LANSummary[]): Selection {
  const lanID = Number(location.hash.slice(HASH_LAN_PREFIX.length));
  if (location.hash.startsWith(HASH_LAN_PREFIX) && lans.some((lan) => lan.id === lanID)) {
    return lanID;
  }
  if (location.hash === HASH_NEW) {
    return "new";
  }
  const first = findCurrentLAN(lans);
  return first === undefined ? "new" : first.id;
}

/** Prefers the running LAN, then the next one, then the last one. */
function findCurrentLAN(lans: LANSummary[]): LANSummary | undefined {
  const now = Date.now();
  const coming = lans
    .filter((lan) => now < lan.ends_at)
    .sort((left, right) => left.starts_at - right.starts_at);
  return coming[0] ?? lans.at(-1);
}

/** Creates the entry of one LAN in the list. */
function createLANEntry(lan: LANSummary, selection: Selection, open: (id: Selection) => void) {
  const entry = createButton("", "lan-entry", () => open(lan.id));
  entry.setAttribute("aria-current", String(lan.id === selection));
  entry.append(
    createElement("span", "lan-entry-head", lan.name, createPhaseChip(lan)),
    createElement("span", "hint time", formatDateTime(lan.starts_at)),
  );
  return createElement("li", "", entry);
}

/** Creates the panel with the list. */
function createLANList(lans: LANSummary[], selection: Selection, open: (id: Selection) => void) {
  return createElement(
    "nav",
    "panel",
    createElement("h2", "", "LANs"),
    lans.length === 0
      ? createElement("p", "hint", TEXT_NO_LANS)
      : createElement("ul", "lan-list", ...lans.map((lan) => createLANEntry(lan, selection, open))),
    createElement(
      "div",
      "actions",
      createButton("Neue LAN", "quiet", () => open("new")),
    ),
  );
}

/** Loads the LANs and creates the work area. Fails when nobody is logged in. */
export async function createWorkArea(onSessionEnded: () => void): Promise<HTMLElement> {
  const root = createElement("div", "work-area");
  let lans = await listLANs();

  const onFailure = (error: unknown, showMessage: (text: string) => void) => {
    if (error instanceof AdminApiError && error.isForbidden) {
      onSessionEnded();
      return;
    }
    showMessage(error instanceof AdminApiError ? error.message : String(error));
  };
  const render = () => {
    const selection = readSelection(lans);
    const selected = lans.find((lan) => lan.id === selection);
    root.replaceChildren(
      createLANList(lans, selection, open),
      selected === undefined
        ? createLANForm({
            // The LAN exists at this point, so a fresh start of the page shows it in any case.
            onCreated: (slug) => void reload(slug).catch(() => location.reload()),
            onFailure,
          })
        : createLANDetail(selected),
    );
  };
  const open = (target: Selection) => {
    location.hash = target === "new" ? HASH_NEW : `${HASH_LAN_PREFIX}${target}`;
    render();
  };
  const reload = async (slug: string) => {
    lans = await listLANs();
    const created = lans.find((lan) => lan.slug === slug);
    open(created === undefined ? "new" : created.id);
  };

  render();
  return root;
}
