/**
 * Starts the admin page: login first, then the work area.
 *
 * @module
 */

import { AdminApiError, logOut } from "./api.ts";
import { createElement } from "./dom.ts";
import { createLoginView, type LoginReason } from "./login.ts";
import { createWorkArea } from "./workArea.ts";

const view = document.querySelector<HTMLElement>("#view");
const logoutButton = document.querySelector<HTMLButtonElement>("#logout");

/** Replaces what the page shows. */
function show(content: HTMLElement): void {
  view?.replaceChildren(content);
}

/** Shows the login form and hides what only works with a session. */
function showLogin(reason: LoginReason): void {
  if (logoutButton !== null) {
    logoutButton.hidden = true;
  }
  show(createLoginView(reason, () => void openWorkArea()));
}

/** Asks the server whether a session exists, because scripts cannot read its cookie. */
async function openWorkArea(): Promise<void> {
  try {
    const workArea = await createWorkArea(() => showLogin("session-ended"));
    if (logoutButton !== null) {
      logoutButton.hidden = false;
    }
    show(workArea);
  } catch (error) {
    handleFailure(error);
  }
}

/** Sends the user back to the login when the session is gone, and shows other problems. */
function handleFailure(error: unknown): void {
  if (error instanceof AdminApiError && error.isForbidden) {
    showLogin("first-visit");
    return;
  }
  const text = error instanceof AdminApiError ? error.message : String(error);
  show(createElement("p", "message message-bad", text));
}

logoutButton?.addEventListener("click", () => {
  void logOut().finally(() => showLogin("first-visit"));
});

void openWorkArea();
