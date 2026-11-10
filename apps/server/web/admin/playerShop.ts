/**
 * The shop inside an opened player row: give coins, and take purchases back.
 *
 * @module
 */

import { giveCoins, refundPurchase } from "./apiPeople.ts";
import { createButton, createElement } from "./dom.ts";
import { createToolGroup, type PlayerTools } from "./playerTools.ts";

/** Coins a gift starts with, and the most the server allows at once. */
const DEFAULT_GIFT_COINS = 10;
const MAX_GIFT_COINS = 1000;

/** Names a cosmetic for people, with the key as a fallback. */
function cosmeticName(tools: PlayerTools, key: string): string {
  const cosmetic = tools.catalogs.cosmetics.find((entry) => entry.key === key);
  return cosmetic?.name ?? key;
}

/** Creates the line that gives coins. */
function createCoinsLine(tools: PlayerTools): HTMLElement {
  const amount = createElement("input", "xp-amount");
  Object.assign(amount, { type: "number", min: "1", max: String(MAX_GIFT_COINS) });
  amount.value = String(DEFAULT_GIFT_COINS);
  amount.setAttribute("aria-label", `Münzen für ${tools.player.name}`);
  const form = createElement(
    "form",
    "xp-form",
    amount,
    createElement("button", "quiet", "Münzen geben"),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const coins = Number(amount.value);
    tools.run(giveCoins(tools.player.id, coins), `${tools.player.name} bekommt ${coins} Münzen.`);
  });
  return form;
}

/** Creates the row of one purchase with its refund. */
function createPurchaseLine(tools: PlayerTools, key: string, price: number): HTMLElement {
  const refund = createButton("Zurückzahlen", "quiet", () =>
    tools.run(
      refundPurchase(tools.player.id, key),
      `${tools.player.name} hat ${cosmeticName(tools, key)} zurückgegeben und ${price} Münzen zurück.`,
    ),
  );
  return createElement(
    "div",
    "tool-line",
    createElement("span", "", `${cosmeticName(tools, key)} für ${price} Münzen`),
    refund,
  );
}

/** Creates the group with coins and purchases. */
export function createShopGroup(tools: PlayerTools): HTMLElement {
  const parts: HTMLElement[] = [
    createElement(
      "p",
      "hint",
      "Münzen gelten nur in der laufenden LAN. Ein Kauf bleibt, außer bei der Krone.",
    ),
  ];
  for (const purchase of tools.player.purchases) {
    parts.push(createPurchaseLine(tools, purchase.cosmetic_key, purchase.price));
  }
  if (tools.player.purchases.length === 0) {
    parts.push(createElement("p", "hint", "Noch nichts gekauft."));
  }
  parts.push(createCoinsLine(tools));
  return createToolGroup("Shop", "", ...parts);
}
