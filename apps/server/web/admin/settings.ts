/**
 * The settings of a LAN: name and period, the code, the rules, and deleting it apart at the end.
 *
 * @module
 */

import { deleteLAN, resetLANAccounts, type LANSummary } from "./api.ts";
import { createConfirmButton, createElement, createMessage } from "./dom.ts";
import { createJoinCodeForm } from "./joinCodeForm.ts";
import type { LANActions, SectionContext } from "./lanContext.ts";
import { createLANEditForm } from "./lanEditForm.ts";
import { createRulesForm } from "./rulesForm.ts";

/** Creates the part that deletes the LAN, apart from everything harmless. */
export function createDangerZone(lan: LANSummary, actions: LANActions): HTMLElement {
  const message = createMessage();
  const remove = createConfirmButton("LAN löschen", `„${lan.name}“ wirklich löschen?`, () => {
    deleteLAN(lan.id)
      .then(actions.onDeleted)
      .catch((error: unknown) => actions.onFailure(error, message.showBad));
  });
  remove.classList.add("danger");
  return createElement(
    "section",
    "panel danger-zone",
    createElement("h3", "", "Gefahrenbereich"),
    createElement(
      "p",
      "hint",
      "Löschen geht nur, solange niemand an der LAN teilnimmt, und lässt sich nicht rückgängig machen.",
    ),
    message.root,
    createElement("div", "actions", remove),
  );
}

/** Creates the section that sends all accounts of the LAN back to level one. */
export function createResetSection(lan: LANSummary, actions: LANActions): HTMLElement {
  const message = createMessage();
  const reset = createConfirmButton(
    "Alle Accounts zurücksetzen",
    `Wirklich alle Accounts in „${lan.name}“ zurücksetzen?`,
    () => {
      resetLANAccounts(lan.id)
        .then(() => message.showGood("Alle Accounts dieser LAN fangen wieder bei null an."))
        .catch((error: unknown) => actions.onFailure(error, message.showBad));
    },
  );
  reset.classList.add("danger");
  return createElement(
    "section",
    "panel danger-zone",
    createElement("h3", "", "Accounts zurücksetzen"),
    createElement(
      "p",
      "hint",
      "Achtung: Setzt XP, Level, Münzen, Käufe dieser LAN, Erfolge dieser LAN und getragene Cosmetics " +
        "aller Spieler zurück. Das lässt sich nicht rückgängig machen. Konten, Namen und Plätze bleiben.",
    ),
    message.root,
    createElement("div", "actions", reset),
  );
}

/** Creates the section. */
export function createSettingsSection(context: SectionContext): HTMLElement {
  return createElement(
    "div",
    "detail",
    createJoinCodeForm(context.lan, context),
    createLANEditForm(context.lan, context),
    createRulesForm(context.lan, context.onFailure),
    createResetSection(context.lan, context),
    createDangerZone(context.lan, context),
  );
}
