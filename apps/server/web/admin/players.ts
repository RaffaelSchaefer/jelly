/**
 * The players: a search, and a list in which every player opens to show what can be done.
 *
 * @module
 */

import { loadCosmetics } from "./apiEvents.ts";
import { listAchievements, searchPlayers, type PlayerSummary } from "./apiPeople.ts";
import { listAreas } from "./apiRoom.ts";
import { createElement, createField, createMessage, type Message } from "./dom.ts";
import type { SectionContext } from "./lanContext.ts";
import { createPlayerCard } from "./playerCard.ts";
import type { Catalogs } from "./playerTools.ts";

/** What the list keeps between two loads: which card is open and what happened last. */
interface ListState {
  openID: number | null;
  note: string;
}

/** Loads what the cards choose from. The catalogs stay, the zones change with every seat. */
function createCatalogLoader(lanID: number): () => Promise<Catalogs> {
  const fixed = Promise.all([listAchievements(), loadCosmetics()]);
  return async () => {
    const [[achievements, cosmetics], areas] = await Promise.all([fixed, listAreas(lanID)]);
    return { achievements, cosmetics, areas };
  };
}

/** Shows the players. A search with a single match opens it at once. */
function renderList(
  players: PlayerSummary[],
  catalogs: Catalogs,
  context: SectionContext,
  parts: { list: HTMLElement; message: Message; state: ListState; reload: () => void },
): void {
  const { list, message, state, reload } = parts;
  if (state.openID !== null && !players.some((player) => player.id === state.openID)) {
    // A deleted player is gone from the list, so its result shows above it.
    if (state.note !== "") {
      message.showGood(state.note);
    }
    state.openID = null;
  }
  list.replaceChildren(
    ...(players.length === 0
      ? [createElement("p", "hint", "Keine Spieler gefunden.")]
      : players.map((player) =>
          createPlayerCard(player, {
            lan: context.lan,
            catalogs,
            onFailure: context.onFailure,
            isOpen: player.id === state.openID,
            note: player.id === state.openID ? state.note : "",
            toggle: () => {
              state.openID = state.openID === player.id ? null : player.id;
              state.note = "";
              renderList(players, catalogs, context, parts);
            },
            run: (action, done, cardMessage) => {
              action
                .then(() => {
                  state.openID = player.id;
                  state.note = done;
                  reload();
                })
                .catch((error: unknown) => context.onFailure(error, cardMessage.showBad));
            },
          }),
        )),
  );
  state.note = "";
  // The opened card is new, so the focus goes back to its head instead of the top of the page.
  list.querySelector<HTMLElement>(".is-open .player-head")?.focus();
}

/** Creates the section. `search` comes from the overview and is often empty. */
export function createPlayersSection(context: SectionContext, search: string): HTMLElement {
  const field = createField({
    id: "player-search",
    label: "Name",
    hint: "Leer lassen zeigt die neuesten Konten. Eine Zeile anklicken zeigt alle Aktionen.",
  });
  field.input.value = search;
  const message = createMessage();
  const list = createElement("div", "player-list");
  const state: ListState = { openID: null, note: "" };
  const loadCatalogs = createCatalogLoader(context.lan.id);
  // Actions load the list of the last search, not what is half typed into the field.
  let query = search;
  let isFirstLoad = true;
  const reload = () => {
    Promise.all([searchPlayers(query), loadCatalogs()])
      .then(([players, catalogs]) => {
        if (isFirstLoad && search !== "" && players.length === 1) {
          state.openID = players[0]?.id ?? null;
        }
        isFirstLoad = false;
        renderList(players, catalogs, context, { list, message, state, reload });
      })
      .catch((error: unknown) => context.onFailure(error, message.showBad));
  };
  const form = createElement(
    "form",
    "inline-form",
    field.root,
    createElement("div", "actions", createElement("button", "", "Suchen")),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.clear();
    state.openID = null;
    query = field.input.value.trim();
    reload();
  });
  reload();
  return createElement(
    "section",
    "panel",
    createElement("h2", "", "Spieler"),
    form,
    message.root,
    list,
  );
}
