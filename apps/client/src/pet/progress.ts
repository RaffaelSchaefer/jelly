/**
 * Level, Abklingzeiten und Tagesverlauf, abgeleitet aus XP und Verlauf.
 *
 * @module
 */

import { REPORT, type Entry, type Report } from "./types";

/** XP pro Level. */
const XP_PER_LEVEL = 100;

/**
 * Level und Fortschritt zum nächsten Level, wie `Pet::level` in Rust.
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

/**
 * Ob `action` zum Zeitpunkt `now` (Unix-Sekunden) gemeldet werden kann, nach denselben Regeln wie
 * `Pet::check_report` in Rust.
 *
 * @returns `waitMinutes`: Minuten bis zur nächsten Meldung dieser Art (0 = sofort). `left`: wie
 *   viele Meldungen im laufenden 24-Stunden-Fenster noch frei sind.
 */
export function reportStatus(log: Entry[], action: Report, now: number) {
  const recent = log.filter((entry) => entry.action !== "event" && now - entry.at < REPORT.window);
  const last = recent
    .filter((entry) => entry.action === action && now - entry.at < REPORT.cooldown)
    .at(-1);
  return {
    waitMinutes: last ? Math.ceil((REPORT.cooldown - (now - last.at)) / 60) : 0,
    left: Math.max(0, REPORT.perWindow - recent.length),
  };
}

/** Einträge vom lokalen Kalendertag von `now` (Unix-Sekunden), neueste zuerst. */
export function todaysEntries(log: Entry[], now: number) {
  const day = new Date(now * 1000).toDateString();
  return log.filter((entry) => new Date(entry.at * 1000).toDateString() === day).reverse();
}
