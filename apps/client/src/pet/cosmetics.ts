/**
 * Cosmetics: wie sie aussehen und wie man sie freischaltet.
 *
 * Was freigeschaltet ist, sagt der Server (`me.cosmetics`), wie man es bekommt, sein Katalog. Hier
 * stehen nur Anzeigename, Platz und Symbol. Die 3D-Modelle liegen in `@jelly/scene`.
 *
 * @module
 */

import type { IconName } from "../ui/Icon";
import type { Catalog, CosmeticSlot, Equipped, Me } from "./types";

/** Ein anlegbares Teil. */
export interface Cosmetic {
  /** Schlüssel beim Server, gleichzeitig Dateiname des Modells. */
  id: string;
  /** Anzeigename. */
  name: string;
  /**
   * Der Platz beim Server. `head` und `face` wippen mit dem Kopf, `hands` folgt den Händen, `body`
   * und `aura` bleiben beim Körper. Für diese beiden führt der Server noch kein Cosmetic.
   */
  slot: CosmeticSlot;
  /** Symbol in der Auswahl. */
  icon: IconName;
}

/** Alle Cosmetics, die die App darstellen kann. `golden-cup` gibt es nur als Auszeichnung. */
export const COSMETICS: Cosmetic[] = [
  { id: "headset", name: "Headset", slot: "head", icon: "teddyheadset" },
  { id: "headset-neutral", name: "Headset schlicht", slot: "head", icon: "headset" },
  { id: "beanie", name: "Mütze", slot: "head", icon: "beanie" },
  { id: "party-hat", name: "Party-Hut", slot: "head", icon: "partyhat" },
  { id: "pixel-glasses", name: "Pixel-Brille", slot: "face", icon: "glasses" },
  { id: "hood", name: "Kapuze", slot: "head", icon: "hood" },
  { id: "crown", name: "Krone", slot: "head", icon: "crown" },
  { id: "golden-cup", name: "Goldener Pokal", slot: "hands", icon: "trophy" },
];

/** In dieser Reihenfolge entstehen die Teile: Jedes liegt als Sticker auf dem davor. */
const WORN_ORDER: CosmeticSlot[] = ["head", "face", "hands", "body", "aura"];

/** Was ein Jelly trägt, soweit die App es darstellen kann. */
export function wornCosmetics(equipped: Equipped) {
  return WORN_ORDER.flatMap(
    (slot) => COSMETICS.find((item) => item.slot === slot && item.id === equipped[slot]?.key) ?? [],
  );
}

/**
 * Die Farbe, die beim Anlegen mitgeht. Einfärbbare Cosmetics bekommen die erste der Palette, bis es
 * eine Auswahl dafür gibt.
 */
export function equipColor(id: string | null, catalog: Catalog) {
  const entry = catalog.cosmetics.find((item) => item.key === id);
  return entry?.colorable ? catalog.cosmetic_colors[0] : undefined;
}

/** Anzeigename eines Platzes aus dem Katalog. */
export function slotLabel(slot: string, catalog: Catalog) {
  return catalog.cosmetic_slots.find((item) => item.key === slot)?.label ?? slot;
}

/** Ob `me` das Cosmetic tragen darf. */
export function isUnlocked(id: string, me: Me) {
  return me.cosmetics.includes(id);
}

/** Wie man das Cosmetic freischaltet, in wenigen Worten (`"Level 5"`). Unbekanntes gilt wie `none`. */
export function unlockLabel(id: string, catalog: Catalog) {
  const entry = catalog.cosmetics.find((item) => item.key === id);
  if (entry?.unlock === "level" && entry.level) return `Level ${entry.level}`;
  if (entry?.unlock === "event") return "Bei einem Event";
  if (entry?.unlock === "award") return "Von der Orga";
  return "Nicht freischaltbar";
}

/** Die Level-Cosmetics des Katalogs, aufsteigend nach Level, soweit die App sie darstellen kann. */
function levelCosmetics(catalog: Catalog) {
  return catalog.cosmetics
    .filter((item) => item.unlock === "level" && item.level)
    .sort((a, b) => a.level! - b.level!)
    .flatMap((item) => {
      const shown = COSMETICS.find((cosmetic) => cosmetic.id === item.key);
      return shown ? [{ ...shown, level: item.level! }] : [];
    });
}

/** Das Cosmetic, das genau mit `level` freigeschaltet wird, falls es eins gibt. */
export function levelCosmetic(level: number, catalog: Catalog) {
  return levelCosmetics(catalog).find((item) => item.level === level);
}

/** Das erste Level-Cosmetic oberhalb von `level`, also die nächste Belohnung. */
export function nextLevelCosmetic(level: number, catalog: Catalog) {
  return levelCosmetics(catalog).find((item) => item.level > level);
}
