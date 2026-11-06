/**
 * The event codes of a LAN: list, create and end early.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { redeemWithBots } from "./apiBots.ts";
import { createEventCode, endEventCode, listEventCodes, type EventCode } from "./apiEvents.ts";
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
import { findLANPhase, formatDateTime, readLocalDateTime, toLocalDateTimeValue } from "./format.ts";

const DEFAULT_VALID_MILLIS = 2 * 60 * 60 * 1000;
const TEXT_FILL_ALL = "Bitte fülle alle Felder aus.";

/** Says whether a code works now, later or no more. */
function describeState(code: EventCode, now: number): string {
  const phase = findLANPhase({ starts_at: code.valid_from, ends_at: code.valid_until }, now);
  const names = { running: "gültig", upcoming: "kommt noch", past: "abgelaufen" };
  return names[phase];
}

/** Creates the buttons of a code that still works or will work. */
function createCodeActions(
  code: EventCode,
  message: Message,
  onFailure: FailureHandler,
  reload: () => void,
): HTMLElement {
  const end = createConfirmButton("Beenden", "Wirklich beenden?", () => {
    endEventCode(code.id)
      .then(reload)
      .catch((error: unknown) => onFailure(error, message.showBad));
  });
  const redeem = createButton("Bots lösen ein", "quiet", () => {
    redeemWithBots(code.lan_id, code.code)
      .then(([redeemed, all]) => {
        message.showGood(`${redeemed} von ${all} Bots haben „${code.code}“ eingelöst.`);
        reload();
      })
      .catch((error: unknown) => onFailure(error, message.showBad));
  });
  return createElement("div", "row-actions", redeem, end);
}

/** Creates the rows, with a button to end every code that still works or will work. */
function createRows(
  codes: EventCode[],
  message: Message,
  onFailure: FailureHandler,
  reload: () => void,
) {
  const now = Date.now();
  return codes.map((code) => [
    code.title,
    createElement("span", "code", code.code),
    String(code.xp),
    `${formatDateTime(code.valid_from)} bis ${formatDateTime(code.valid_until)}`,
    String(code.redeemed_count),
    describeState(code, now),
    code.valid_until <= now ? "" : createCodeActions(code, message, onFailure, reload),
  ]);
}

/** Creates the form for a new code, valid from now for two hours unless changed. */
function createCodeForm(lan: LANSummary, onFailure: FailureHandler, onCreated: () => void) {
  const title = createField({
    id: "code-title",
    label: "Titel",
    hint: "Zum Beispiel „Pizza ist da“.",
  });
  const code = createField({
    id: "code-value",
    label: "Code",
    hint: "Das tippen die Spieler ein.",
  });
  const xp = createField({ id: "code-xp", label: "XP", type: "number", hint: "Höchstens 10000." });
  const from = createField({ id: "code-from", label: "Gültig ab", type: "datetime-local" });
  const until = createField({ id: "code-until", label: "Gültig bis", type: "datetime-local" });
  xp.input.value = "10";
  from.input.value = toLocalDateTimeValue(Date.now());
  until.input.value = toLocalDateTimeValue(Date.now() + DEFAULT_VALID_MILLIS);
  const message = createMessage();
  const form = createElement(
    "form",
    "panel",
    createElement("h3", "", "Neuer Event-Code"),
    createElement("div", "field-pair", title.root, code.root, xp.root),
    createElement("div", "field-pair", from.root, until.root),
    message.root,
    createElement("div", "actions", createElement("button", "", "Code anlegen")),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = [title, code, xp, from, until];
    if (fields.some((field) => field.input.value.trim() === "")) {
      message.showBad(TEXT_FILL_ALL);
      return;
    }
    createEventCode({
      lan_id: lan.id,
      title: title.input.value.trim(),
      code: code.input.value.trim(),
      xp: Number(xp.input.value),
      valid_from: readLocalDateTime(from.input.value),
      valid_until: readLocalDateTime(until.input.value),
    })
      .then(onCreated)
      .catch((error: unknown) => onFailure(error, message.showBad));
  });
  return form;
}

/** Creates the tab. */
export function createEventCodesTab(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  const message = createMessage();
  const list = createElement("div", "");
  const reload = () => {
    listEventCodes(lan.id)
      .then((codes) => {
        list.replaceChildren(
          codes.length === 0
            ? createElement("p", "hint", "Noch keine Event-Codes.")
            : createTable(
                ["Titel", "Code", "XP", "Gültig", "Eingelöst", "Stand", ""],
                createRows(codes, message, onFailure, reload),
              ),
        );
      })
      .catch((error: unknown) => onFailure(error, message.showBad));
  };
  reload();
  return createElement(
    "div",
    "detail",
    createCodeForm(lan, onFailure, reload),
    createElement(
      "section",
      "panel",
      createElement("h3", "", "Event-Codes"),
      createElement(
        "p",
        "hint",
        "Beenden macht einen Code sofort ungültig, etwa wenn er an die Falschen geraten ist. " +
          "Vergebene XP bleiben.",
      ),
      message.root,
      list,
    ),
  );
}
