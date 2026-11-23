/**
 * Ordnet die Dateien eines GitHub-Releases den Download-Knöpfen der Seite zu. Reine Funktionen,
 * `release.mjs` holt die Daten und schreibt das Ergebnis.
 *
 * @module
 */

/** Seite des neuesten Releases. Ziel aller Knöpfe, wenn die Dateien fehlen. */
export const RELEASES_LATEST = "https://github.com/RaffaelSchaefer/jelly/releases/latest";

/**
 * Muster je Art der Datei, geprüft am Ende des Namens. Die Architektur steht mit im Muster:
 * `x86_64` allein träfe auch rpm, das Arch-Paket und die Update-Bundles für macOS, und ein späteres
 * arm64-Paket soll keinen x64-Platz belegen.
 */
const PATTERNS = [
  ["windows-exe", /_(x64|x86_64)-setup\.exe$/i],
  ["windows-msi", /_(x64|x86_64)(_[a-z]{2}-[a-z]{2})?\.msi$/i],
  ["macos-arm", /_(aarch64|arm64)\.dmg$/i],
  ["macos-intel", /_(x64|x86_64)\.dmg$/i],
  ["linux-appimage", /_(amd64|x86_64)\.AppImage$/i],
  ["linux-deb", /_amd64\.deb$/i],
  ["linux-rpm", /\.x86_64\.rpm$/i],
  ["linux-arch", /-x86_64\.pkg\.tar\.zst$/i],
];

/**
 * Art einer Release-Datei oder `null` für alles, was die Seite nicht anbietet (`latest.json`,
 * `*.app.tar.gz`, Signaturen).
 *
 * @param {string} name - Dateiname wie in der Liste des Releases.
 * @returns {string | null}
 */
export function classifyAsset(name) {
  const match = PATTERNS.find(([, pattern]) => pattern.test(name));
  return match ? match[0] : null;
}

/**
 * Macht aus der Antwort von `GET /repos/{owner}/{repo}/releases/latest` die Daten der Seite. Je Art
 * gilt die erste passende Datei.
 *
 * @param {{
 *   tag_name?: string;
 *   html_url?: string;
 *   published_at?: string;
 *   assets?: { name: string; browser_download_url: string; size: number }[];
 * }} release
 */
export function toSiteRelease(release) {
  const assets = [];
  for (const asset of release.assets ?? []) {
    const kind = classifyAsset(asset.name);
    if (!kind || assets.some((known) => known.kind === kind)) continue;
    assets.push({ kind, name: asset.name, url: asset.browser_download_url, size: asset.size });
  }
  const tag = release.tag_name ?? null;
  return {
    version: tag ? tag.replace(/^v/, "") : null,
    published: release.published_at ?? null,
    page: release.html_url ?? RELEASES_LATEST,
    assets,
  };
}

/** Daten der Seite ohne Release: Alle Knöpfe führen zur Release-Seite auf GitHub. */
export function fallbackRelease() {
  return { version: null, published: null, page: RELEASES_LATEST, assets: [] };
}
