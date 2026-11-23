import { describe, expect, it } from "vitest";

import {
  assetsFor,
  megabytes,
  parseRelease,
  offerFor,
  RELEASES_LATEST,
  type SiteRelease,
} from "./release.ts";

const BASE = "https://github.com/RaffaelSchaefer/jelly/releases/download/v0.4.0/";

const RELEASE: SiteRelease = {
  version: "0.4.0",
  published: "2026-11-22T23:17:37Z",
  page: "https://github.com/RaffaelSchaefer/jelly/releases/tag/v0.4.0",
  assets: [
    { kind: "linux-rpm", name: "a.rpm", url: `${BASE}a.rpm`, size: 9_988_835 },
    { kind: "linux-appimage", name: "a.AppImage", url: `${BASE}a.AppImage`, size: 88_242_680 },
    { kind: "macos-intel", name: "x64.dmg", url: `${BASE}x64.dmg`, size: 9_049_437 },
    { kind: "macos-arm", name: "arm.dmg", url: `${BASE}arm.dmg`, size: 8_671_880 },
  ],
};

describe("parseRelease", () => {
  it("accepts what the release script writes", () => {
    expect(parseRelease(JSON.parse(JSON.stringify(RELEASE)))).toEqual(RELEASE);
  });

  it("falls back to GitHub without data", () => {
    for (const data of [undefined, null, "kaputt", 42, {}]) {
      const release = parseRelease(data);
      expect(release.assets).toEqual([]);
      expect(release.page).toBe(RELEASES_LATEST);
      expect(release.version).toBeNull();
    }
  });

  it("drops unknown kinds and links that leave GitHub", () => {
    const release = parseRelease({
      ...RELEASE,
      page: "https://example.com/",
      assets: [
        ...RELEASE.assets,
        { kind: "solaris", name: "a", url: `${BASE}a`, size: 1 },
        { kind: "linux-deb", name: "b.deb", url: "https://example.com/b.deb", size: 1 },
        { kind: "linux-deb", name: "c.deb", url: `${BASE}c.deb` },
      ],
    });
    expect(release.assets).toHaveLength(4);
    expect(release.page).toBe(RELEASES_LATEST);
  });
});

describe("downloads per platform", () => {
  it("offers one file first and the rest of the system beside it", () => {
    const mac = offerFor(RELEASE, "macos");
    expect(mac.primary?.kind).toBe("macos-arm");
    expect(mac.others.map((asset) => asset.kind)).toEqual(["macos-intel"]);
    const linux = offerFor(RELEASE, "linux");
    expect(linux.primary?.kind).toBe("linux-appimage");
    expect(linux.others.map((asset) => asset.kind)).toEqual(["linux-rpm"]);
  });

  it("offers nothing for unknown devices or missing files", () => {
    expect(offerFor(RELEASE, "other")).toEqual({ primary: null, others: [] });
    expect(offerFor(RELEASE, "windows")).toEqual({ primary: null, others: [] });
  });

  it("lists the files of a system in a fixed order", () => {
    expect(assetsFor(RELEASE, "macos").map((asset) => asset.kind)).toEqual([
      "macos-arm",
      "macos-intel",
    ]);
    expect(assetsFor(RELEASE, "linux").map((asset) => asset.kind)).toEqual([
      "linux-appimage",
      "linux-rpm",
    ]);
    expect(assetsFor(RELEASE, "windows")).toEqual([]);
  });

  it("formats sizes for each language", () => {
    expect(megabytes(6_899_235, "de-DE")).toBe("6,9");
    expect(megabytes(88_242_680, "en-GB")).toBe("88.2");
  });
});
