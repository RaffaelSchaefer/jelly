/**
 * Der Shop: was es für Münzen gibt, was davon `me` schon hat oder sich leisten kann und wie edel
 * eine Ware ist.
 *
 * Preise und Kauf entscheidet der Server, die App zeigt nur an. Was sie nicht zeichnen kann, steht
 * auch nicht im Shop. Die Güte einer Ware folgt allein aus ihrem Preis.
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

/** Die Güten einer Ware, von der billigsten zur teuersten. */
export const SHOP_TIERS = ["schlicht", "fein", "edel", "sagenhaft"] as const;

/** Eine Güte aus {@link SHOP_TIERS}. */
export type ShopTier = (typeof SHOP_TIERS)[number];

/** Die Güte als Wort, für Karten und Kaufbrief. */
export const TIER_LABELS: Record<ShopTier, string> = {
  schlicht: "Schlicht",
  fein: "Fein",
  edel: "Edel",
  sagenhaft: "Sagenhaft",
};

/** Ein Cosmetic im Shop. */
export interface ShopItem {
  cosmetic: Cosmetic;
  price: number;
  /** Gilt nur für diese LAN und muss bei der nächsten neu gekauft werden, wie die Krone. */
  perLan: boolean;
  state: ShopState;
  /** Wie viele Münzen noch fehlen, 0 wenn es reicht oder schon gekauft ist. */
  missing: number;
  /** Die Güte nach dem Rang des Preises im ganzen Shop. Ein Kauf ändert sie nicht. */
  tier: ShopTier;
}

/**
 * Die Güte zu `price`: sein Rang unter den verschiedenen Preisen in `prices`, verteilt auf die vier
 * Stufen. Mit nur einem Preis, oder ohne `price` unter `prices`, ist alles schlicht.
 */
export function shopTier(price: number, prices: readonly number[]): ShopTier {
  const distinct = [...new Set(prices)].sort((a, b) => a - b);
  const rank = distinct.indexOf(price);
  if (distinct.length < 2 || rank < 0) return "schlicht";
  const step = Math.round((rank / (distinct.length - 1)) * (SHOP_TIERS.length - 1));
  return SHOP_TIERS[step] ?? "schlicht";
}

/** Zustand eines Eintrags. Ein vergebenes Teil zählt wie gekauft, der Server verkauft es nicht. */
function shopState(id: string, price: number, me: Me): ShopState {
  if (me.cosmetics.includes(id)) return "owned";
  return me.coins >= price ? "affordable" : "short";
}

/** Was der Katalog verkauft und die App zeichnen kann, noch ohne den Blick auf `me`. */
function wares(catalog: Catalog) {
  return catalog.cosmetics.flatMap((entry) => {
    const cosmetic = COSMETICS.find((item) => item.id === entry.key);
    if (entry.unlock !== "shop" || entry.price === undefined || !cosmetic) return [];
    return [{ cosmetic, price: entry.price, perLan: entry.scope === "lan" }];
  });
}

/** Alle Shop-Cosmetics, die die App zeichnen kann, aufsteigend nach Preis. */
export function shopItems(catalog: Catalog, me: Me): ShopItem[] {
  const offered = wares(catalog);
  // Die Güte zählt über den ganzen Shop: Was gekauft ist, bleibt so edel wie vorher.
  const prices = offered.map((ware) => ware.price);
  return offered
    .map((ware): ShopItem => {
      const state = shopState(ware.cosmetic.id, ware.price, me);
      const missing = state === "short" ? ware.price - me.coins : 0;
      return { ...ware, state, missing, tier: shopTier(ware.price, prices) };
    })
    .sort((a, b) => a.price - b.price);
}
