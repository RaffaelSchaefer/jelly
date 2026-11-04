/**
 * Erfolge für die Liste. Welche verdient sind, sagt allein der Server.
 *
 * @module
 */

import type { IconName } from "../ui/Icon";
import type { Catalog, Me } from "./types";

/** Symbol je Erfolg. Was hier fehlt, bekommt einen Pokal. */
const ICONS: Partial<Record<string, IconName>> = {
  hatched: "spark",
  styled: "palette",
  hydrated: "droplet",
  "first-event": "event",
  "event-hopper": "event",
  tournament: "trophy",
  marathon: "clock",
  "beauty-sleep": "moon",
  "ghost-hour": "moon",
  "night-owl": "moon",
};

/** Ein Erfolg, wie er in der Liste steht. */
export interface AchievementItem {
  key: string;
  title: string;
  detail: string;
  icon: IconName;
  goal: number;
  unit?: string;
  done: boolean;
}

/**
 * Alle Erfolge in Katalogreihenfolge, dahinter verdiente geheime. Geheime stehen nicht im Katalog,
 * also tauchen sie erst auf, wenn man sie hat.
 */
export function achievementRows(catalog: Catalog, me: Me): AchievementItem[] {
  const earned = new Set(me.achievements.map((item) => item.key));
  const listed = catalog.achievements.map((item) => ({
    key: item.key,
    title: item.title,
    detail: item.description,
    icon: ICONS[item.key] ?? "trophy",
    goal: item.goal,
    unit: item.record_unit,
    done: earned.has(item.key),
  }));
  const known = new Set(listed.map((item) => item.key));
  const secrets = new Map(
    me.achievements
      .filter((item) => !known.has(item.key))
      .map((item) => [
        item.key,
        {
          key: item.key,
          title: item.title,
          detail: "Geheimer Erfolg",
          icon: ICONS[item.key] ?? "trophy",
          goal: 1,
          done: true,
        },
      ]),
  );
  return [...listed, ...secrets.values()];
}

/** Titel eines Erfolgs aus Stand oder Katalog, für die Sprechblase. */
export function achievementTitle(key: string, catalog: Catalog, me: Me | null) {
  return (
    me?.achievements.find((item) => item.key === key)?.title ??
    catalog.achievements.find((item) => item.key === key)?.title ??
    "Geheimer Erfolg"
  );
}
