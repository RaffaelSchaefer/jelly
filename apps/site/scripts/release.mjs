/**
 * Holt beim Bauen das neueste Release von GitHub und schreibt `src/generated/release.json`.
 *
 * Im Browser ginge das nicht: Ohne Anmeldung erlaubt die API 60 Anfragen pro Stunde und Adresse,
 * und auf der LAN teilen sich alle eine. Ein Token aus `GH_TOKEN` oder `GITHUB_TOKEN` hebt die
 * Grenze für den Bau. Scheitert die Anfrage, schreibt das Skript Daten ohne Dateien, die Seite
 * verlinkt dann die Release-Seite. Der Bau bricht daran nie ab.
 *
 * @module
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fallbackRelease, toSiteRelease } from "./assets.mjs";

const API = "https://api.github.com/repos/RaffaelSchaefer/jelly/releases/latest";
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../src/generated/release.json");
const TIMEOUT_MS = 10_000;

/** Kopfzeilen der Anfrage, mit Token, wenn eines gesetzt ist. */
function headers() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "jelly-site-build",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Fragt GitHub nach dem neuesten Release. Wirft bei Netz- und HTTP-Fehlern. */
async function fetchLatest() {
  const response = await fetch(API, {
    headers: headers(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub antwortet mit ${response.status}`);
  return toSiteRelease(await response.json());
}

/** Holt das Release, fällt bei jedem Fehler auf die Release-Seite zurück und schreibt die Datei. */
async function main() {
  let release;
  try {
    release = await fetchLatest();
    console.log(`release: ${release.version ?? "?"} mit ${release.assets.length} Downloads`);
  } catch (error) {
    console.warn(`release: kein Release geladen (${String(error)}), Seite verlinkt GitHub`);
    release = fallbackRelease();
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(release, null, 2)}\n`);
}

await main();
