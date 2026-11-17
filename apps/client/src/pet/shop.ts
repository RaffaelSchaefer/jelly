/**
 * Der Shop: was es für Münzen gibt und was davon `me` schon hat oder sich leisten kann.
 *
 * Preise und Kauf entscheidet der Server, die App zeigt nur an. Was sie nicht zeichnen kann, steht
 * auch nicht im Shop.
 *
 * @module
 */

import type { Catalog, Me } from "./types";

import { COSMETICS, type Cosmetic } from "./cosmetics";

/**
 * Wie ein Eintrag für `me` steht: schon gekauft (`owned`), kaufbar (`affordable`) oder noch zu
 * teuer (`short`).
 */
export type ShopState = "owned" | "affordable" | "short";

/** Ein Cosmetic im Shop. */
export interface ShopItem {
  cosmetic: Cosmetic;
  price: number;
  /** Gilt nur für diese LAN und muss bei der nächsten neu gekauft werden, wie die Krone. */
  perLan: boolean;
  state: ShopState;
  /** Wie viele Münzen noch fehlen, 0 wenn es reicht oder schon gekauft ist. */
  missing: number;
}

/** Zustand eines Eintrags. Ein vergebenes Teil zählt wie gekauft, der Server verkauft es nicht. */
function shopState(id: string, price: number, me: Me): ShopState {
  if (me.cosmetics.includes(id)) return "owned";
  return me.coins >= price ? "affordable" : "short";
}

/** Alle Shop-Cosmetics, die die App zeichnen kann, aufsteigend nach Preis. */
export function shopItems(catalog: Catalog, me: Me): ShopItem[] {
  return catalog.cosmetics
    .flatMap((entry) => {
      const cosmetic = COSMETICS.find((item) => item.id === entry.key);
      if (entry.unlock !== "shop" || entry.price === undefined || !cosmetic) return [];
      const { price } = entry;
      const state = shopState(entry.key, price, me);
      const missing = state === "short" ? price - me.coins : 0;
      return [{ cosmetic, price, perLan: entry.scope === "lan", state, missing }];
    })
    .sort((a, b) => a.price - b.price);
}
