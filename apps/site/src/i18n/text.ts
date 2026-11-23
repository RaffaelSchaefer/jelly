/**
 * Texte, die das Skript selbst schreibt: Downloads, Farben, Sprachschalter. Feste Texte der Seite
 * stehen in `index.html` und `en.ts`.
 *
 * @module
 */

import type { Lang } from "./lang.ts";

/** Die deutschen Texte. Ihre Schlüssel gelten für alle Sprachen. */
const DE = {
  "dl.windows": "Für Windows herunterladen",
  "dl.macos": "Für macOS herunterladen",
  "dl.linux": "Für Linux herunterladen",
  "dl.github": "Zu den Downloads auf GitHub",
  "dl.altWindows": "Lieber ein MSI-Paket?",
  "dl.altMacos": "Mac mit Intel-Chip?",
  "dl.altLinux": "Lieber ein Paket für deine Distribution?",
  "dl.macHint": "Welcher Chip drinsteckt, zeigt Apple-Menü › Über diesen Mac.",
  "dl.otherOs": "Jelly läuft auf Windows, macOS und Linux. Öffne diese Seite am Rechner.",
  "dl.version": "Version {version} vom {date}, kostenlos.",
  "dl.noVersion": "Kostenlos für Windows, macOS und Linux.",
  "dl.size": "{size} MB",
  "dl.release": "Version {version}",
  "dl.releases": "Alle Versionen",
  "kind.windows-exe": "Installer (.exe)",
  "kind.windows-msi": "MSI-Paket (.msi)",
  "kind.macos-arm": "Apple Silicon (.dmg)",
  "kind.macos-intel": "Intel (.dmg)",
  "kind.linux-appimage": "AppImage",
  "kind.linux-deb": "Debian, Ubuntu (.deb)",
  "kind.linux-rpm": "Fedora, openSUSE (.rpm)",
  "kind.linux-arch": "Arch Linux (.pkg.tar.zst)",
  "lang.switchLabel": "Switch to English",
  "color.mint": "Aqua",
  "color.sky": "Himmelblau",
  "color.violet": "Lila",
  "color.rose": "Rosa",
  "color.tangerine": "Orange",
  "color.clover": "Grün",
} as const;

/** Schlüssel eines Textes. */
export type TextKey = keyof typeof DE;

/** Die englischen Texte, Schlüssel für Schlüssel. */
const EN_TEXT: Record<TextKey, string> = {
  "dl.windows": "Download for Windows",
  "dl.macos": "Download for macOS",
  "dl.linux": "Download for Linux",
  "dl.github": "Downloads on GitHub",
  "dl.altWindows": "Prefer an MSI package?",
  "dl.altMacos": "Mac with an Intel chip?",
  "dl.altLinux": "Prefer a package for your distribution?",
  "dl.macHint": "Apple menu › About This Mac shows which chip is inside.",
  "dl.otherOs": "Jelly runs on Windows, macOS and Linux. Open this page on your computer.",
  "dl.version": "Version {version} from {date}, free.",
  "dl.noVersion": "Free for Windows, macOS and Linux.",
  "dl.size": "{size} MB",
  "dl.release": "Version {version}",
  "dl.releases": "All versions",
  "kind.windows-exe": "Installer (.exe)",
  "kind.windows-msi": "MSI package (.msi)",
  "kind.macos-arm": "Apple Silicon (.dmg)",
  "kind.macos-intel": "Intel (.dmg)",
  "kind.linux-appimage": "AppImage",
  "kind.linux-deb": "Debian, Ubuntu (.deb)",
  "kind.linux-rpm": "Fedora, openSUSE (.rpm)",
  "kind.linux-arch": "Arch Linux (.pkg.tar.zst)",
  "lang.switchLabel": "Auf Deutsch umschalten",
  "color.mint": "Aqua",
  "color.sky": "Sky blue",
  "color.violet": "Purple",
  "color.rose": "Pink",
  "color.tangerine": "Orange",
  "color.clover": "Green",
};

/** Alle Texte je Sprache. */
const TEXT: Record<Lang, Record<TextKey, string>> = { de: DE, en: EN_TEXT };

/**
 * Text `key` in `lang`, Platzhalter wie `{version}` aus `values` ersetzt.
 *
 * @param values - Werte der Platzhalter. Fehlende bleiben stehen.
 */
export function t(lang: Lang, key: TextKey, values: Record<string, string> = {}): string {
  return TEXT[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
}
