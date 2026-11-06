/**
 * Unlocks an achievement or a cosmetic for one account, to test what the app shows.
 *
 * @module
 */

import { giveAward, loadCosmetics, type Cosmetic } from "./apiEvents.ts";
import { grantAchievement, listAchievements, type Achievement } from "./apiPeople.ts";
import { createButton, createElement, createLabelled, createMessage } from "./dom.ts";
import type { FailureHandler } from "./failure.ts";
import { createPlayerPicker } from "./playerPicker.ts";

// Option values carry their kind, because achievements and cosmetics may share a key.
const PREFIX_ACHIEVEMENT = "achievement:";
const PREFIX_COSMETIC = "cosmetic:";

/** Creates a group of options in the dropdown. */
function createGroup(label: string, prefix: string, entries: [key: string, name: string][]) {
  const group = createElement("optgroup", "");
  group.label = label;
  for (const [key, name] of entries) {
    const option = createElement("option", "", name);
    option.value = prefix + key;
    group.append(option);
  }
  return group;
}

/** Fills the dropdown with both catalogs. */
function fillSelect(select: HTMLSelectElement, achievements: Achievement[], cosmetics: Cosmetic[]) {
  select.replaceChildren(
    createGroup(
      "Achievements",
      PREFIX_ACHIEVEMENT,
      achievements.map((achievement) => [achievement.key, achievement.title]),
    ),
    createGroup(
      "Cosmetics (als Preis)",
      PREFIX_COSMETIC,
      cosmetics.map((cosmetic) => [cosmetic.key, cosmetic.name]),
    ),
  );
}

/** Unlocks what the option names. A cosmetic comes as an award, the only way the server knows. */
function unlock(playerID: number, value: string, text: string): Promise<unknown> {
  if (value.startsWith(PREFIX_COSMETIC)) {
    return giveAward(playerID, `Freigeschaltet: ${text}`, value.slice(PREFIX_COSMETIC.length));
  }
  return grantAchievement(playerID, value.slice(PREFIX_ACHIEVEMENT.length));
}

/** Creates the panel and loads both catalogs. */
export function createUnlockForm(onFailure: FailureHandler): HTMLElement {
  const player = createPlayerPicker("unlock-player", "Person", onFailure);
  const select = createElement("select", "");
  select.id = "unlock-item";
  const message = createMessage();
  Promise.all([listAchievements(), loadCosmetics()])
    .then(([achievements, cosmetics]) => fillSelect(select, achievements, cosmetics))
    .catch((error: unknown) => onFailure(error, message.showBad));
  const give = createButton("Freischalten", "", () => {
    const chosen = player.selected();
    const option = select.selectedOptions[0];
    if (chosen === null || option === undefined) {
      message.showBad("Bitte wähle eine Person und etwas zum Freischalten.");
      return;
    }
    unlock(chosen.id, option.value, option.text)
      .then(() => message.showGood(`${chosen.name} hat „${option.text}“ freigeschaltet.`))
      .catch((error: unknown) => onFailure(error, message.showBad));
  });
  return createElement(
    "section",
    "panel",
    createElement("h2", "", "Freischalten"),
    createElement(
      "p",
      "hint",
      "Gilt für die laufende LAN, wie selbst verdient. Ein Cosmetic kommt als Preis und " +
        "erscheint damit auch auf der Bühne.",
    ),
    player.root,
    createLabelled("unlock-item", "Was", select),
    createElement("div", "actions", give),
    message.root,
  );
}
