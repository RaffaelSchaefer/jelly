/**
 * The form that corrects the name and period of a LAN.
 *
 * @module
 */

import { updateLAN, type LANSummary } from "./api.ts";
import { createElement, createField, createMessage } from "./dom.ts";
import { readLocalDateTime, toLocalDateTimeValue } from "./format.ts";
import type { LANActions } from "./lanContext.ts";

const TEXT_FILL_ALL = "Bitte gib Name, Beginn und Ende an.";
const TEXT_END_AFTER_START = "Das Ende muss nach dem Beginn liegen.";
const TEXT_CONFIRM_STOP =
  "Die LAN läuft gerade und wäre damit für alle vorbei. Speichere noch einmal, um das zu bestätigen.";

/** Says whether a LAN runs now but would not after the change. */
function stopsRunningLAN(lan: LANSummary, startsAt: number, endsAt: number, now: number): boolean {
  const isRunning = lan.starts_at <= now && now < lan.ends_at;
  return isRunning && !(startsAt <= now && now < endsAt);
}

/**
 * A typo in the period must not end a running LAN, so ending it takes a second save. Any new input
 * needs its own confirmation.
 */
function createStopGuard(form: HTMLFormElement, showBad: (text: string) => void) {
  let isConfirmed = false;
  form.addEventListener("input", () => {
    isConfirmed = false;
  });
  return (stops: boolean): boolean => {
    if (!stops || isConfirmed) return true;
    isConfirmed = true;
    showBad(TEXT_CONFIRM_STOP);
    return false;
  };
}

/** Creates the panel with the current values filled in. */
export function createLANEditForm(lan: LANSummary, actions: LANActions): HTMLElement {
  const name = createField({ id: "edit-name", label: "Name" });
  name.input.value = lan.name;
  const startsAt = createField({ id: "edit-starts", label: "Beginn", type: "datetime-local" });
  startsAt.input.value = toLocalDateTimeValue(lan.starts_at);
  const endsAt = createField({ id: "edit-ends", label: "Ende", type: "datetime-local" });
  endsAt.input.value = toLocalDateTimeValue(lan.ends_at);
  const message = createMessage();
  const save = createElement("button", "", "Speichern");
  const form = createElement(
    "form",
    "panel",
    createElement("h3", "", "Name und Zeitraum"),
    createElement(
      "div",
      "fields",
      name.root,
      createElement("div", "field-pair", startsAt.root, endsAt.root),
    ),
    createElement(
      "p",
      "hint",
      `Der Kurzname ${lan.slug} bleibt fest, die Zeitzone ist ${lan.timezone}.`,
    ),
    message.root,
    createElement("div", "actions", save),
  );
  const mayStop = createStopGuard(form, message.showBad);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const changes = {
      name: name.input.value.trim(),
      starts_at: readLocalDateTime(startsAt.input.value),
      ends_at: readLocalDateTime(endsAt.input.value),
    };
    if (changes.name === "" || Number.isNaN(changes.starts_at) || Number.isNaN(changes.ends_at)) {
      message.showBad(TEXT_FILL_ALL);
      return;
    }
    if (changes.starts_at >= changes.ends_at) {
      message.showBad(TEXT_END_AFTER_START);
      return;
    }
    const stops = stopsRunningLAN(lan, changes.starts_at, changes.ends_at, Date.now());
    if (!mayStop(stops)) {
      return;
    }
    save.disabled = true;
    updateLAN(lan.id, { ...changes, stop_running: stops })
      .then(actions.onChanged)
      .catch((error: unknown) => {
        save.disabled = false;
        actions.onFailure(error, message.showBad);
      });
  });
  return form;
}
