/**
 * The accounts: search, recovery codes and moderation.
 *
 * @module
 */

import {
  createRecoveryCode,
  deletePlayer,
  resetPlayerName,
  searchPlayers,
  setPlayerHidden,
  type PlayerSummary,
} from "./apiPeople.ts";
import {
  createButton,
  createConfirmButton,
  createElement,
  createField,
  createMessage,
  createTable,
  type Message,
} from "./dom.ts";
import type { FailureHandler } from "./failure.ts";
import { formatDateTime } from "./format.ts";

/** What the actions of one row need. */
interface RowContext {
  message: Message;
  onFailure: FailureHandler;
  reload: () => void;
}

/** Runs an action of a row and loads the list again afterwards. */
function runAction(context: RowContext, action: Promise<unknown>, done: string): void {
  action
    .then(() => {
      context.message.showGood(done);
      context.reload();
    })
    .catch((error: unknown) => context.onFailure(error, context.message.showBad));
}

/** Creates the buttons of one account. */
function createRowActions(player: PlayerSummary, context: RowContext): HTMLElement {
  const recover = createButton("Wiederherstellungs-Code", "quiet", () => {
    createRecoveryCode(player.id)
      .then((recovery) =>
        context.message.showGood(
          `Code für ${player.name}: ${recovery.code}, gültig bis ${formatDateTime(recovery.expires_at)}. ` +
            "Die Person gibt ihn in der App ein und bekommt ihr Konto zurück.",
        ),
      )
      .catch((error: unknown) => context.onFailure(error, context.message.showBad));
  });
  const visibility = createButton(player.hidden ? "Einblenden" : "Ausblenden", "quiet", () =>
    runAction(
      context,
      setPlayerHidden(player.id, !player.hidden),
      player.hidden ? `${player.name} ist wieder sichtbar.` : `${player.name} ist ausgeblendet.`,
    ),
  );
  const rename = createConfirmButton("Name zurücksetzen", "Wirklich zurücksetzen?", () =>
    runAction(
      context,
      resetPlayerName(player.id),
      `Der Name von ${player.name} ist zurückgesetzt.`,
    ),
  );
  const remove = createConfirmButton("Löschen", "Konto wirklich löschen?", () =>
    runAction(context, deletePlayer(player.id), `${player.name} ist gelöscht.`),
  );
  return createElement("div", "row-actions", recover, visibility, rename, remove);
}

/** Creates one row of the table. */
function createRow(player: PlayerSummary, context: RowContext) {
  return [
    String(player.id),
    createElement("strong", "", player.name),
    String(player.total_xp),
    String(player.lans),
    player.last_seen_at > 0 ? formatDateTime(player.last_seen_at) : "nie",
    player.hidden ? createElement("span", "chip", "ausgeblendet") : "",
    createRowActions(player, context),
  ];
}

/** Creates the section with the search and the list of accounts. */
export function createPlayersSection(onFailure: FailureHandler): HTMLElement {
  const search = createField({
    id: "player-search",
    label: "Name",
    hint: "Leer lassen zeigt die neuesten Konten.",
  });
  const message = createMessage();
  const list = createElement("div", "");
  const reload = () => {
    searchPlayers(search.input.value.trim())
      .then((players) => {
        const context = { message, onFailure, reload };
        list.replaceChildren(
          players.length === 0
            ? createElement("p", "hint", "Keine Konten gefunden.")
            : createTable(
                ["Nr.", "Name", "XP", "LANs", "Zuletzt aktiv", "", "Aktionen"],
                players.map((player) => createRow(player, context)),
              ),
        );
      })
      .catch((error: unknown) => onFailure(error, message.showBad));
  };
  const form = createElement(
    "form",
    "inline-form",
    search.root,
    createElement("div", "actions", createElement("button", "", "Suchen")),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.clear();
    reload();
  });
  reload();
  return createElement(
    "section",
    "panel",
    createElement("h2", "", "Konten"),
    form,
    message.root,
    list,
  );
}
