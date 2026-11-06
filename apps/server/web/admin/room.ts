/**
 * The room of a LAN: import the map file, assign zones, give out seat codes and seats.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { listAreas, listSeatCodes } from "./apiRoom.ts";
import { createAssignForm } from "./assignForm.ts";
import { createElement, createMessage } from "./dom.ts";
import type { FailureHandler } from "./failure.ts";
import { createMapImportPanel } from "./mapImport.ts";
import { createZonePanel } from "./zoneTable.ts";

/** Creates the tab and loads the zones. Every change loads them again. */
export function createRoomTab(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  const root = createElement("div", "detail");
  const message = createMessage();
  const reload = () => {
    Promise.all([listAreas(lan.id), listSeatCodes(lan.id)])
      .then(([areaList, seatCodes]) => {
        const room = { lan, areaList, seatCodes, onFailure, reload };
        root.replaceChildren(
          createMapImportPanel(room),
          createZonePanel(room),
          createAssignForm(room),
        );
      })
      .catch((error: unknown) => {
        root.replaceChildren(message.root);
        onFailure(error, message.showBad);
      });
  };
  root.append(createElement("p", "hint", "Lade den Raum …"));
  reload();
  return root;
}
