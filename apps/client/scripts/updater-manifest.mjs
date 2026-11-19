/**
 * Schreibt `latest.json` für den Updater aus den Bundles eines Release-Laufs.
 *
 * Aufruf: `node scripts/updater-manifest.mjs <Ordner> <Tag> <owner/repo> [CHANGELOG.md]`, die Liste
 * geht nach stdout. Der Ordner enthält die Bundles samt `.sig` beliebig tief. Ein Bundle ohne
 * `.sig` fehlt in der Liste: Der Updater prüft die ganze Datei, ein Eintrag ohne Signatur machte
 * alle Plattformen kaputt.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Welche Plattform-Schlüssel ein Bundle bedient. Zuerst der mit Installer-Art, den das Plugin
 * bevorzugt, dann der allgemeine als Rückfall für Apps, die ihre Art nicht kennen. Linux bekommt
 * keinen: Fehlte die Signatur einer `.deb`, nähme die App sonst das AppImage, und das scheitert.
 */
const PLATFORMS = [
  { suffix: "-setup.exe", keys: ["windows-x86_64-nsis", "windows-x86_64"] },
  { suffix: ".msi", keys: ["windows-x86_64-msi"] },
  { suffix: ".AppImage", keys: ["linux-x86_64-appimage"] },
  { suffix: ".deb", keys: ["linux-x86_64-deb"] },
  { suffix: ".rpm", keys: ["linux-x86_64-rpm"] },
  { suffix: "_aarch64.app.tar.gz", keys: ["darwin-aarch64-app", "darwin-aarch64"] },
  { suffix: "_x86_64.app.tar.gz", keys: ["darwin-x86_64-app", "darwin-x86_64"] },
];

/**
 * Baut den Inhalt von `latest.json`.
 *
 * @param {{ name: string; signature: string }[]} bundles Dateiname des Bundles und Inhalt seiner
 *   `.sig`.
 * @param {{ tag: string; repo: string; notes?: string; date?: Date }} release Git-Tag (`v0.3.0`),
 *   `owner/repo` auf GitHub, die `CHANGELOG.md` für den Update-Hinweis und der Zeitpunkt, für Tests
 *   überschreibbar.
 */
export function updaterManifest(bundles, { tag, repo, notes, date = new Date() }) {
  const platforms = {};
  for (const { name, signature } of bundles) {
    const platform = PLATFORMS.find(({ suffix }) => name.endsWith(suffix));
    if (!platform) continue;
    const url = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
    for (const key of platform.keys) platforms[key] = { signature: signature.trim(), url };
  }
  if (Object.keys(platforms).length === 0) throw new Error("Kein signiertes Bundle gefunden.");
  return { version: tag.replace(/^v/, ""), notes, pub_date: date.toISOString(), platforms };
}

/** Alle Bundles unter `directory`, die eine `.sig` neben sich haben. */
async function signedBundles(directory) {
  const files = await readdir(directory, { recursive: true });
  const signatures = files.filter((file) => file.endsWith(".sig"));
  return Promise.all(
    signatures.map(async (file) => ({
      name: basename(file, ".sig"),
      signature: await readFile(join(directory, file), "utf8"),
    })),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [directory, tag, repo, changelog] = process.argv.slice(2);
  const notes = changelog ? await readFile(changelog, "utf8") : undefined;
  const manifest = updaterManifest(await signedBundles(directory), { tag, repo, notes });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
