/**
 * Cosmetics und wann sie freigeschaltet sind.
 *
 * Rust speichert nur die ID des angelegten Teils. Was freigeschaltet ist, entscheidet allein die
 * Oberfläche anhand dieser Liste. Die 3D-Modelle liegen als `src/cosmetics/<id>.glb`.
 *
 * @module
 */

import type { IconName } from "../ui/Icon";
import type { Pet } from "./types";

import { ACHIEVEMENTS, achievementProgress, type AchievementId } from "./achievements";
import { levelProgress } from "./progress";

/** Ein anlegbares Teil. */
export interface Cosmetic {
  /** ID, gleichzeitig Dateiname des Modells. Nur `a–z`, `0–9` und `-` (prüft Rust). */
  id: string;
  /** Anzeigename. */
  name: string;
  /** Wo es sitzt. `Kopf` und `Gesicht` wippen mit dem Kopf, `Effekte` bleiben beim Körper. */
  slot: "Kopf" | "Gesicht" | "Effekte";
  /** Symbol in der Auswahl. */
  icon: IconName;
  /** Wodurch es freigeschaltet wird: ein Level, ein Erfolg oder irgendein Event. */
  unlock: { level: number } | { achievement: AchievementId } | { event: true };
}

/** Alle Cosmetics. Level-Freischaltungen stehen aufsteigend, darauf baut {@link nextLevelCosmetic}. */
export const COSMETICS: Cosmetic[] = [
  { id: "headset", name: "Headset", slot: "Kopf", icon: "headset", unlock: { level: 2 } },
  { id: "beanie", name: "Mütze", slot: "Kopf", icon: "beanie", unlock: { level: 3 } },
  { id: "party-hat", name: "Party-Hut", slot: "Kopf", icon: "partyhat", unlock: { event: true } },
  {
    id: "pixel-glasses",
    name: "Pixel-Brille",
    slot: "Gesicht",
    icon: "glasses",
    unlock: { level: 5 },
  },
  { id: "hood", name: "Kapuze", slot: "Kopf", icon: "hood", unlock: { level: 6 } },
  { id: "crown", name: "Krone", slot: "Kopf", icon: "crown", unlock: { level: 10 } },
  {
    id: "glow-aura",
    name: "Glüh-Aura",
    slot: "Effekte",
    icon: "aura",
    unlock: { achievement: "marathon" },
  },
];

/** Ob `pet` das Cosmetic schon freigeschaltet hat. */
export function isUnlocked(cosmetic: Cosmetic, pet: Pet) {
  const { unlock } = cosmetic;
  if ("level" in unlock) return levelProgress(pet.xp).level >= unlock.level;
  if ("event" in unlock) return pet.log.some((entry) => entry.action === "event");
  const achievement = ACHIEVEMENTS.find((item) => item.id === unlock.achievement)!;
  return achievementProgress(pet.log)[achievement.id] >= achievement.goal;
}

/** Wie man das Cosmetic freischaltet, in wenigen Worten (`"Level 5"`, `"Marathon"`). */
export function unlockLabel(cosmetic: Cosmetic) {
  const { unlock } = cosmetic;
  if ("level" in unlock) return `Level ${unlock.level}`;
  if ("event" in unlock) return "Bei einem Event";
  return ACHIEVEMENTS.find((item) => item.id === unlock.achievement)!.title;
}

/** Das Cosmetic, das genau mit `level` freigeschaltet wird, falls es eins gibt. */
export function levelCosmetic(level: number) {
  return COSMETICS.find((item) => "level" in item.unlock && item.unlock.level === level);
}

/** Das erste Level-Cosmetic oberhalb von `level`, also die nächste Belohnung. */
export function nextLevelCosmetic(level: number) {
  return COSMETICS.find((item) => "level" in item.unlock && item.unlock.level > level);
}
