/**
 * The login form.
 *
 * @module
 */

import { AdminApiError, logIn } from "./api.ts";
import { createElement, createField, createMessage } from "./dom.ts";

const TEXT_WRONG_SECRET = "Dieses Passwort stimmt nicht.";
const TEXT_SESSION_ENDED = "Du warst länger nicht aktiv. Bitte melde dich neu an.";

/** Says why the form appears. */
export type LoginReason = "first-visit" | "session-ended";

/** Creates the form and calls `onLoggedIn` after a successful login. */
export function createLoginView(reason: LoginReason, onLoggedIn: () => void): HTMLElement {
  const secret = createField({ id: "admin-secret", label: "Passwort", type: "password" });
  secret.input.autocomplete = "current-password";
  secret.input.required = true;
  const message = createMessage();
  if (reason === "session-ended") {
    message.showBad(TEXT_SESSION_ENDED);
  }
  const submit = createElement("button", "", "Anmelden");
  const form = createElement(
    "form",
    "panel login",
    createElement("h2", "", "Anmelden"),
    secret.root,
    message.root,
    createElement("div", "actions", submit),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit.disabled = true;
    logIn(secret.input.value)
      .then(onLoggedIn)
      .catch((error: unknown) => {
        message.showBad(describeLoginError(error));
        submit.disabled = false;
        secret.input.select();
      });
  });
  return form;
}

/** A refused login is about the password, every other problem has its own text. */
function describeLoginError(error: unknown): string {
  if (error instanceof AdminApiError) {
    return error.isForbidden ? TEXT_WRONG_SECRET : error.message;
  }
  return String(error);
}
