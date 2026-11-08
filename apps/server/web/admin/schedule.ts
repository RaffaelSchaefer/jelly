/**
 * What happens during a LAN: the food event, the ceremony and the event codes.
 *
 * @module
 */

import type { LANSummary } from "./api.ts";
import { endGathering, loadGathering, startGathering, type Gathering } from "./apiEvents.ts";
import {
  createButton,
  createConfirmButton,
  createElement,
  createField,
  createLabelled,
  createMessage,
  createSelect,
} from "./dom.ts";
import { createEventCodesTab } from "./eventCodes.ts";
import type { FailureHandler } from "./failure.ts";
import type { SectionContext } from "./lanContext.ts";
import { formatDateTime } from "./format.ts";
import { createPlayerPicker } from "./playerPicker.ts";

const SECONDS_PER_MINUTE = 60;
const KIND_CEREMONY = "ceremony";

/** Names the kinds of gatherings. */
function nameGathering(kind: string): string {
  return kind === KIND_CEREMONY ? "Siegerehrung" : "Essens-Event";
}

/** Says what runs right now, with a button to end it early. */
function createStatus(
  gathering: Gathering | null,
  lan: LANSummary,
  onFailure: FailureHandler,
  reload: () => void,
): HTMLElement {
  if (gathering === null) {
    return createElement("p", "hint", "Gerade läuft nichts.");
  }
  const message = createMessage();
  const end = createConfirmButton("Vorzeitig beenden", "Wirklich beenden?", () => {
    endGathering(lan.id)
      .then(reload)
      .catch((error: unknown) => onFailure(error, message.showBad));
  });
  return createElement(
    "div",
    "status",
    createElement(
      "p",
      "",
      createElement("strong", "", nameGathering(gathering.kind)),
      ` läuft bis ${formatDateTime(gathering.ends_at)}.`,
    ),
    message.root,
    createElement("div", "actions", end),
  );
}

/** Creates the form that starts a food event or a ceremony. */
function createStartForm(lan: LANSummary, onFailure: FailureHandler, reload: () => void) {
  const kind = createSelect("gathering-kind", [
    ["food", "Essens-Event: alle Jellies gehen zur Theke"],
    [KIND_CEREMONY, "Siegerehrung: alle schauen zu, der Sieger steht vorne"],
  ]);
  const minutes = createField({
    id: "gathering-minutes",
    label: "Dauer in Minuten",
    type: "number",
  });
  minutes.input.value = "15";
  const winner = createPlayerPicker("gathering-winner", "Sieger (optional)", onFailure);
  // Only a ceremony has a winner.
  const showWinner = () => {
    winner.root.hidden = kind.value !== KIND_CEREMONY;
  };
  kind.addEventListener("change", showWinner);
  showWinner();
  const message = createMessage();
  const start = createButton("Starten", "", () => {
    startGathering(lan.id, {
      kind: kind.value,
      seconds: Math.round(Number(minutes.input.value) * SECONDS_PER_MINUTE),
      winner_id: kind.value === KIND_CEREMONY ? (winner.selected()?.id ?? null) : null,
    })
      .then(reload)
      .catch((error: unknown) => onFailure(error, message.showBad));
  });
  return createElement(
    "div",
    "fields",
    createLabelled("gathering-kind", "Was", kind),
    minutes.root,
    winner.root,
    message.root,
    createElement("div", "actions", start),
  );
}

/** Creates the panel for food events and ceremonies, which loads what is running. */
function createGatheringPanel(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  const status = createGatheringSummary(lan, onFailure);
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Essens-Event und Siegerehrung"),
    createElement(
      "p",
      "hint",
      "Ein neues ersetzt ein laufendes. Danach kehren alle Jellies an ihre Plätze zurück.",
    ),
    status.root,
    createStartForm(lan, onFailure, status.reload),
  );
}

/** Shows what runs right now and loads it again on `reload`. */
export function createGatheringSummary(
  lan: LANSummary,
  onFailure: FailureHandler,
): { root: HTMLElement; reload: () => void } {
  const root = createElement("div", "");
  const reload = () => {
    loadGathering(lan.id)
      .then((gathering) => root.replaceChildren(createStatus(gathering, lan, onFailure, reload)))
      .catch((error: unknown) =>
        onFailure(error, (text) =>
          root.replaceChildren(createElement("p", "message message-bad", text)),
        ),
      );
  };
  reload();
  return { root, reload };
}

/** Creates the section. */
export function createActionsSection(context: SectionContext): HTMLElement {
  const { lan, onFailure } = context;
  return createElement(
    "div",
    "detail",
    createGatheringPanel(lan, onFailure),
    createEventCodesTab(lan, onFailure),
  );
}
