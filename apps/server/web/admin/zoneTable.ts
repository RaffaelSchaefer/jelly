/**
 * The zones of a LAN with what they are used for, who stands there and their seat codes.
 *
 * @module
 */

import { issueSeatCode, updateArea, type AdminArea, type SeatCode } from "./apiRoom.ts";
import {
  createButton,
  createElement,
  createMessage,
  createSelect,
  createTable,
  type Message,
} from "./dom.ts";
import type { Room } from "./roomTypes.ts";
import { listZoneKinds, nameZone } from "./zoneKinds.ts";

/** Says what became of a seat code. */
function describeSeatCode(seatCode: SeatCode | undefined): string {
  if (seatCode === undefined) {
    return "";
  }
  const name = seatCode.name ?? "jemand";
  if (seatCode.used_at === null) {
    return seatCode.player_id === null ? "noch frei" : `nur für ${name}`;
  }
  return seatCode.is_seated ? `eingelöst von ${name}` : `eingelöst, ${name} sitzt woanders`;
}

/** Creates the dropdown that changes what a zone is used for. */
function createKindSelect(area: AdminArea, room: Room, message: Message): HTMLSelectElement {
  const select = createSelect(`zone-kind-${area.id}`, listZoneKinds(), area.kind);
  select.setAttribute("aria-label", `Art von ${nameZone(area)}`);
  select.addEventListener("change", () => {
    updateArea(room.lan.id, { ...area, kind: select.value })
      .then(room.reload)
      .catch((error: unknown) => room.onFailure(error, message.showBad));
  });
  return select;
}

/** Creates the cell with the seat code of a seat zone. */
function createCodeCell(area: AdminArea, room: Room, message: Message): HTMLElement {
  if (area.kind !== "seats") {
    return createElement("span", "hint", "–");
  }
  const seatCode = room.seatCodes.find((code) => code.area_id === area.id);
  const issue = createButton(
    seatCode === undefined ? "Code erzeugen" : "Neuer Code",
    "quiet",
    () => {
      issueSeatCode(room.lan.id, area.id)
        .then(room.reload)
        .catch((error: unknown) => room.onFailure(error, message.showBad));
    },
  );
  return createElement(
    "div",
    "code-cell",
    seatCode === undefined ? null : createElement("span", "code", seatCode.code),
    seatCode === undefined ? null : createElement("span", "hint", describeSeatCode(seatCode)),
    issue,
  );
}

/** Creates the rows of the shown zones. */
function createRows(areas: AdminArea[], room: Room, message: Message) {
  return areas.map((area) => {
    const names = room.areaList.assignments
      .filter((assignment) => assignment.area_id === area.id)
      .map((assignment) => assignment.name);
    return [
      createElement("strong", "", nameZone(area)),
      createKindSelect(area, room, message),
      area.prop === "" ? "–" : area.prop,
      names.length === 0 ? "–" : names.join(", "),
      createCodeCell(area, room, message),
    ];
  });
}

/** Creates the panel. Obstacles without a kind stay hidden at first. */
export function createZonePanel(room: Room): HTMLElement {
  const message = createMessage();
  const showAll = createElement("input", "");
  showAll.type = "checkbox";
  showAll.id = "zones-show-all";
  const table = createElement("div", "");
  const render = () => {
    // Obstacles like desks are many and rarely get a kind. A new zone from a map file has no kind
    // yet either, but it must stay visible so that it can get one.
    const areas = room.areaList.areas.filter(
      (area) => showAll.checked || area.kind !== "none" || !area.blocks,
    );
    table.replaceChildren(
      areas.length === 0
        ? createElement(
            "p",
            "hint",
            "Keine Zonen. Importiere eine Kartendatei oder zeige auch Hindernisse.",
          )
        : createTable(
            ["Zone", "Art", "Modell", "Jellies", "Sitzplatz-Code"],
            createRows(areas, room, message),
          ),
    );
  };
  showAll.addEventListener("change", render);
  render();
  return createElement(
    "section",
    "panel",
    createElement("h3", "", `Zonen (${room.areaList.areas.length})`),
    createElement(
      "p",
      "hint",
      "Die Art legt fest, wer dort steht. Sitzplatz-Codes bringen eine Person beim ersten Beitritt " +
        "direkt an ihren Platz, ein neuer Code ersetzt den alten.",
    ),
    createElement("label", "checkbox", showAll, "Auch Hindernisse wie Tische zeigen"),
    message.root,
    table,
  );
}
