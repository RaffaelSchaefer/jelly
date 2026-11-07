/**
 * The room of a LAN: import the map file, set up zones and give out seat codes. Seats go to
 * players in the players section.
 *
 * @module
 */

import { listAreas, listSeatCodes } from "./apiRoom.ts";
import { createButton, createElement, createMessage } from "./dom.ts";
import type { SectionContext } from "./lanContext.ts";
import { createMapImportPanel } from "./mapImport.ts";
import { createZonePanel } from "./zoneTable.ts";

/** Points to where seats are given by hand. */
function createSeatsHint(context: SectionContext): HTMLElement {
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Plätze von Hand"),
    createElement(
      "p",
      "hint",
      "Einen Platz gibst du einer Person direkt in ihrer Zeile unter Spieler. Sie muss der LAN schon beigetreten sein.",
    ),
    createElement(
      "div",
      "actions",
      createButton("Zu den Spielern", "quiet", () => context.open("players")),
    ),
  );
}

/** Creates the tab and loads the zones. Every change loads them again. */
export function createRoomTab(context: SectionContext): HTMLElement {
  const { lan, onFailure } = context;
  const root = createElement("div", "detail");
  const message = createMessage();
  const reload = () => {
    Promise.all([listAreas(lan.id), listSeatCodes(lan.id)])
      .then(([areaList, seatCodes]) => {
        const room = { lan, areaList, seatCodes, onFailure, reload };
        root.replaceChildren(
          createMapImportPanel(room),
          createZonePanel(room),
          createSeatsHint(context),
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
