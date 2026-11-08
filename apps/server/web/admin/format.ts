/**
 * Turns values of the API into text and back. Pure functions, without DOM.
 *
 * @module
 */

const SLUG_LETTERS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

/** Formats a time of the API for reading, in the time zone of this browser. */
export function formatDateTime(millis: number): string {
  return dateFormat.format(millis);
}

/** Reads the value of a date and time input. Empty or broken input gives `NaN`. */
export function readLocalDateTime(value: string): number {
  return new Date(value).getTime();
}

/** Writes a time of the API as the value of a date and time input, in this browser's time zone. */
export function toLocalDateTimeValue(millis: number): string {
  const offsetMillis = new Date(millis).getTimezoneOffset() * 60_000;
  return new Date(millis - offsetMillis).toISOString().slice(0, 16);
}

/** Says whether the browser knows a time zone like `Europe/Berlin`. */
export function isTimeZoneKnown(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("de-DE", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Suggests a short name for addresses: `LAN Herbst 2026` gives `lan-herbst-2026`. */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (letter) => SLUG_LETTERS[letter] ?? "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Where a LAN stands in time. */
export type LANPhase = "running" | "upcoming" | "past";

/** Finds out where a LAN stands at a given time. */
export function findLANPhase(lan: { starts_at: number; ends_at: number }, now: number): LANPhase {
  if (now < lan.starts_at) {
    return "upcoming";
  }
  return now < lan.ends_at ? "running" : "past";
}

/** Names a phase for the page. */
export function nameLANPhase(phase: LANPhase): string {
  const names: Record<LANPhase, string> = {
    running: "läuft",
    upcoming: "kommt noch",
    past: "vorbei",
  };
  return names[phase];
}
