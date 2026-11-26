/**
 * Level, Abklingzeiten und Stupser-Wartezeit, abgeleitet aus dem Stand des Servers.
 *
 * Alle Zeiten sind Unix-Millisekunden auf der Uhr des Servers. `now` kommt deshalb immer aus
 * `server_time` plus der seither vergangenen Zeit, nie direkt aus `Date.now()`.
 *
 * @module
 */

import type { Me, Report, Reports } from "./types";

/** Millisekunden pro Minute. */
const MINUTE_MS = 60_000;

/** Der Fortschritt zum nächsten Level, siehe {@link levelProgress}. */
export interface LevelProgress {
  /** Level ab 1. */
  level: number;
  /** XP im laufenden Level. */
  current: number;
  /** So viel kostet das laufende Level, 0 ohne LAN. */
  cost: number;
  /** XP bis zum nächsten Level. */
  remaining: number;
  /** Anteil des laufenden Levels von 0 bis 1, 0 ohne LAN. */
  fill: number;
}

/**
 * Level und Fortschritt zum nächsten Level. Der Server rechnet beides fertig: Ein Level kostet je
 * nach Kurve der LAN (`xp_curve`) verschieden viel, die App rechnet darum nie selbst aus `xp`.
 */
export function levelProgress(
  me: Pick<Me, "level" | "xp_in_level" | "xp_for_next_level">,
): LevelProgress {
  const cost = Math.max(0, me.xp_for_next_level);
  const current = Math.min(cost, Math.max(0, me.xp_in_level));
  return {
    level: me.level,
    current,
    cost,
    remaining: cost - current,
    fill: cost > 0 ? current / cost : 0,
  };
}

/** Aufgerundete Minuten bis `at`, 0 wenn es schon so weit ist. */
export function minutesUntil(at: number, now: number) {
  return Math.max(0, Math.ceil((at - now) / MINUTE_MS));
}

/**
 * Ob `action` gemeldet werden kann.
 *
 * @param reports - Stand vom Server, `null` außerhalb einer laufenden LAN.
 * @returns `waitMinutes`: Minuten bis zur nächsten Meldung dieser Art (0 = sofort). `left`: wie
 *   viele Meldungen im laufenden Fenster noch frei sind.
 */
export function reportStatus(reports: Reports | null, action: Report, now: number) {
  if (!reports) return { waitMinutes: 0, left: 0 };
  const readyAt = action === "food" ? reports.food_ready_at : reports.drink_ready_at;
  return { waitMinutes: minutesUntil(readyAt, now), left: reports.reports_left };
}

/** Minuten bis zum nächsten Stupser mit XP, `null` außerhalb einer laufenden LAN. */
export function pokeWaitMinutes(nextPokeAt: number | null, now: number) {
  return nextPokeAt === null ? null : minutesUntil(nextPokeAt, now);
}
