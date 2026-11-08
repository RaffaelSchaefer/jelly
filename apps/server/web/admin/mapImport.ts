/**
 * Imports a map file in two steps: first a preview of what changes, then the import itself.
 *
 * @module
 */

import { importMap, type MapReport } from "./apiRoom.ts";
import { createButton, createElement, createLabelled, createMessage } from "./dom.ts";
import type { Room } from "./roomTypes.ts";

const TEXT_NO_JSON = "Die Datei ist kein gültiges JSON.";

/** Lists IDs in a line, or says that there are none. */
function listIDs(ids: string[]): string {
  return ids.length === 0 ? "keine" : `${ids.length}: ${ids.join(", ")}`;
}

/** Describes what an import changes. Removed zones take their seats and codes with them. */
function describeReport(report: MapReport): HTMLElement {
  const lines: [text: string, isWarning: boolean][] = [
    [`Neue Zonen, ${listIDs(report.created)}`, false],
    [`Geänderte Zonen, ${listIDs(report.updated)}`, false],
    [
      `Entfernte Zonen, ${listIDs(report.removed)}. Ihre Zuweisungen und Sitzplatz-Codes gehen verloren.`,
      report.removed.length > 0,
    ],
    [`Unbekannte Modelle, ${listIDs(report.unknown_props)}`, report.unknown_props.length > 0],
    [
      `Jellies, die ihren Platz verlieren: ${report.unassigned_players}`,
      report.unassigned_players > 0,
    ],
  ];
  return createElement(
    "ul",
    "report",
    ...lines.map(([text, isWarning]) => createElement("li", isWarning ? "warning" : "", text)),
  );
}

/** Creates the panel. */
export function createMapImportPanel(room: Room): HTMLElement {
  const file = createElement("input", "");
  file.id = "map-file";
  file.type = "file";
  file.accept = ".json,application/json";
  const message = createMessage();
  const report = createElement("div", "");
  let pending: unknown = null;
  const confirm = createButton("Jetzt importieren", "", () => {
    importMap(room.lan.id, pending, false)
      .then(room.reload)
      .catch((error: unknown) => room.onFailure(error, message.showBad));
  });
  const cancel = createButton("Abbrechen", "quiet", () => {
    pending = null;
    file.value = "";
    report.replaceChildren();
    decision.hidden = true;
  });
  const decision = createElement("div", "actions", confirm, cancel);
  decision.hidden = true;
  file.addEventListener("change", () => {
    message.clear();
    void readPreview(file, room, message.showBad).then((preview) => {
      if (preview !== null) {
        pending = preview.roomMap;
        report.replaceChildren(describeReport(preview.report));
        decision.hidden = false;
      }
    });
  });
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Kartendatei"),
    createElement(
      "p",
      "hint",
      "Erst zeigt die Seite, was sich ändert, gespeichert wird erst nach „Jetzt importieren“. " +
        "Zonen aus der Datei werden an ihrer ID wiedererkannt und behalten Zuweisung und Codes.",
    ),
    createLabelled("map-file", "Datei wählen", file),
    message.root,
    report,
    decision,
  );
}

/** Reads the chosen file and asks the server what an import would change. */
async function readPreview(
  file: HTMLInputElement,
  room: Room,
  showBad: (text: string) => void,
): Promise<{ roomMap: unknown; report: MapReport } | null> {
  const chosen = file.files?.[0];
  if (chosen === undefined) {
    return null;
  }
  let roomMap: unknown;
  try {
    roomMap = JSON.parse(await chosen.text());
  } catch {
    showBad(TEXT_NO_JSON);
    return null;
  }
  try {
    return { roomMap, report: await importMap(room.lan.id, roomMap, true) };
  } catch (error) {
    room.onFailure(error, showBad);
    return null;
  }
}
