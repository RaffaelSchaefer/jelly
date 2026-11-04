/**
 * Cosmetics: wie sie aussehen und wie man sie freischaltet.
 *
 * Was freigeschaltet ist, sagt der Server (`me.cosmetics`), wie man es bekommt, sein Katalog. Hier
 * stehen nur Anzeigename, Platz und Symbol. Die 3D-Modelle liegen als `src/cosmetics/<id>.glb`.
 *
 * @module
 */

import type { IconName } from "../ui/Icon";
import type { Catalog, Me } from "./types";

/** Ein anlegbares Teil. */
export interface Cosmetic {
  /** Schlüssel beim Server, gleichzeitig Dateiname des Modells. */
  id: string;
  /** Anzeigename. */
  name: string;
  /** Wo es sitzt. `Kopf` und `Gesicht` wippen mit dem Kopf, `Effekte` bleiben beim Körper. */
  slot: "Kopf" | "Gesicht" | "Effekte";
  /** Symbol in der Auswahl. */
  icon: IconName;
}

/** Alle Cosmetics, die die App darstellen kann. `glow-aura` gibt es nur als Auszeichnung. */
export const COSMETICS: Cosmetic[] = [
  { id: "headset", name: "Headset", slot: "Kopf", icon: "headset" },
  { id: "beanie", name: "Mütze", slot: "Kopf", icon: "beanie" },
  { id: "party-hat", name: "Party-Hut", slot: "Kopf", icon: "partyhat" },
  { id: "pixel-glasses", name: "Pixel-Brille", slot: "Gesicht", icon: "glasses" },
  { id: "hood", name: "Kapuze", slot: "Kopf", icon: "hood" },
  { id: "crown", name: "Krone", slot: "Kopf", icon: "crown" },
  { id: "glow-aura", name: "Glüh-Aura", slot: "Effekte", icon: "aura" },
];

/** Ob `me` das Cosmetic tragen darf. */
export function isUnlocked(id: string, me: Me) {
  return me.cosmetics.includes(id);
}

/** Wie man das Cosmetic freischaltet, in wenigen Worten (`"Level 5"`). */
export function unlockLabel(id: string, catalog: Catalog) {
  const entry = catalog.cosmetics.find((item) => item.key === id);
  if (entry?.level) return `Level ${entry.level}`;
  if (entry?.requires_event) return "Bei einem Event";
  return "Von der Orga";
}

/** Die Level-Cosmetics des Katalogs, aufsteigend nach Level, soweit die App sie darstellen kann. */
function levelCosmetics(catalog: Catalog) {
  return catalog.cosmetics
    .filter((item) => item.level)
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
