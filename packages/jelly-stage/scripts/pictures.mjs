/**
 * Writes `src/newsPictureData.ts` from the pictures in `art/news`: every picture of the Jelly-News
 * as a data URL. So the server page (esbuild) and the app (Vite) bundle them without a loader of
 * their own, and the app needs no request its CSP would refuse. Beside it `src/newsTestCardData.ts`
 * from `art/backdrops/testcard.webp`, the test card of the stage screens. Run with `pnpm pictures`
 * after a picture changed. `--check` only reports whether both files are up to date, for the test.
 *
 * @module
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NEWS_PICTURES } from "../src/newsLines.ts";

const ART = new URL("../art/news/", import.meta.url);
const TARGET = new URL("../src/newsPictureData.ts", import.meta.url);
const HEAD = `/**
 * The pictures of the Jelly-News as data URLs. Written by \`pnpm pictures\` from \`art/news\`, do not
 * edit by hand. A picture without a file is missing here, its report shows the drawn card instead.
 *
 * @module
 */

import type { NewsPicture } from "./newsLines.ts";

/** The pictures by their key. */
export const NEWS_PICTURE_DATA: Partial<Record<NewsPicture, string>> = {
`;
const TEST_CARD = new URL("../art/backdrops/testcard.webp", import.meta.url);
const TEST_CARD_TARGET = new URL("../src/newsTestCardData.ts", import.meta.url);
const TEST_CARD_HEAD = `/**
 * The test card of the stage screens as a data URL. Written by \`pnpm pictures\` from
 * \`art/backdrops/testcard.webp\`, do not edit by hand. Without the file it is null, and the screens
 * keep their equalizer between broadcasts.
 *
 * @module
 */

/** The test card. */
export const NEWS_TEST_CARD_DATA: string | null = `;

/** Returns the module text for the pictures that exist. */
export function writePictureModule() {
  const lines = NEWS_PICTURES.flatMap((key) => {
    const file = new URL(`${key}.webp`, ART);
    if (!existsSync(file)) return [];
    return [`  "${key}": "data:image/webp;base64,${readFileSync(file).toString("base64")}",\n`];
  });
  return `${HEAD}${lines.join("")}};\n`;
}

/** Returns the module text for the test card, null in it when there is no file. */
export function writeTestCardModule() {
  const data = existsSync(TEST_CARD)
    ? `"data:image/webp;base64,${readFileSync(TEST_CARD).toString("base64")}"`
    : "null";
  return `${TEST_CARD_HEAD}${data};\n`;
}

/** Reports whether a module on disk says exactly what it should. */
function isCurrent(target, text) {
  return existsSync(target) && readFileSync(target, "utf8") === text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = writePictureModule();
  const testCard = writeTestCardModule();
  if (process.argv.includes("--check")) {
    process.exit(isCurrent(TARGET, text) && isCurrent(TEST_CARD_TARGET, testCard) ? 0 : 1);
  }
  writeFileSync(TARGET, text);
  writeFileSync(TEST_CARD_TARGET, testCard);
  console.log(`${text.split("\n").length - HEAD.split("\n").length - 1} pictures, ${text.length} bytes`);
  console.log(`test card: ${testCard.length} bytes`);
}
