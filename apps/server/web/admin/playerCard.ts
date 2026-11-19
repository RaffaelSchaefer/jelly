/**
 * One player in the list: a line to open, and inside every action that concerns this player.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import {
  createRecoveryCode,
  deletePlayer,
  resetPlayerName,
  setPlayerHidden,
  type PlayerSummary,
} from "./apiPeople.ts";
import { assignArea } from "./apiRoom.ts";
import {
  createButton,
  createConfirmButton,
  createElement,
  createLabelled,
  createMessage,
  createSelect,
  type Message,
} from "./dom.ts";
import type { FailureHandler } from "./failure.ts";
import { formatDateTime } from "./format.ts";
import { createRewardGroup } from "./playerRewards.ts";
import { createShopGroup } from "./playerShop.ts";
import { createToolGroup, makeToolID, type Catalogs, type PlayerTools } from "./playerTools.ts";
import { isStandingKind, nameZone } from "./zoneKinds.ts";

/** What the list tells a card. */
export interface CardView {
  lan: LANSummary;
  catalogs: Catalogs;
  onFailure: FailureHandler;
  isOpen: boolean;
  /** The result of the last action, shown in the opened card. */
  note: string;
  toggle(): void;
  run(action: Promise<unknown>, done: string, message: Message): void;
}

/** Names the zone a player of the chosen LAN stands in, or null outside of it. */
function findSeat(player: PlayerSummary, catalogs: Catalogs): string | null {
  const assignment = catalogs.areas.assignments.find((entry) => entry.player_id === player.id);
  if (assignment === undefined) {
    return null;
  }
  const area = catalogs.areas.areas.find((entry) => entry.id === assignment.area_id);
  return area === undefined ? "ohne Platz" : nameZone(area);
}

/** Creates the line that opens the card. */
function createHead(player: PlayerSummary, view: CardView): HTMLElement {
  const seat = findSeat(player, view.catalogs);
  const facts = [
    `${player.total_xp} XP`,
    `${player.coins} Münzen`,
    player.last_seen_at > 0 ? `zuletzt ${formatDateTime(player.last_seen_at)}` : "nie aktiv",
    seat === null ? "nicht in dieser LAN" : `Platz: ${seat}`,
  ];
  const head = createButton("", "player-head", view.toggle);
  head.setAttribute("aria-expanded", String(view.isOpen));
  head.append(
    createElement(
      "span",
      "player-name",
      createElement("strong", "", player.name),
      player.is_bot ? createElement("span", "chip", "Bot") : null,
      player.hidden ? createElement("span", "chip", "ausgeblendet") : null,
    ),
    createElement("span", "hint", facts.join(" · ")),
  );
  return head;
}

/** Creates the group that puts the player in a zone of the chosen LAN. */
function createSeatGroup(tools: PlayerTools): HTMLElement {
  const { player, lan, catalogs } = tools;
  const isInLAN = catalogs.areas.assignments.some((entry) => entry.player_id === player.id);
  const zones = catalogs.areas.areas.filter((area) => isStandingKind(area.kind));
  if (!isInLAN || zones.length === 0) {
    const reason = isInLAN
      ? "Diese LAN hat noch keine Sitzplätze, Bühne, Lounge oder Besucher-Zone."
      : `${player.name} ist ${lan.name} noch nicht beigetreten.`;
    return createToolGroup("Platz", "", createElement("p", "hint", reason));
  }
  const id = makeToolID(tools, "seat");
  const zone = createSelect(
    id,
    zones.map((area) => [String(area.id), nameZone(area)]),
  );
  const send = (areaID: number | null, done: string) =>
    tools.run(assignArea(lan.id, player.id, areaID), done);
  return createToolGroup(
    "Platz",
    "",
    createElement(
      "div",
      "tool-line",
      createLabelled(id, "Zone", zone),
      createButton("Zuweisen", "quiet", () =>
        send(Number(zone.value), `${player.name} steht jetzt in ${zone.selectedOptions[0]?.text}.`),
      ),
      createButton("Platz entfernen", "quiet", () =>
        send(null, `${player.name} hat keinen festen Platz mehr.`),
      ),
    ),
  );
}

/** Creates the group with recovery, visibility and name. */
function createAccountGroup(tools: PlayerTools): HTMLElement {
  const { player } = tools;
  const recover = createButton("Wiederherstellungs-Code", "quiet", () => {
    createRecoveryCode(player.id)
      .then((recovery) =>
        tools.message.showLasting(
          `Code für ${player.name}: ${recovery.code}, gültig bis ${formatDateTime(recovery.expires_at)}. ` +
            "Die Person gibt ihn in der App ein und bekommt ihr Konto zurück.",
        ),
      )
      .catch((error: unknown) => tools.onFailure(error, tools.message.showBad));
  });
  const visibility = createButton(player.hidden ? "Einblenden" : "Ausblenden", "quiet", () =>
    tools.run(
      setPlayerHidden(player.id, !player.hidden),
      player.hidden ? `${player.name} ist wieder sichtbar.` : `${player.name} ist ausgeblendet.`,
    ),
  );
  const rename = createConfirmButton("Name zurücksetzen", "Wirklich zurücksetzen?", () =>
    tools.run(resetPlayerName(player.id), `Der Name von ${player.name} ist zurückgesetzt.`),
  );
  return createToolGroup(
    "Konto",
    "",
    createElement("div", "actions", recover, visibility, rename),
    createElement("p", "hint", "Ausblenden nimmt das Jelly von Bühne und Karte, das Konto bleibt."),
  );
}

/** Creates the group that deletes the account, apart from everything harmless. */
function createDeleteGroup(tools: PlayerTools): HTMLElement {
  const { player } = tools;
  const remove = createConfirmButton("Konto löschen", `${player.name} wirklich löschen?`, () =>
    tools.run(deletePlayer(player.id), `${player.name} ist gelöscht.`),
  );
  remove.classList.add("danger");
  return createToolGroup(
    "Löschen",
    "danger-zone",
    createElement(
      "p",
      "hint",
      "Alle XP und Freischaltungen gehen verloren. Ausblenden reicht meist.",
    ),
    createElement("div", "actions", remove),
  );
}

/** Creates the card. Only an opened card builds its actions. */
export function createPlayerCard(player: PlayerSummary, view: CardView): HTMLElement {
  const card = createElement("article", "player-card", createHead(player, view));
  if (!view.isOpen) {
    return card;
  }
  const message = createMessage();
  if (view.note !== "") {
    message.showGood(view.note);
  }
  const tools: PlayerTools = {
    player,
    lan: view.lan,
    catalogs: view.catalogs,
    message,
    onFailure: view.onFailure,
    run: (action, done) => view.run(action, done, message),
  };
  card.classList.add("is-open");
  card.append(
    createElement(
      "div",
      "player-tools",
      message.root,
      createRewardGroup(tools),
      createShopGroup(tools),
      createSeatGroup(tools),
      createAccountGroup(tools),
      createDeleteGroup(tools),
    ),
  );
  return card;
}
