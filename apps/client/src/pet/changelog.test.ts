import { describe, expect, it } from "vitest";

import { changelogSince, isNewerVersion } from "./changelog";

const NOTES = `# Changelog

Einleitung, die niemand zeigt.

## 0.4.0

- Neu: Raketen
- Besser: Karte schneller

## 0.3.0

- Weg: alter Einstieg
- Ohne Art

## 0.2.0

- Neu: schon installiert
`;

describe("changelog", () => {
  it("keeps every version after the installed one, newest first", () => {
    expect(changelogSince(NOTES, "0.2.0")).toEqual([
      { version: "0.4.0", kind: "neu", text: "Raketen" },
      { version: "0.4.0", kind: "besser", text: "Karte schneller" },
      { version: "0.3.0", kind: "weg", text: "alter Einstieg" },
      { version: "0.3.0", kind: null, text: "Ohne Art" },
    ]);
  });

  it("shows nothing without notes or newer versions", () => {
    expect(changelogSince(null, "0.2.0")).toEqual([]);
    expect(changelogSince(NOTES, "0.4.0")).toEqual([]);
  });

  it("compares versions part by part as numbers", () => {
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
    expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("0.3.0-alpha.1", "0.2.9")).toBe(true);
    expect(isNewerVersion("0.2.0", "0.2.0")).toBe(false);
  });
});
