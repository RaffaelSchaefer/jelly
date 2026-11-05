/**
 * The form that replaces the code of a LAN.
 *
 * @module
 */

import { updateJoinCode, type LANSummary } from "./api.ts";
import { createElement, createField, createMessage } from "./dom.ts";
import type { FailureHandler } from "./rulesForm.ts";

const TEXT_CHANGED = "Der neue LAN-Code gilt ab sofort, der alte nicht mehr.";

/** Creates the panel. The server keeps only a hash, so the current code cannot be shown. */
export function createJoinCodeForm(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  const code = createField({
    id: "join-code",
    label: "Neuer LAN-Code",
    hint: "Der aktuelle Code lässt sich nicht anzeigen. Du kannst ihn nur ersetzen.",
  });
  code.input.required = true;
  code.input.autocomplete = "off";
  const message = createMessage();
  const submit = createElement("button", "", "LAN-Code ersetzen");
  const form = createElement(
    "form",
    "panel",
    createElement("h3", "", "LAN-Code"),
    code.root,
    message.root,
    createElement("div", "actions", submit),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit.disabled = true;
    updateJoinCode(lan.id, code.input.value.trim())
      .then(() => {
        code.input.value = "";
        message.showGood(TEXT_CHANGED);
      })
      .catch((error: unknown) => onFailure(error, message.showBad))
      .finally(() => {
        submit.disabled = false;
      });
  });
  return form;
}
