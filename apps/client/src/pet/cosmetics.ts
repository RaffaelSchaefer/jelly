/**
 * Cosmetics: wie sie aussehen und wie man sie freischaltet.
 *
 * Was freigeschaltet ist, sagt der Server (`me.cosmetics`), wie man es bekommt, sein Katalog: Shop,
 * Event oder Orga. Hier stehen nur Anzeigename, Platz und Symbol, den Shop rechnet `shop.ts`. Die
 * 3D-Modelle liegen in `@jelly/scene`.
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
   * und `aura` bleiben beim Körper.
   */
  slot: CosmeticSlot;
  /** Symbol in der Auswahl. */
  icon: IconName;
  /**
   * Sitzt an jeder Hand statt zwischen beiden, wie Pfoten. Das Modell ist dann eine Hand, um den
   * Ursprung modelliert, und die Szene zeichnet es zweimal.
   */
  onHands?: boolean;
}

/**
 * Alle Cosmetics, die die App darstellen kann. `golden-cup` gibt es nur als Auszeichnung,
 * `party-hat` und `bat-wings` über Event-Codes.
 */
export const COSMETICS: Cosmetic[] = [
  { id: "headset", name: "Headset", slot: "head", icon: "teddyheadset" },
  { id: "headset-neutral", name: "Headset schlicht", slot: "head", icon: "headset" },
  { id: "beanie", name: "Mütze", slot: "head", icon: "beanie" },
  { id: "sprout", name: "Spross", slot: "head", icon: "sprout" },
  { id: "party-hat", name: "Party-Hut", slot: "head", icon: "partyhat" },
  { id: "pixel-glasses", name: "Pixel-Brille", slot: "face", icon: "glasses" },
  { id: "schnoerbi-mask", name: "Schnörbi-Maske", slot: "face", icon: "mask" },
  { id: "hood", name: "Kapuze", slot: "head", icon: "hood" },
  { id: "crown", name: "Krone", slot: "head", icon: "crown" },
  { id: "ogre-ears", name: "Oger-Ohren", slot: "head", icon: "ears" },
  { id: "piercings", name: "Piercings", slot: "face", icon: "piercing" },
  { id: "kamina-glasses", name: "Kamina-Brille", slot: "face", icon: "shades" },
  { id: "cat-ears", name: "Katzenohren", slot: "head", icon: "catears" },
  { id: "cyber-cat-ears", name: "Cyber-Katzenohren", slot: "head", icon: "cyberears" },
  { id: "cat-whiskers", name: "Schnurrhaare", slot: "face", icon: "whiskers" },
  { id: "long-schnoerbi", name: "Long Schnörbi", slot: "hands", icon: "plush" },
  { id: "goose", name: "Kuschelgans", slot: "hands", icon: "goose" },
  { id: "chicken", name: "Kuschelhuhn", slot: "hands", icon: "chicken" },
  { id: "kitten", name: "Kuschelkätzchen", slot: "hands", icon: "kitten" },
  { id: "yarn-ball", name: "Wollknäuel", slot: "hands", icon: "yarn" },
  { id: "cat-paws", name: "Samtpfoten", slot: "hands", icon: "paw", onHands: true },
  { id: "golden-cup", name: "Goldener Pokal", slot: "hands", icon: "trophy" },
  { id: "bandana", name: "Halstuch", slot: "body", icon: "bandana" },
  { id: "bell-collar", name: "Glöckchen-Halsband", slot: "body", icon: "bell" },
  { id: "knit-scarf", name: "Strickschal", slot: "body", icon: "scarf" },
  { id: "snail-shell", name: "Lag-Schneckenhaus", slot: "body", icon: "snail" },
  { id: "mini-backpack", name: "Mini-Rucksack", slot: "body", icon: "backpack" },
  { id: "fairy-wings", name: "Feenflügel", slot: "body", icon: "wings" },
  { id: "bat-wings", name: "Fledermausflügel", slot: "body", icon: "batwings" },
  { id: "cat-tail", name: "Katzenschwanz", slot: "body", icon: "tail" },
];

/**
 * Reihenfolge der getragenen Teile. Gemalt wird nach Tiefe, Gehaltenes eine Malschicht höher
 * (`src/scene/Character.tsx`).
 */
const WORN_ORDER: CosmeticSlot[] = ["head", "face", "hands", "body", "aura"];

/** Was ein Jelly trägt, soweit die App es darstellen kann, mit der gewählten Farbe. */
export function wornCosmetics(equipped: Equipped) {
  return WORN_ORDER.flatMap((slot) => {
    const item = COSMETICS.find((entry) => entry.slot === slot && entry.id === equipped[slot]?.key);
    return item ? [{ ...item, color: equipped[slot]?.color ?? null }] : [];
  });
}

/**
 * Was ein Jelly trägt, wenn `key` auf `slot` kommt, mit `null` ist der Platz leer. Für die Vorschau
 * ohne Server und die Anprobe im Shop.
 */
export function withEquipped(
  equipped: Equipped,
  slot: string,
  key: string | null,
  color?: string,
): Equipped {
  const { [slot]: _taken, ...others } = equipped;
  return key ? { ...others, [slot]: { key, color: color ?? null } } : others;
}

/** Ob der Server das Cosmetic einfärben lässt. */
export function isColorable(id: string, catalog: Catalog) {
  return catalog.cosmetics.some((item) => item.key === id && item.colorable);
}

/** Anzeigename eines Platzes aus dem Katalog. */
export function slotLabel(slot: string, catalog: Catalog) {
  return catalog.cosmetic_slots.find((item) => item.key === slot)?.label ?? slot;
}

/** Ob `me` das Cosmetic tragen darf. */
export function isUnlocked(id: string, me: Me) {
  return me.cosmetics.includes(id);
}

/** Eine Anzahl Münzen in Worten (`"1 Münze"`, `"3 Münzen"`). */
export function coinLabel(count: number) {
  return count === 1 ? "1 Münze" : `${count} Münzen`;
}

/** Wie man das Cosmetic freischaltet, in wenigen Worten (`"3 Münzen"`). Unbekanntes gilt wie `none`. */
export function unlockLabel(id: string, catalog: Catalog) {
  const entry = catalog.cosmetics.find((item) => item.key === id);
  if (entry?.unlock === "shop" && entry.price !== undefined) return coinLabel(entry.price);
  if (entry?.unlock === "event") return "Bei einem Event";
  if (entry?.unlock === "award") return "Von der Orga";
  return "Nicht freischaltbar";
}
