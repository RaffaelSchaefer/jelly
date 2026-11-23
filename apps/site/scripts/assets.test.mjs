import { describe, expect, it } from "vitest";

import { ASSET_KINDS, RELEASES_LATEST as PAGE_FALLBACK } from "../src/downloads/release.ts";
import { classifyAsset, fallbackRelease, RELEASES_LATEST, toSiteRelease } from "./assets.mjs";

const url = (name) => `https://github.com/RaffaelSchaefer/jelly/releases/download/v0.4.0/${name}`;
const asset = (name, size = 1000) => ({ name, size, browser_download_url: url(name) });

/** Die Dateien von v0.4.0, wie sie am Release stehen. */
const V040 = [
  "Jelly-0.4.0-1.x86_64.rpm",
  "jelly-bin-0.4.0-1-x86_64.pkg.tar.zst",
  "Jelly_0.4.0_aarch64.dmg",
  "Jelly_0.4.0_amd64.AppImage",
  "Jelly_0.4.0_amd64.deb",
  "Jelly_0.4.0_x64-setup.exe",
  "Jelly_0.4.0_x64.dmg",
  "Jelly_0.4.0_x64_en-US.msi",
  "Jelly_aarch64.app.tar.gz",
  "Jelly_x86_64.app.tar.gz",
  "latest.json",
];

describe("classifyAsset", () => {
  it("maps every installer of v0.4.0 to its kind", () => {
    expect(classifyAsset("Jelly_0.4.0_x64-setup.exe")).toBe("windows-exe");
    expect(classifyAsset("Jelly_0.4.0_x64_en-US.msi")).toBe("windows-msi");
    expect(classifyAsset("Jelly_0.4.0_aarch64.dmg")).toBe("macos-arm");
    expect(classifyAsset("Jelly_0.4.0_x64.dmg")).toBe("macos-intel");
    expect(classifyAsset("Jelly_0.4.0_amd64.AppImage")).toBe("linux-appimage");
    expect(classifyAsset("Jelly_0.4.0_amd64.deb")).toBe("linux-deb");
    expect(classifyAsset("Jelly-0.4.0-1.x86_64.rpm")).toBe("linux-rpm");
    expect(classifyAsset("jelly-bin-0.4.0-1-x86_64.pkg.tar.zst")).toBe("linux-arch");
  });

  it("matches later versions by pattern", () => {
    expect(classifyAsset("Jelly_1.12.0_x64-setup.exe")).toBe("windows-exe");
    expect(classifyAsset("jelly-bin-1.12.0-3-x86_64.pkg.tar.zst")).toBe("linux-arch");
  });

  it("ignores update bundles, signatures, the manifest and other architectures", () => {
    for (const name of [
      "latest.json",
      "Jelly_aarch64.app.tar.gz",
      "Jelly_x86_64.app.tar.gz",
      "Jelly_x86_64.app.tar.gz.sig",
      "Jelly_0.4.0_amd64.AppImage.sig",
      "Jelly_0.4.0_x64-setup.exe.sig",
      "Jelly_0.5.0_arm64-setup.exe",
      "Jelly_0.5.0_arm64.deb",
      "Jelly-0.5.0-1.aarch64.rpm",
    ]) {
      expect(classifyAsset(name), name).toBeNull();
    }
  });

  it("only hands out kinds the page knows", () => {
    const kinds = V040.map(classifyAsset).filter(Boolean);
    expect(kinds.toSorted()).toEqual([...ASSET_KINDS].toSorted());
  });
});

describe("toSiteRelease", () => {
  it("keeps version, page and one file per kind", () => {
    const release = toSiteRelease({
      tag_name: "v0.4.0",
      html_url: "https://github.com/RaffaelSchaefer/jelly/releases/tag/v0.4.0",
      published_at: "2026-11-22T23:17:37Z",
      assets: [...V040.map((name) => asset(name)), asset("Jelly_0.4.0_x86_64-setup.exe", 5)],
    });
    expect(release.version).toBe("0.4.0");
    expect(release.page).toBe("https://github.com/RaffaelSchaefer/jelly/releases/tag/v0.4.0");
    expect(release.published).toBe("2026-11-22T23:17:37Z");
    expect(release.assets).toHaveLength(8);
    const exe = release.assets.find((item) => item.kind === "windows-exe");
    expect(exe).toEqual({
      kind: "windows-exe",
      name: "Jelly_0.4.0_x64-setup.exe",
      url: url("Jelly_0.4.0_x64-setup.exe"),
      size: 1000,
    });
  });

  it("falls back to the releases page without data", () => {
    expect(toSiteRelease({})).toEqual(fallbackRelease());
    expect(fallbackRelease().page).toBe(RELEASES_LATEST);
    expect(RELEASES_LATEST).toBe(PAGE_FALLBACK);
  });
});
