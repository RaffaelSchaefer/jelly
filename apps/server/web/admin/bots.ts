/**
 * The bots of a LAN: create them, let them act by hand or by themselves, and remove them.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import {
  createBots,
  deleteBots,
  listBots,
  redeemWithBots,
  runBotAction,
  setAutoBots,
  type Bot,
  type BotList,
} from "./apiBots.ts";
import {
  createButton,
  createConfirmButton,
  createElement,
  createField,
  createMessage,
  createSelect,
  createTable,
  type Message,
} from "./dom.ts";
import type { FailureHandler } from "./failure.ts";

const GIFT_XP = 100;

/** What an admin can let a bot do, with a name for the dropdown. */
function listBotActions(): [kind: string, text: string][] {
  return [
    ["emote", "Emote"],
    ["sign", "Schild hochhalten"],
    ["poke", "Stupsen"],
    ["food", "Essen melden"],
    ["drink", "Trinken melden"],
    ["trip", "Ausflug"],
    ["follow", "Zu jemandem stellen"],
    ["stack", "Stapeln"],
    ["xp", `${GIFT_XP} XP schenken`],
  ];
}

/** What the panels of the tab share. */
interface BotTab {
  lan: LANSummary;
  onFailure: FailureHandler;
  reload: () => void;
}

/** Creates the action cell of one bot. */
function createActionCell(bot: Bot, tab: BotTab, message: Message): HTMLElement {
  const kind = createSelect(`bot-action-${bot.id}`, listBotActions());
  kind.setAttribute("aria-label", `Aktion für ${bot.name}`);
  const run = createButton("Los", "quiet", () => {
    runBotAction(bot.id, kind.value, GIFT_XP)
      .then(() => {
        message.showGood(`${bot.name}: erledigt.`);
        tab.reload();
      })
      .catch((error: unknown) =>
        tab.onFailure(error, (text) => message.showBad(`${bot.name}: ${text}`)),
      );
  });
  return createElement("div", "row-actions", kind, run);
}

/** Creates the panel that creates bots and lets some of them play by themselves. */
function createControlPanel(list: BotList, tab: BotTab): HTMLElement {
  const count = createField({
    id: "bot-count",
    label: "Neue Bots",
    type: "number",
    hint: "1 bis 100.",
  });
  count.input.value = "10";
  const auto = createField({
    id: "bot-auto",
    label: "Davon spielen selbst",
    type: "number",
    hint: "0 stoppt sie. Gilt für die laufende LAN, ein Neustart des Servers stoppt sie auch.",
  });
  auto.input.value = String(list.auto_count);
  const message = createMessage();
  const run = (action: Promise<unknown>) =>
    action.then(tab.reload).catch((error: unknown) => tab.onFailure(error, message.showBad));
  const remove = createConfirmButton("Alle Bots löschen", "Wirklich alle löschen?", () =>
    run(deleteBots()),
  );
  remove.classList.add("danger");
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Bots"),
    createElement(
      "p",
      "hint",
      "Bots heißen Bot-<Nummer>, zählen als normale Spieler und halten sich an alle Regeln. " +
        `Gerade spielen ${Math.min(list.auto_count, list.bots.length)} von ${list.bots.length} selbst.`,
    ),
    createElement("div", "field-pair", count.root, auto.root),
    message.root,
    createElement(
      "div",
      "actions",
      createButton("Bots anlegen", "", () =>
        run(createBots(tab.lan.id, Number(count.input.value))),
      ),
      createButton("Selbst spielen lassen", "quiet", () =>
        run(setAutoBots(Number(auto.input.value))),
      ),
      remove,
    ),
  );
}

/** Creates the table of the bots. */
function createListPanel(list: BotList, tab: BotTab): HTMLElement {
  const message = createMessage();
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Einzeln steuern"),
    message.root,
    list.bots.length === 0
      ? createElement("p", "hint", "Diese LAN hat noch keine Bots.")
      : createTable(
          ["Nr.", "Name", "XP", "Aktion"],
          list.bots.map((bot) => [
            String(bot.id),
            bot.name,
            String(bot.xp),
            createActionCell(bot, tab, message),
          ]),
        ),
  );
}

/** Creates the panel that lets every bot redeem an event code, to test a full house. */
function createRedeemPanel(tab: BotTab): HTMLElement {
  const code = createField({
    id: "bot-redeem-code",
    label: "Event-Code",
    hint: "Jeder Bot der LAN löst ihn einmal ein, wie ein Spieler.",
  });
  const message = createMessage();
  const redeem = createButton("Bots lösen ein", "quiet", () => {
    const value = code.input.value.trim();
    redeemWithBots(tab.lan.id, value)
      .then(([redeemed, all]) => {
        message.showGood(`${redeemed} von ${all} Bots haben „${value}“ eingelöst.`);
        tab.reload();
      })
      .catch((error: unknown) => tab.onFailure(error, message.showBad));
  });
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Event-Code einlösen lassen"),
    code.root,
    message.root,
    createElement("div", "actions", redeem),
  );
}

/** Creates the tab and loads the bots. */
export function createBotsTab(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  const control = createElement("div", "detail", createElement("p", "hint", "Lade die Bots …"));
  const table = createElement("div", "detail");
  const message = createMessage();
  const reload = () => {
    listBots(lan.id)
      .then((list) => {
        control.replaceChildren(createControlPanel(list, tab));
        table.replaceChildren(createListPanel(list, tab));
      })
      .catch((error: unknown) => {
        control.replaceChildren(message.root);
        onFailure(error, message.showBad);
      });
  };
  const tab: BotTab = { lan, onFailure, reload };
  reload();
  // The redeem panel stays while the lists load anew, so that its result remains visible.
  return createElement("div", "detail", control, createRedeemPanel(tab), table);
}
