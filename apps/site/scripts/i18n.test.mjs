import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EN } from "../src/i18n/en.ts";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** Alle Schlüssel aus `data-i18n` und `data-i18n-attrs` in `index.html`. */
function keysInHtml() {
  const content = [...HTML.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
  const attrs = [...HTML.matchAll(/data-i18n-attrs="([^"]+)"/g)].flatMap((match) =>
    match[1].split(";").map((pair) => pair.split(":")[1].trim()),
  );
  return new Set([...content, ...attrs]);
}

describe("translations", () => {
  it("has an English text for every key in the page", () => {
    const missing = [...keysInHtml()].filter((key) => !(key in EN));
    expect(missing).toEqual([]);
  });

  it("has no English text without a place in the page", () => {
    const used = keysInHtml();
    expect(Object.keys(EN).filter((key) => !used.has(key))).toEqual([]);
  });

  it("never shows a join code", () => {
    expect(HTML).not.toMatch(/falsch|offen\b/);
  });
});
