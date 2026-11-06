/**
 * The accounts: search, recovery codes and moderation.
 *
 * @module
 */

import {
  createRecoveryCode,
  deletePlayer,
  giveXP,
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

/** XP a gift starts with, and the most the server allows at once. */
const DEFAULT_GIFT_XP = 100;
const MAX_GIFT_XP = 10000;

/** Creates the small form that gives an account XP in its current LAN. */
function createXPForm(player: PlayerSummary, context: RowContext): HTMLElement {
  const amount = createElement("input", "xp-amount");
  Object.assign(amount, { type: "number", min: "1", max: String(MAX_GIFT_XP) });
  amount.value = String(DEFAULT_GIFT_XP);
  amount.setAttribute("aria-label", `XP für ${player.name}`);
  const form = createElement(
    "form",
    "xp-form",
    amount,
    createElement("button", "quiet", "XP geben"),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const xp = Number(amount.value);
    runAction(context, giveXP(player.id, xp), `${player.name} bekommt ${xp} XP.`);
  });
  return form;
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
  return createElement(
    "div",
    "row-actions",
    createXPForm(player, context),
    recover,
    visibility,
    rename,
    remove,
  );
}

/** Creates one row of the table. */
function createRow(player: PlayerSummary, context: RowContext) {
  return [
    String(player.id),
    createElement(
      "span",
      "",
      createElement("strong", "", player.name),
      player.is_bot ? createElement("span", "chip", "Bot") : null,
    ),
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
