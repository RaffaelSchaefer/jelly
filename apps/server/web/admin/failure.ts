/**
 * What happens when a request fails: back to the login when the session is gone, otherwise the
 * text of the server next to the action that failed.
 *
 * @module
 */

import { AdminApiError } from "./api.ts";

/** Reports a failed request. `showMessage` puts the text next to the action that failed. */
export type FailureHandler = (error: unknown, showMessage: (text: string) => void) => void;

/** Creates the handler that every part of the page shares. */
export function createFailureHandler(onSessionEnded: () => void): FailureHandler {
  return (error, showMessage) => {
    if (error instanceof AdminApiError && error.isForbidden) {
      onSessionEnded();
      return;
    }
    showMessage(error instanceof AdminApiError ? error.message : String(error));
  };
}
