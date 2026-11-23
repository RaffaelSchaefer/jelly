/**
 * Einstieg der Website: Sprache, Downloads, Wahl des Betriebssystems und das 3D-Jelly oben. Alles
 * außer dem Jelly läuft sofort, das Jelly kommt nach.
 *
 * @module
 */

import "./styles/index.css";
import { RELEASE } from "./downloads/data.ts";
import { isSystem, type System } from "./downloads/release.ts";
import { renderDownloads } from "./downloads/render.ts";
import { labelSwatches, startHero } from "./hero/index.ts";
import { language, onLanguage, startLanguage } from "./i18n/apply.ts";
import { detectPlatform, readPlatformHints } from "./platform.ts";
import { startSystemTabs } from "./tabs.ts";

const platform = detectPlatform(readPlatformHints());
// Handys und Unbekanntes sehen zuerst Windows, die anderen Systeme stehen daneben.
let system: System = isSystem(platform) ? platform : "windows";

startLanguage();
startSystemTabs(system, (next) => {
  system = next;
  renderDownloads(RELEASE, { platform, system }, language());
});
onLanguage((lang) => {
  renderDownloads(RELEASE, { platform, system }, lang);
  labelSwatches(lang);
});
startHero(language);
