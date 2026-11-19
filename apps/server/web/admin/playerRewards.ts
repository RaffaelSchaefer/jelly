/**
 * Rewards inside an opened player row: XP, an achievement, or an award with a cosmetic.
 *
 * @module
 */

import { giveAward, type Cosmetic } from "./apiEvents.ts";
import { giveXP, grantAchievement } from "./apiPeople.ts";
import { createButton, createElement, createField, createLabelled, createSelect } from "./dom.ts";
import { createToolGroup, makeToolID, type PlayerTools } from "./playerTools.ts";

/** XP a gift starts with, and the most the server allows at once. */
const DEFAULT_GIFT_XP = 100;
const MAX_GIFT_XP = 10000;
const NO_COSMETIC = "";
// Only these cosmetics are meant to come from the organizers. The others are bought or come from
// an event.
const AWARD_UNLOCK = "award";
const TEXT_AWARD_EMPTY = "Bitte gib einen Titel an oder wähle ein Cosmetic.";

/** Creates the line that gives XP. */
function createXPLine(tools: PlayerTools): HTMLElement {
  const amount = createElement("input", "xp-amount");
  Object.assign(amount, { type: "number", min: "1", max: String(MAX_GIFT_XP) });
  amount.value = String(DEFAULT_GIFT_XP);
  amount.setAttribute("aria-label", `XP für ${tools.player.name}`);
  const form = createElement(
    "form",
    "xp-form",
    amount,
    createElement("button", "quiet", "XP geben"),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const xp = Number(amount.value);
    tools.run(giveXP(tools.player.id, xp), `${tools.player.name} bekommt ${xp} XP.`);
  });
  return form;
}

/** Creates the line that unlocks an achievement. */
function createAchievementLine(tools: PlayerTools): HTMLElement {
  const id = makeToolID(tools, "achievement");
  const select = createSelect(
    id,
    tools.catalogs.achievements.map((achievement) => [achievement.key, achievement.title]),
  );
  const grant = createButton("Freischalten", "quiet", () => {
    const option = select.selectedOptions[0];
    if (option === undefined) {
      return;
    }
    tools.run(
      grantAchievement(tools.player.id, option.value),
      `${tools.player.name} hat „${option.text}“ freigeschaltet.`,
    );
  });
  return createElement("div", "tool-line", createLabelled(id, "Achievement", select), grant);
}

/** Creates a group of cosmetics in the dropdown. */
function createCosmeticGroup(label: string, cosmetics: Cosmetic[]): HTMLOptGroupElement {
  const group = createElement("optgroup", "");
  group.label = label;
  for (const cosmetic of cosmetics) {
    const option = createElement("option", "", cosmetic.name);
    option.value = cosmetic.key;
    group.append(option);
  }
  return group;
}

/** Creates the dropdown of cosmetics, those meant as awards first. */
function createCosmeticSelect(id: string, cosmetics: Cosmetic[]): HTMLSelectElement {
  const select = createSelect(id, [[NO_COSMETIC, "Kein Cosmetic, nur der Titel"]]);
  select.append(
    createCosmeticGroup(
      "Als Preis gedacht",
      cosmetics.filter((cosmetic) => cosmetic.unlock === AWARD_UNLOCK),
    ),
    createCosmeticGroup(
      "Sonst per Level oder Event",
      cosmetics.filter((cosmetic) => cosmetic.unlock !== AWARD_UNLOCK),
    ),
  );
  return select;
}

/** Creates the lines that give an award. Without a title the cosmetic names it. */
function createAwardLines(tools: PlayerTools): HTMLElement {
  const title = createField({
    id: makeToolID(tools, "award-title"),
    label: "Preis",
    hint: "Zum Beispiel „Sieger CS2-Turnier“. Erscheint mit dem Cosmetic auch auf der Bühne.",
  });
  const select = createCosmeticSelect(
    makeToolID(tools, "award-cosmetic"),
    tools.catalogs.cosmetics,
  );
  const give = createButton("Vergeben", "quiet", () => {
    const cosmetic = select.selectedOptions[0];
    const cosmeticKey = select.value === NO_COSMETIC ? null : select.value;
    const text =
      title.input.value.trim() ||
      (cosmeticKey === null ? "" : `Freigeschaltet: ${cosmetic?.text ?? cosmeticKey}`);
    if (text === "") {
      tools.message.showBad(TEXT_AWARD_EMPTY);
      return;
    }
    tools.run(
      giveAward(tools.player.id, text, cosmeticKey),
      `${tools.player.name} hat „${text}“ bekommen.`,
    );
  });
  return createElement(
    "div",
    "fields",
    title.root,
    createElement("div", "tool-line", createLabelled(select.id, "Cosmetic", select), give),
  );
}

/** Creates the group with all rewards. */
export function createRewardGroup(tools: PlayerTools): HTMLElement {
  return createToolGroup(
    "Belohnen",
    "",
    createElement("p", "hint", "Gilt für die laufende LAN, wie selbst verdient."),
    createXPLine(tools),
    createAchievementLine(tools),
    createAwardLines(tools),
  );
}
