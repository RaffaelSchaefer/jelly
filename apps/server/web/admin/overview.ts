/**
 * The start page: what the organizers need at once during a LAN, with links to where it lives.
 *
 * @module
 */

import { createRecentActions } from "./actionLog.ts";
import { createButton, createElement, createField, createMessage, type Child } from "./dom.ts";
import { createRunningCodes } from "./eventCodes.ts";
import type { SectionContext } from "./lanContext.ts";
import { createGatheringSummary } from "./schedule.ts";

const RECENT_ACTIONS = 5;

/** Creates a card with a title, its content and a link to the section it belongs to. */
function createCard(title: string, link: HTMLElement | null, ...content: Child[]) {
  return createElement(
    "section",
    "panel card",
    createElement("div", "card-head", createElement("h3", "", title), link),
    ...content,
  );
}

/** Shows the code players join with, large enough to read it out. */
function createJoinCodeCard(context: SectionContext): HTMLElement {
  const code = context.lan.join_code;
  const message = createMessage();
  const copy = createButton("Kopieren", "quiet", () => {
    navigator.clipboard
      .writeText(code ?? "")
      .then(() => message.showGood("Kopiert."))
      .catch(() => message.showBad("Kopieren geht hier nicht. Bitte abschreiben."));
  });
  return createCard(
    "LAN-Code",
    createButton("Ändern", "quiet", () => context.open("settings")),
    code === null
      ? createElement(
          "p",
          "hint",
          "Unbekannt, weil er nur verschlüsselt gespeichert wurde. Ersetze ihn, um ihn hier zu sehen.",
        )
      : createElement("p", "join-code", code),
    code === null ? null : createElement("div", "actions", copy),
    message.root,
  );
}

/** Finds a player and opens the players section with the search. */
function createSearchCard(context: SectionContext): HTMLElement {
  const search = createField({
    id: "overview-search",
    label: "Name",
    hint: "Für Wiederherstellungs-Code, Platz, XP oder Moderation.",
  });
  const form = createElement(
    "form",
    "inline-form",
    search.root,
    createElement("div", "actions", createElement("button", "", "Suchen")),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    context.open("players", search.input.value.trim());
  });
  return createCard("Spieler suchen", null, form);
}

/** Creates the start page. */
export function createOverview(context: SectionContext): HTMLElement {
  const { lan, onFailure, open } = context;
  return createElement(
    "div",
    "overview",
    createJoinCodeCard(context),
    createSearchCard(context),
    createCard(
      "Essens-Event und Siegerehrung",
      createButton("Starten", "quiet", () => open("actions")),
      createGatheringSummary(lan, onFailure),
    ),
    createCard(
      "Laufende Event-Codes",
      createButton("Neuer Event-Code", "quiet", () => open("actions")),
      createRunningCodes(lan, onFailure),
    ),
    createCard(
      "Letzte Aktionen",
      createButton("Ganzes Protokoll", "quiet", () => open("workshop")),
      createRecentActions(onFailure, RECENT_ACTIONS),
    ),
  );
}
