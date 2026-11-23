/**
 * Das beim Bauen geholte Release. Die Datei ist nicht im Repository: Fehlt sie (Tests, Typprüfung
 * vor dem ersten Bau), liefert `import.meta.glob` nichts, und die Seite verlinkt GitHub.
 *
 * @module
 */

import { parseRelease, type SiteRelease } from "./release.ts";

const files = import.meta.glob<unknown>("../generated/release.json", {
  eager: true,
  import: "default",
});

/** Das neueste Release, so wie es beim Bauen auf GitHub stand. */
export const RELEASE: SiteRelease = parseRelease(Object.values(files)[0]);
