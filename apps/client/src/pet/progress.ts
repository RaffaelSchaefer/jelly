/**
 * Level, Abklingzeiten und Stupser-Wartezeit, abgeleitet aus dem Stand des Servers.
 *
 * Alle Zeiten sind Unix-Millisekunden auf der Uhr des Servers. `now` kommt deshalb immer aus
 * `server_time` plus der seither vergangenen Zeit, nie direkt aus `Date.now()`.
 *
 * @module
 */

import type { Report, Reports } from "./types";

/** XP pro Level, wie beim Server. */
const XP_PER_LEVEL = 100;

/** Millisekunden pro Minute. */
const MINUTE_MS = 60_000;

/**
 * Level und Fortschritt zum nächsten Level, wie `CalculateLevel` beim Server.
 *
 * @returns `level` (ab 1), `current` (XP im laufenden Level) und `remaining` (XP bis zum nächsten).
 */
export function levelProgress(xp: number) {
  const current = xp % XP_PER_LEVEL;
  return {
    level: Math.floor(xp / XP_PER_LEVEL) + 1,
    current,
    remaining: XP_PER_LEVEL - current,
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
