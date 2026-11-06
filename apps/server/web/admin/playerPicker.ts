/**
 * Finds an account by name and keeps the one that was chosen. Several forms need a player, and
 * nobody knows the numbers of the accounts by heart.
 *
 * @module
 */

import { searchPlayers, type PlayerSummary } from "./apiPeople.ts";
import { createButton, createElement, createField } from "./dom.ts";
import type { FailureHandler } from "./failure.ts";

const MAX_RESULTS = 8;
const TEXT_NONE = "Noch niemand gewählt.";
const TEXT_NO_MATCH = "Niemand mit diesem Namen gefunden.";

/** A search with the chosen account. */
export interface PlayerPicker {
  root: HTMLElement;
  selected(): PlayerSummary | null;
  clear(): void;
}

/** Creates the search. `id` must be unique on the page. */
export function createPlayerPicker(
  id: string,
  label: string,
  onFailure: FailureHandler,
): PlayerPicker {
  const search = createField({ id, label, hint: TEXT_NONE });
  search.hint.hidden = false;
  const results = createElement("div", "picker-results");
  let chosen: PlayerSummary | null = null;
  const choose = (player: PlayerSummary | null) => {
    chosen = player;
    search.hint.textContent =
      player === null ? TEXT_NONE : `Gewählt: ${player.name} (Nr. ${player.id})`;
    results.replaceChildren();
  };
  const run = () => {
    searchPlayers(search.input.value.trim())
      .then((players) => {
        const shown = players.slice(0, MAX_RESULTS);
        results.replaceChildren(
          ...(shown.length === 0
            ? [createElement("p", "hint", TEXT_NO_MATCH)]
            : shown.map((player) =>
                createButton(`${player.name} (Nr. ${player.id})`, "quiet", () => choose(player)),
              )),
        );
      })
      .catch((error: unknown) => onFailure(error, (text) => (search.hint.textContent = text)));
  };
  // Enter searches instead of sending the form around the picker.
  search.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });
  const root = createElement(
    "div",
    "picker",
    search.root,
    createElement("div", "actions", createButton("Suchen", "quiet", run)),
    results,
  );
  return { root, selected: () => chosen, clear: () => choose(null) };
}
