/**
 * Das Release, wie `scripts/release.mjs` es beim Bauen schreibt, und was die Seite daraus anbietet.
 * Reine Funktionen ohne DOM.
 *
 * @module
 */

import type { Platform } from "../platform.ts";

/** Seite des neuesten Releases. Ziel aller Knöpfe, wenn die Dateien fehlen. */
export const RELEASES_LATEST = "https://github.com/RaffaelSchaefer/jelly/releases/latest";

/** Arten von Dateien, wie `scripts/assets.mjs` sie vergibt, in der Reihenfolge der Liste. */
export const ASSET_KINDS = [
  "windows-exe",
  "windows-msi",
  "macos-arm",
  "macos-intel",
  "linux-appimage",
  "linux-deb",
  "linux-rpm",
  "linux-arch",
] as const;

/** Art einer Datei. */
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Eine Datei zum Herunterladen. */
export interface SiteAsset {
  kind: AssetKind;
  name: string;
  url: string;
  /** Größe in Bytes. */
  size: number;
}

/** Was die Seite über das neueste Release weiß. */
export interface SiteRelease {
  /** Version ohne `v`, ohne Release `null`. */
  version: string | null;
  /** Zeitpunkt der Veröffentlichung als ISO-Text. */
  published: string | null;
  /** Seite des Releases auf GitHub. */
  page: string;
  assets: SiteAsset[];
}

/** Betriebssysteme mit Downloads, in der Reihenfolge der Liste. */
export const SYSTEMS = ["windows", "macos", "linux"] as const satisfies readonly Platform[];

/** Ein System mit Downloads. */
export type System = (typeof SYSTEMS)[number];

/** Ist `platform` ein System mit Downloads? */
export function isSystem(platform: Platform): platform is System {
  return platform !== "other";
}

/** Ein Release ohne Dateien. */
const EMPTY: SiteRelease = { version: null, published: null, page: RELEASES_LATEST, assets: [] };

/** Ist `value` eine bekannte Art? */
function isKind(value: unknown): value is AssetKind {
  return ASSET_KINDS.includes(value as AssetKind);
}

/** Ist `value` eine vollständige Datei mit Link zu GitHub? */
function isAsset(value: unknown): value is SiteAsset {
  if (typeof value !== "object" || value === null) return false;
  const asset = value as Record<string, unknown>;
  return (
    isKind(asset.kind) &&
    typeof asset.name === "string" &&
    typeof asset.url === "string" &&
    asset.url.startsWith("https://github.com/") &&
    typeof asset.size === "number"
  );
}

/** Text oder `null`. */
function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Prüft die geschriebenen Daten. Fehlt die Datei oder ist etwas kaputt, gibt es ein Release ohne
 * Dateien, und die Seite verlinkt GitHub.
 */
export function parseRelease(data: unknown): SiteRelease {
  if (typeof data !== "object" || data === null) return EMPTY;
  const raw = data as Record<string, unknown>;
  const page = textOrNull(raw.page);
  return {
    version: textOrNull(raw.version),
    published: textOrNull(raw.published),
    page: page?.startsWith("https://github.com/") ? page : RELEASES_LATEST,
    assets: Array.isArray(raw.assets) ? raw.assets.filter(isAsset) : [],
  };
}

/** Die Datei der Art `kind`, falls das Release sie hat. */
function assetOf(release: SiteRelease, kind: AssetKind): SiteAsset | undefined {
  return release.assets.find((asset) => asset.kind === kind);
}

/** Was die Seite einem System anbietet. */
export interface DownloadOffer {
  /** Die Datei für den großen Knopf, ohne System oder ohne Dateien keine. */
  primary: SiteAsset | null;
  /** Die übrigen Dateien desselben Systems, als kurze Liste unter dem Knopf. */
  others: SiteAsset[];
}

/**
 * Welche Datei vorn steht: die erste des Systems in der Reihenfolge von {@link ASSET_KINDS}, also
 * der Installer unter Windows, Apple Silicon unter macOS (seit Ende 2020 die meisten Macs, die
 * Architektur verrät der Browser nicht zuverlässig) und das AppImage unter Linux.
 */
export function offerFor(release: SiteRelease, platform: Platform): DownloadOffer {
  if (platform === "other") return { primary: null, others: [] };
  const [primary = null, ...others] = assetsFor(release, platform);
  return { primary, others };
}

/** Die Dateien eines Systems in der Reihenfolge der Liste. */
export function assetsFor(release: SiteRelease, system: Platform): SiteAsset[] {
  return ASSET_KINDS.filter((kind) => kind.startsWith(`${system}-`))
    .map((kind) => assetOf(release, kind))
    .filter((asset): asset is SiteAsset => asset !== undefined);
}

/** Größe in Megabyte mit einer Nachkommastelle, im Format der Sprache. */
export function megabytes(bytes: number, locale: string): string {
  return (bytes / 1_000_000).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
