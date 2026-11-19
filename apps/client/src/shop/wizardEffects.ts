/**
 * Was die Effekte aus den Skripten des Zauberers im Fenster zeigen: Er hebt eine Ware auf der Rolle
 * hervor (`data-wizard-highlight` für 1,6 s, dazu ein Glanz), die Kugel blitzt, sein Hut funkelt,
 * und die Börse glänzt, wenn er Münzen zählt.
 *
 * Kaufzauber und Fehlschlag spielt das Siegel selbst (`useSealRitual.ts`) im Takt des Kaufs, hier
 * haben sie nichts zu tun. Den Kern der Kugel lässt der Spieler aufflammen.
 *
 * @module
 */

import type { FxTarget } from "./fx/sparksEngine";

import { type WizardEffect } from "../pet/wizardScripts";
import { shopFx } from "./fx/sparksEngine";

/** So lange leuchtet eine Ware, die er hervorhebt. */
export const HIGHLIGHT_MS = 1600;

/** Die Mitte eines Elements im Fenster, ohne Element `null`. */
function centreOf(element: Element | null): FxTarget | null {
  const rect = element?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
}

/** Hebt die Ware `itemId` auf der Rolle hervor und lässt sie glänzen. */
function highlight(itemId: string | undefined) {
  if (!itemId) return;
  const card = document.querySelector(`.ledger-list [data-item-id="${CSS.escape(itemId)}"]`);
  if (!card) return;
  card.setAttribute("data-wizard-highlight", "");
  window.setTimeout(() => card.removeAttribute("data-wizard-highlight"), HIGHLIGHT_MS);
  const at = centreOf(card);
  if (at) shopFx.play({ kind: "glint", at });
}

/** Wo ein Effekt glänzt, oder `null`, wenn er hier nichts zeigt. */
function glintAt(effect: WizardEffect): FxTarget | null {
  switch (effect) {
    case "orbGlint":
      return "orb";
    case "hatSparkle":
      return "wizardHat";
    case "purseClink":
      return centreOf(document.querySelector("[data-coin-source]"));
    default:
      return null;
  }
}

/** Zeigt einen Effekt des Zauberers. Passt zu `onEffect` in `useWizardPlayer`. */
export function showWizardEffect(effect: WizardEffect, itemId?: string) {
  if (effect === "highlightItem") return highlight(itemId);
  const at = glintAt(effect);
  if (at) shopFx.play({ kind: "glint", at });
}
