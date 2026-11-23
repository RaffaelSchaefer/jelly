/**
 * Schaltet die Sprache der Seite um. Feste Texte tragen `data-i18n` (Inhalt) oder `data-i18n-attrs`
 * (`attribut:schlüssel`, mehrere mit Semikolon). Deutsch steht im Dokument und wird beim ersten
 * Wechsel gemerkt, Englisch kommt aus `en.ts`. Was das Skript selbst schreibt, hört über
 * {@link onLanguage} mit.
 *
 * @module
 */

import { EN } from "./en.ts";
import {
  browserLanguages,
  pickLanguage,
  readStoredLanguage,
  storeLanguage,
  type Lang,
} from "./lang.ts";
import { t } from "./text.ts";

/** Die deutschen Inhalte aus dem Dokument, je Element. */
const originalHtml = new WeakMap<Element, string>();
/** Die deutschen Attribute aus dem Dokument, je Element und Attribut. */
const originalAttrs = new WeakMap<Element, Map<string, string>>();
/** Wer bei einem Wechsel neu schreiben muss. */
const listeners = new Set<(lang: Lang) => void>();

let current: Lang = "de";

/** Die aktuelle Sprache. */
export function language(): Lang {
  return current;
}

/** Ruft `listener` sofort und nach jedem Wechsel mit der Sprache. */
export function onLanguage(listener: (lang: Lang) => void): void {
  listeners.add(listener);
  listener(current);
}

/** Liest `attribut:schlüssel;…` aus `data-i18n-attrs`. */
function attrPairs(element: Element): [string, string][] {
  const spec = element.getAttribute("data-i18n-attrs") ?? "";
  return spec
    .split(";")
    .map((pair) => pair.split(":").map((part) => part.trim()))
    .filter((pair): pair is [string, string] => pair.length === 2 && Boolean(pair[0] && pair[1]));
}

/** Setzt den Inhalt eines Elements mit `data-i18n`. */
function translateContent(element: Element, lang: Lang) {
  if (!originalHtml.has(element)) originalHtml.set(element, element.innerHTML);
  const key = element.getAttribute("data-i18n") ?? "";
  const english = EN[key];
  element.innerHTML = lang === "en" && english ? english : (originalHtml.get(element) ?? "");
}

/** Setzt die Attribute eines Elements mit `data-i18n-attrs`. */
function translateAttrs(element: Element, lang: Lang) {
  const saved = originalAttrs.get(element) ?? new Map<string, string>();
  originalAttrs.set(element, saved);
  for (const [attr, key] of attrPairs(element)) {
    if (!saved.has(attr)) saved.set(attr, element.getAttribute(attr) ?? "");
    const english = EN[key];
    element.setAttribute(attr, lang === "en" && english ? english : (saved.get(attr) ?? ""));
  }
}

/** Die Sprachschalter der Seite, oben und im Fuß. */
function toggles() {
  return document.querySelectorAll<HTMLElement>("[data-lang-toggle]");
}

/** Hebt im Schalter die aktuelle Sprache hervor. Sein Name für Vorleser nennt die andere. */
function labelToggle(toggle: HTMLElement, lang: Lang) {
  toggle.setAttribute("aria-label", t(lang, "lang.switchLabel"));
  for (const code of toggle.querySelectorAll<HTMLElement>("[data-lang]")) {
    code.toggleAttribute("data-current", code.dataset.lang === lang);
  }
}

/** Zeigt die Seite in `lang`. */
function setLanguage(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  for (const element of document.querySelectorAll("[data-i18n]")) translateContent(element, lang);
  for (const element of document.querySelectorAll("[data-i18n-attrs]")) {
    translateAttrs(element, lang);
  }
  for (const toggle of toggles()) labelToggle(toggle, lang);
  for (const listener of listeners) listener(lang);
}

/** Wählt die Startsprache und verdrahtet die Schalter. */
export function startLanguage(): void {
  setLanguage(pickLanguage(readStoredLanguage(), browserLanguages()));
  for (const toggle of toggles()) {
    toggle.addEventListener("click", () => {
      const next = current === "de" ? "en" : "de";
      storeLanguage(next);
      setLanguage(next);
    });
  }
}
