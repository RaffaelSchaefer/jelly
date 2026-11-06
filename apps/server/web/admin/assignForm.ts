/**
 * Puts a player in a zone by hand, or takes the player out.
 *
 * @module
 */

import { assignArea } from "./apiRoom.ts";
import { createButton, createElement, createLabelled, createMessage, createSelect } from "./dom.ts";
import { createPlayerPicker } from "./playerPicker.ts";
import type { Room } from "./roomTypes.ts";
import { isStandingKind, nameZone } from "./zoneKinds.ts";

const TEXT_CHOOSE_PLAYER = "Bitte wähle zuerst eine Person.";

/** Creates the panel. */
export function createAssignForm(room: Room): HTMLElement {
  const picker = createPlayerPicker("assign-player", "Person", room.onFailure);
  const zones = room.areaList.areas.filter((area) => isStandingKind(area.kind));
  const zone = createSelect(
    "assign-zone",
    zones.map((area) => [String(area.id), nameZone(area)]),
  );
  const message = createMessage();
  const send = (areaID: number | null) => {
    const player = picker.selected();
    if (player === null) {
      message.showBad(TEXT_CHOOSE_PLAYER);
      return;
    }
    assignArea(room.lan.id, player.id, areaID)
      .then(room.reload)
      .catch((error: unknown) => room.onFailure(error, message.showBad));
  };
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Platz von Hand vergeben"),
    createElement(
      "p",
      "hint",
      "Nur für Personen, die der LAN schon beigetreten sind. Zur Wahl stehen Sitzplätze, Bühne, " +
        "Lounge und Besucher, denn nur dort gehören Jellies fest hin.",
    ),
    picker.root,
    zones.length === 0
      ? createElement("p", "hint", "Diese LAN hat noch keine solche Zone.")
      : createLabelled("assign-zone", "Zone", zone),
    message.root,
    createElement(
      "div",
      "actions",
      createButton("Zuweisen", "", () => send(Number(zone.value))),
      createButton("Platz entfernen", "quiet", () => send(null)),
    ),
  );
}
