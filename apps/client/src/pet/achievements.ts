/**
 * Erfolge und ihr Fortschritt. Wird komplett in der Oberfläche aus dem Verlauf berechnet.
 *
 * @module
 */

import type { IconName } from "../ui/Icon";
import type { Entry } from "./types";

/** Stabile ID eines Erfolgs. */
export type AchievementId = "first-game" | "marathon" | "hydrated" | "tournament" | "night-owl";

/** Ein Erfolg, wie er in der Liste steht. */
export interface Achievement {
  /** Stabile ID. */
  id: AchievementId;
  /** Kurzer Titel. */
  title: string;
  /** Was man dafür tun muss. */
  detail: string;
  /** Symbol in der Liste. */
  icon: IconName;
  /** Zielwert, ab dem der Erfolg geschafft ist. */
  goal: number;
  /** Einheit hinter dem Fortschritt, zum Beispiel `"h"`. */
  unit?: string;
  /** Bleibt bis zum Erreichen verborgen. */
  secret?: boolean;
}

/** Alle Erfolge in Anzeigereihenfolge. */
export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-game",
    title: "Erste Runde",
    detail: "Dein erstes Spiel über Steam",
    icon: "gamepad",
    goal: 1,
  },
  {
    id: "marathon",
    title: "Marathon",
    detail: "10 Stunden am Stück gezockt",
    icon: "clock",
    goal: 10,
    unit: "h",
  },
  {
    id: "hydrated",
    title: "Gut hydriert",
    detail: "10 Getränke geholt",
    icon: "droplet",
    goal: 10,
  },
  {
    id: "tournament",
    title: "Turnierheld",
    detail: "Bei 3 Events mitgemacht",
    icon: "trophy",
    goal: 3,
  },
  {
    id: "night-owl",
    title: "Nachteule",
    detail: "Um 4 Uhr nachts noch dabei",
    icon: "moon",
    goal: 1,
    secret: true,
  },
];

/**
 * Fortschritt je Erfolg, gedeckelt auf sein Ziel.
 *
 * Die Steam-Erfolge (`first-game`, `marathon`) bleiben bei 0, bis Steam angebunden ist.
 */
export function achievementProgress(log: Entry[]): Record<AchievementId, number> {
  const count = (test: (entry: Entry) => boolean) => log.filter(test).length;
  const raw = {
    "first-game": 0,
    marathon: 0,
    hydrated: count((entry) => entry.action === "drink"),
    tournament: count((entry) => entry.action === "event"),
    "night-owl": count((entry) => new Date(entry.at * 1000).getHours() === 4),
  };
  return Object.fromEntries(
    ACHIEVEMENTS.map((item) => [item.id, Math.min(item.goal, raw[item.id])]),
  ) as Record<AchievementId, number>;
}
