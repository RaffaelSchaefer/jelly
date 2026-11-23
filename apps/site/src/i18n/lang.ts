/**
 * Welche Sprache die Seite spricht: gemerkt im Browser, sonst aus den Spracheinstellungen. Deutsch
 * ist der Standard, Englisch gibt es auf Wunsch.
 *
 * @module
 */

/** Eine Sprache der Seite. */
export type Lang = "de" | "en";

/** Schlüssel im `localStorage`. */
const STORAGE_KEY = "jelly-site-lang";

/** Ist `value` eine Sprache der Seite? */
function isLang(value: unknown): value is Lang {
  return value === "de" || value === "en";
}

/**
 * Wählt die Sprache. Eine gemerkte Wahl gilt immer. Sonst Deutsch, sobald der Browser Deutsch
 * irgendwo in seiner Liste hat, denn auf der LAN stellen viele ihren Browser auf Englisch und lesen
 * trotzdem lieber Deutsch. Englisch nur, wenn er eine Liste ohne Deutsch hat.
 *
 * @param stored - Gemerkte Wahl, beliebiger Inhalt.
 * @param languages - Sprachen des Browsers in seiner Reihenfolge, etwa `navigator.languages`.
 */
export function pickLanguage(stored: unknown, languages: readonly string[]): Lang {
  if (isLang(stored)) return stored;
  if (languages.length === 0) return "de";
  return languages.some((code) => code.toLowerCase().startsWith("de")) ? "de" : "en";
}

/** Liest die gemerkte Wahl. Ohne Speicher (privates Fenster, gesperrt) kommt `null`. */
export function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Merkt sich die Wahl. Ohne Speicher gilt sie nur bis zum Neuladen. */
export function storeLanguage(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Kein Speicher: Die Wahl gilt dann nur auf dieser Seite.
  }
}

/** Sprachen des Browsers, ältere Browser kennen nur `navigator.language`. */
export function browserLanguages(): readonly string[] {
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}
