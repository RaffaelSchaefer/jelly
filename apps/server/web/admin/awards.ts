/**
 * Gives a player an award, for example for winning a tournament, optionally with a cosmetic.
 *
 * @module
 */

import { giveAward, loadCosmetics, type Cosmetic } from "./apiEvents.ts";
import {
  createButton,
  createElement,
  createField,
  createLabelled,
  createMessage,
  createSelect,
} from "./dom.ts";
import type { FailureHandler } from "./failure.ts";
import { createPlayerPicker } from "./playerPicker.ts";

const NO_COSMETIC = "";
// Only these cosmetics are meant to come from the organizers. The others unlock by level or event.
const AWARD_UNLOCK = "award";
const TEXT_CHOOSE = "Bitte wähle eine Person und gib einen Titel an.";

/** Lists the cosmetics for the dropdown, by default only those meant as awards. */
function listOptions(cosmetics: Cosmetic[], isShowingAll: boolean): [string, string][] {
  const shown = cosmetics.filter((cosmetic) => isShowingAll || cosmetic.unlock === AWARD_UNLOCK);
  return [
    [NO_COSMETIC, "Kein Cosmetic, nur der Titel"],
    ...shown.map((cosmetic): [string, string] => [cosmetic.key, cosmetic.name]),
  ];
}

/** Creates the panel and loads the catalog. */
export function createAwardForm(onFailure: FailureHandler): HTMLElement {
  const player = createPlayerPicker("award-player", "Person", onFailure);
  const title = createField({
    id: "award-title",
    label: "Titel",
    hint: "Zum Beispiel „Sieger CS2-Turnier“.",
  });
  const showAll = createElement("input", "");
  showAll.type = "checkbox";
  showAll.id = "award-show-all";
  const slot = createElement("div", "");
  const message = createMessage();
  let cosmetics: Cosmetic[] = [];
  let select = createSelect("award-cosmetic", listOptions(cosmetics, false));
  const renderSelect = () => {
    select = createSelect("award-cosmetic", listOptions(cosmetics, showAll.checked));
    slot.replaceChildren(createLabelled("award-cosmetic", "Cosmetic", select));
  };
  showAll.addEventListener("change", renderSelect);
  loadCosmetics()
    .then((loaded) => {
      cosmetics = loaded;
      renderSelect();
    })
    .catch((error: unknown) => onFailure(error, message.showBad));
  renderSelect();
  const give = createButton("Preis vergeben", "", () => {
    const chosen = player.selected();
    if (chosen === null || title.input.value.trim() === "") {
      message.showBad(TEXT_CHOOSE);
      return;
    }
    giveAward(
      chosen.id,
      title.input.value.trim(),
      select.value === NO_COSMETIC ? null : select.value,
    )
      .then(() =>
        message.showGood(`${chosen.name} hat den Preis „${title.input.value.trim()}“ bekommen.`),
      )
      .catch((error: unknown) => onFailure(error, message.showBad));
  });
  return createElement(
    "section",
    "panel",
    createElement("h3", "", "Preis vergeben"),
    player.root,
    title.root,
    slot,
    createElement(
      "label",
      "checkbox",
      showAll,
      "Alle Cosmetics zeigen, auch die per Level oder Event",
    ),
    message.root,
    createElement("div", "actions", give),
  );
}
