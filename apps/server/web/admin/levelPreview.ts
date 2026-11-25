/**
 * A table of the first levels for rules that are not saved yet. The server sums them up, so the page
 * shows exactly what the game will do.
 *
 * @module
 */

import { AdminApiError, previewLevels, type GameRules, type LevelStep } from "./api.ts";
import { createElement, createTable } from "./dom.ts";

/** Waits for a pause in typing, so the server gets one request instead of one per key. */
const TYPING_PAUSE_MS = 250;
const PREVIEW_HEADERS = ["Level", "XP für dieses Level", "XP insgesamt"];
const TEXT_TITLE = "Vorschau der ersten Level";

/** The preview and how to show new rules in it. */
export interface LevelPreview {
  root: HTMLElement;
  update(rules: GameRules): void;
}

/** Formats a number with the dots of German text: `1625` gives `1.625`. */
function formatXP(xp: number): string {
  return xp.toLocaleString("de-DE");
}

/** Turns the steps of the curve into the rows of the table. */
function listPreviewRows(steps: LevelStep[]): string[][] {
  return steps.map((step) => [String(step.level), formatXP(step.xp), formatXP(step.start_xp)]);
}

/** Creates an empty preview. It asks the server once the rules stop changing. */
export function createLevelPreview(): LevelPreview {
  const table = createElement("div", "level-preview-table");
  const note = createElement("p", "hint");
  const root = createElement(
    "div",
    "level-preview",
    createElement("h4", "", TEXT_TITLE),
    note,
    table,
  );
  let lastSent = "";
  let pause: ReturnType<typeof setTimeout> | undefined;
  // Only the newest request may fill the table, an older answer can arrive later.
  let newest = 0;
  const show = (rules: GameRules): void => {
    const request = ++newest;
    previewLevels(rules)
      .then(({ levels }) => {
        if (request === newest) {
          note.hidden = true;
          table.replaceChildren(createTable(PREVIEW_HEADERS, listPreviewRows(levels)));
        }
      })
      .catch((error: unknown) => {
        if (request === newest) {
          note.hidden = false;
          note.textContent = error instanceof AdminApiError ? error.message : String(error);
        }
      });
  };
  const update = (rules: GameRules): void => {
    const body = JSON.stringify(rules);
    if (body === lastSent) {
      return;
    }
    lastSent = body;
    clearTimeout(pause);
    pause = setTimeout(() => show(rules), TYPING_PAUSE_MS);
  };
  note.hidden = true;
  return { root, update };
}
