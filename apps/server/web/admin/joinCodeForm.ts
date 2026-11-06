/**
 * The form that replaces the code of a LAN.
 *
 * @module
 */

import { updateJoinCode, type LANSummary } from "./api.ts";
import { createElement, createField, createMessage } from "./dom.ts";
import type { LANActions } from "./lanDetail.ts";

/** Creates the panel. The new code appears at the top of the LAN after saving. */
export function createJoinCodeForm(lan: LANSummary, actions: LANActions): HTMLElement {
  const code = createField({
    id: "join-code",
    label: "Neuer LAN-Code",
    hint: "Der alte Code gilt danach nicht mehr. Wer schon teilnimmt, bleibt dabei.",
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
      .then(actions.onChanged)
      .catch((error: unknown) => {
        submit.disabled = false;
        actions.onFailure(error, message.showBad);
      });
  });
  return form;
}
