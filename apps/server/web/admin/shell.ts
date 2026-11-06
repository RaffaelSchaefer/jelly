/**
 * The frame after the login: a navigation between LANs, accounts and the log.
 *
 * @module
 */

import { createActionLogSection } from "./actionLog.ts";
import { createButton, createElement } from "./dom.ts";
import { createFailureHandler } from "./failure.ts";
import { createPlayersSection } from "./players.ts";
import { createWorkArea } from "./workArea.ts";

const HASH_PLAYERS = "#konten";
const HASH_LOG = "#protokoll";

/** The parts of the page. LANs is everything that is not one of the others. */
type Section = "lans" | "players" | "log";

/** Reads the section from the address, so that a reload stays where it was. */
function findSection(): Section {
  if (location.hash === HASH_PLAYERS) {
    return "players";
  }
  return location.hash === HASH_LOG ? "log" : "lans";
}

/** Names the sections in the order of the navigation. */
function listSections(): [section: Section, text: string, hash: string][] {
  return [
    ["lans", "LANs", ""],
    ["players", "Konten", HASH_PLAYERS],
    ["log", "Protokoll", HASH_LOG],
  ];
}

/**
 * Creates the frame and opens the section of the address. Fails when nobody is logged in, so that
 * the caller shows the login.
 */
export async function createShell(onSessionEnded: () => void): Promise<HTMLElement> {
  const onFailure = createFailureHandler(onSessionEnded);
  const nav = createElement("nav", "section-nav");
  const content = createElement("div", "");
  let shown: Section | null = null;

  const open = async (section: Section) => {
    shown = section;
    nav.replaceChildren(
      ...listSections().map(([target, text, hash]) => {
        const button = createButton(text, "quiet", () => {
          location.hash = hash;
        });
        button.setAttribute("aria-current", String(target === section));
        return button;
      }),
    );
    if (section === "players") {
      content.replaceChildren(createPlayersSection(onFailure));
    } else if (section === "log") {
      content.replaceChildren(createActionLogSection(onFailure));
    } else {
      content.replaceChildren(await createWorkArea(onSessionEnded));
    }
  };
  // The LAN area changes the address itself, so only a change of section opens anew.
  window.addEventListener("hashchange", () => {
    const section = findSection();
    if (section !== shown) {
      open(section).catch((error: unknown) =>
        onFailure(error, (text) =>
          content.replaceChildren(createElement("p", "message message-bad", text)),
        ),
      );
    }
  });
  await open(findSection());
  return createElement("div", "shell", nav, content);
}
