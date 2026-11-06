/**
 * The log of admin actions, newest first.
 *
 * @module
 */

import { listAdminActions, type AdminAction } from "./apiPeople.ts";
import { createButton, createElement, createMessage, createTable } from "./dom.ts";
import type { FailureHandler } from "./failure.ts";
import { formatDateTime } from "./format.ts";

/** Names every action the server logs, with what its target is. */
function listActionNames(): Record<string, [text: string, target: string]> {
  return {
    "player.hide": ["Jelly ausgeblendet", "Konto"],
    "player.show": ["Jelly eingeblendet", "Konto"],
    "player.reset_name": ["Name zurückgesetzt", "Konto"],
    "player.delete": ["Konto gelöscht", "Konto"],
    "player.recovery_code": ["Wiederherstellungs-Code erzeugt", "Konto"],
    "award.give": ["Preis vergeben", "Konto"],
    "lan.rules": ["Regeln geändert", "LAN"],
    "lan.join_code": ["LAN-Code ersetzt", "LAN"],
    "lan.map_import": ["Karte importiert", "LAN"],
    "lan.gathering": ["Essens-Event oder Siegerehrung", "LAN"],
    "lan.update": ["LAN bearbeitet", "LAN"],
    "lan.delete": ["LAN gelöscht", "LAN"],
    "event_code.create": ["Event-Code angelegt", "LAN"],
    "event_code.end": ["Event-Code beendet", "Event-Code"],
    "seat.code": ["Sitzplatz-Code erzeugt", "Zone"],
  };
}

/** Creates one row. An action the page does not know yet shows its technical name. */
function createRow(entry: AdminAction, names: ReturnType<typeof listActionNames>) {
  const [text, target] = names[entry.action] ?? [entry.action, "Ziel"];
  return [
    formatDateTime(entry.created_at),
    text,
    entry.target_id === null ? "" : `${target} Nr. ${entry.target_id}`,
  ];
}

/** Creates the section. */
export function createActionLogSection(onFailure: FailureHandler): HTMLElement {
  const message = createMessage();
  const list = createElement("div", "");
  const names = listActionNames();
  const reload = () => {
    listAdminActions()
      .then((entries) => {
        list.replaceChildren(
          entries.length === 0
            ? createElement("p", "hint", "Noch keine Admin-Aktionen.")
            : createTable(
                ["Zeit", "Aktion", "Ziel"],
                entries.map((entry) => createRow(entry, names)),
              ),
        );
      })
      .catch((error: unknown) => onFailure(error, message.showBad));
  };
  reload();
  return createElement(
    "section",
    "panel",
    createElement("h2", "", "Protokoll"),
    createElement("p", "hint", "Die letzten 200 Aktionen der Orga, die neuesten oben."),
    createElement("div", "actions", createButton("Neu laden", "quiet", reload)),
    message.root,
    list,
  );
}
