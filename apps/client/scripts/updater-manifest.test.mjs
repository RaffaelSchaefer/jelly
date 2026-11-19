import { describe, expect, it } from "vitest";

import { updaterManifest } from "./updater-manifest.mjs";

const DATE = new Date("2026-11-19T12:00:00Z");
const url = (name) => `https://github.com/o/r/releases/download/v0.3.0/${name}`;

describe("updater manifest", () => {
  it("maps every bundle to its installer key and the plain fallback", () => {
    const manifest = updaterManifest(
      [
        { name: "Jelly_0.3.0_x64-setup.exe", signature: "nsis\n" },
        { name: "Jelly_0.3.0_x64_en-US.msi", signature: "msi" },
        { name: "Jelly_0.3.0_amd64.AppImage", signature: "appimage" },
        { name: "Jelly_0.3.0_amd64.deb", signature: "deb" },
        { name: "Jelly-0.3.0-1.x86_64.rpm", signature: "rpm" },
        { name: "Jelly_aarch64.app.tar.gz", signature: "arm" },
        { name: "Jelly_x86_64.app.tar.gz", signature: "intel" },
      ],
      { tag: "v0.3.0", repo: "o/r", notes: "## 0.3.0\n- Neu: Raketen", date: DATE },
    );
    expect(manifest.version).toBe("0.3.0");
    expect(manifest.notes).toBe("## 0.3.0\n- Neu: Raketen");
    expect(manifest.pub_date).toBe("2026-11-19T12:00:00.000Z");
    expect(manifest.platforms["windows-x86_64"]).toEqual({
      signature: "nsis",
      url: url("Jelly_0.3.0_x64-setup.exe"),
    });
    expect(manifest.platforms["windows-x86_64-msi"].signature).toBe("msi");
    expect(manifest.platforms["linux-x86_64-appimage"].signature).toBe("appimage");
    expect(manifest.platforms).not.toHaveProperty("linux-x86_64");
    expect(manifest.platforms["linux-x86_64-deb"].signature).toBe("deb");
    expect(manifest.platforms["linux-x86_64-rpm"].signature).toBe("rpm");
    expect(manifest.platforms["darwin-aarch64-app"].url).toBe(url("Jelly_aarch64.app.tar.gz"));
    expect(manifest.platforms["darwin-x86_64"].signature).toBe("intel");
    expect(Object.keys(manifest.platforms)).toHaveLength(10);
  });

  it("ignores files that are no update bundle", () => {
    const manifest = updaterManifest(
      [
        { name: "Jelly_0.3.0_aarch64.dmg", signature: "dmg" },
        { name: "Jelly_0.3.0_amd64.AppImage", signature: "appimage" },
      ],
      { tag: "v0.3.0", repo: "o/r", notes: "## 0.3.0\n- Neu: Raketen", date: DATE },
    );
    expect(Object.keys(manifest.platforms)).toEqual(["linux-x86_64-appimage"]);
  });

  it("refuses to publish an empty manifest", () => {
    expect(() => updaterManifest([], { tag: "v0.3.0", repo: "o/r", date: DATE })).toThrow(
      "Kein signiertes Bundle",
    );
  });
});
