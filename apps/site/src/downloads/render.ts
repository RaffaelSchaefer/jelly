/**
 * Schreibt die Downloads in die Seite: den einen Knopf für das gewählte System, darunter seine
 * übrigen Dateien als kurze Liste, dazu die Version oben im Abschnitt und im Fuß. Neu bei jedem
 * Wechsel von System oder Sprache.
 *
 * @module
 */

import type { Lang } from "../i18n/lang.ts";
import type { Platform } from "../platform.ts";

import { t, type TextKey } from "../i18n/text.ts";
import {
  megabytes,
  offerFor,
  type DownloadOffer,
  type SiteAsset,
  type SiteRelease,
  type System,
} from "./release.ts";

/** Für wen die Seite gerade schreibt. */
export interface DownloadView {
  /** Was der Browser über das Gerät verrät. */
  platform: Platform;
  /** Das System, dessen Reiter offen ist. */
  system: System;
}

/** Gebietsschema für Zahlen und Datum je Sprache. */
const LOCALE: Record<Lang, string> = { de: "de-DE", en: "en-GB" };

/** Beschriftung des großen Knopfs je System. */
const BUTTON_LABEL: Record<System, TextKey> = {
  windows: "dl.windows",
  macos: "dl.macos",
  linux: "dl.linux",
};

/** Frage vor den übrigen Dateien je System. */
const ALT_LABEL: Record<System, TextKey> = {
  windows: "dl.altWindows",
  macos: "dl.altMacos",
  linux: "dl.altLinux",
};

/** Pfeil nach unten auf eine Linie, im Strich der App-Icons. */
const ARROW = "M12 4v11m-5-5 5 5 5-5M5 20h14";

/** Baut ein Element mit Klasse und Text. */
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Ein Strich-Icon im 24er-Raster wie in der App. */
function strokeIcon(path: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
  line.setAttribute("d", path);
  svg.append(line);
  return svg;
}

/** Größe einer Datei als Text. */
function sizeOf(asset: SiteAsset, lang: Lang) {
  return t(lang, "dl.size", { size: megabytes(asset.size, LOCALE[lang]) });
}

/** Der große Knopf: Titel mit System, darunter Art und Größe der Datei. */
function primaryButton(asset: SiteAsset, system: System, lang: Lang) {
  const link = element("a", "button button-primary button-download");
  link.href = asset.url;
  const text = element("span", "button-text");
  text.append(
    element("span", "button-title", t(lang, BUTTON_LABEL[system])),
    element("span", "button-sub", `${t(lang, `kind.${asset.kind}`)} · ${sizeOf(asset, lang)}`),
  );
  link.append(strokeIcon(ARROW), text);
  return link;
}

/** Der Knopf zur Release-Seite, wenn Dateien fehlen. */
function githubButton(release: SiteRelease, lang: Lang) {
  const link = element("a", "button button-primary", t(lang, "dl.github"));
  link.href = release.page;
  return link;
}

/** Die übrigen Dateien des Systems unter einer Frage, unter macOS mit Hilfe zum Chip. */
function altList(offer: DownloadOffer, system: System, lang: Lang): Node[] {
  const list = element("ul", "download-others");
  for (const asset of offer.others) {
    const link = element("a", "", t(lang, `kind.${asset.kind}`));
    link.href = asset.url;
    const item = element("li");
    item.append(link, element("span", "download-size", sizeOf(asset, lang)));
    list.append(item);
  }
  const nodes: Node[] = [element("p", "", t(lang, ALT_LABEL[system])), list];
  if (system === "macos") nodes.push(element("p", "download-hint", t(lang, "dl.macHint")));
  return nodes;
}

/** Die Zeile mit Version und Datum. */
function versionLine(release: SiteRelease, lang: Lang) {
  if (!release.version || !release.published) return t(lang, "dl.noVersion");
  const date = new Date(release.published).toLocaleDateString(LOCALE[lang], { dateStyle: "long" });
  return t(lang, "dl.version", { version: release.version, date });
}

/** Knopf und übrige Dateien für das gewählte System. */
function renderOffer(release: SiteRelease, view: DownloadView, lang: Lang) {
  const offer = offerFor(release, view.system);
  const button = offer.primary
    ? primaryButton(offer.primary, view.system, lang)
    : githubButton(release, lang);
  document.getElementById("download-primary")!.replaceChildren(button);
  const notes: Node[] = offer.others.length > 0 ? altList(offer, view.system, lang) : [];
  // Handys und Tablets können Jelly nicht starten, die Dateien bleiben trotzdem erreichbar.
  if (view.platform === "other") notes.push(element("p", "download-hint", t(lang, "dl.otherOs")));
  const alt = document.getElementById("download-alt")!;
  alt.replaceChildren(...notes);
  alt.hidden = notes.length === 0;
}

/** Die Version im Fuß, verlinkt auf ihr Release. */
function renderFooterVersion(release: SiteRelease, lang: Lang) {
  const link = document.getElementById("footer-release");
  if (!(link instanceof HTMLAnchorElement)) return;
  link.href = release.page;
  link.textContent = release.version
    ? t(lang, "dl.release", { version: release.version })
    : t(lang, "dl.releases");
}

/** Schreibt alle Downloads für `view` in `lang`. */
export function renderDownloads(release: SiteRelease, view: DownloadView, lang: Lang): void {
  document.getElementById("download-version")!.textContent = versionLine(release, lang);
  renderOffer(release, view, lang);
  renderFooterVersion(release, lang);
}
