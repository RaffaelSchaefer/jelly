/**
 * Shortcuts for trying things out: short times, and back to the defaults.
 *
 * @module
 */

import { patchRules, replaceRules, type GameRules, type LANSummary } from "./api.ts";
import { createButton, createConfirmButton, createElement, createMessage } from "./dom.ts";
import type { LANActions } from "./lanContext.ts";

/** Times short enough to watch a whole trip, follow or stack while testing. */
function listTestRules(): GameRules {
  return {
    poke_interval: 60,
    trip_seconds: 30,
    follow_seconds: 60,
    stack_seconds: 30,
    snack_run_seconds: 15,
    highlight_seconds: 5,
    highlight_cooldown: 0,
    emote_cooldown: 0,
    partner_invite_seconds: 30,
  };
}

/** Says whether every short test time still holds, so that the page can warn about it. */
export function areTestRulesActive(rules: GameRules): boolean {
  return Object.entries(listTestRules()).every(([key, value]) => rules[key] === value);
}

/** Creates the panel. Both buttons save at once, the rules form shows the result afterwards. */
export function createTestRulesPanel(lan: LANSummary, actions: LANActions): HTMLElement {
  const message = createMessage();
  const shorten = createButton("Kurze Testzeiten", "quiet", () => {
    patchRules(lan.id, listTestRules())
      .then(actions.onChanged)
      .catch((error: unknown) => actions.onFailure(error, message.showBad));
  });
  const reset = createConfirmButton(
    "Auf Standard zurücksetzen",
    "Alle Regeln zurücksetzen?",
    () => {
      // An empty body gives every rule its default value.
      replaceRules(lan.id, {})
        .then(actions.onChanged)
        .catch((error: unknown) => actions.onFailure(error, message.showBad));
    },
  );
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Testen"),
    createElement(
      "p",
      "hint",
      "Kurze Testzeiten verkürzen Ausflug, Folgen, Stapel, Theke und Hervorheben auf Sekunden und " +
        "schalten Abklingzeiten ab. Zurücksetzen stellt alle Regeln auf die Standardwerte, auch " +
        "eigene Einstellungen.",
    ),
    message.root,
    createElement("div", "actions", shorten, reset),
  );
}
