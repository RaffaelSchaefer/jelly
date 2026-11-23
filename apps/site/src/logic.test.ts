import { describe, expect, it } from "vitest";

import { aimAt, approach, eyesFor, leanFor } from "./hero/gaze.ts";
import { createSlowMeter, initialQuality, pixelRatioFor } from "./hero/quality.ts";
import { pickLanguage } from "./i18n/lang.ts";
import { t } from "./i18n/text.ts";

describe("pickLanguage", () => {
  it("keeps a stored choice", () => {
    expect(pickLanguage("en", ["de-DE"])).toBe("en");
    expect(pickLanguage("de", ["en-US"])).toBe("de");
  });

  it("speaks German whenever the browser knows German", () => {
    expect(pickLanguage(null, ["de-DE", "en"])).toBe("de");
    expect(pickLanguage(null, ["en-US", "de"])).toBe("de");
    expect(pickLanguage("fr", ["DE-at"])).toBe("de");
    expect(pickLanguage(null, [])).toBe("de");
  });

  it("speaks English to browsers without German", () => {
    expect(pickLanguage(null, ["en-US", "en"])).toBe("en");
    expect(pickLanguage(undefined, ["fr-FR"])).toBe("en");
  });
});

describe("t", () => {
  it("fills placeholders", () => {
    expect(t("de", "dl.version", { version: "0.4.0", date: "22. November 2026" })).toBe(
      "Version 0.4.0 vom 22. November 2026, kostenlos.",
    );
    expect(t("en", "dl.size", {})).toBe("{size} MB");
  });
});

describe("hero", () => {
  const box = { left: 400, top: 100, width: 200, height: 200 };
  const screen = { width: 1000, height: 800 };

  it("aims at the pointer from the jelly's centre", () => {
    expect(aimAt(500, 200, box, screen)).toEqual({ x: 0, y: 0 });
    expect(aimAt(1000, 600, box, screen)).toEqual({ x: 1, y: 1 });
    expect(aimAt(-5000, 200, box, screen).x).toBe(-1);
  });

  it("leans and looks the same way", () => {
    const lean = leanFor({ x: 1, y: -1 });
    expect(lean.yaw).toBeGreaterThan(0);
    expect(lean.pitch).toBeLessThan(0);
    expect(eyesFor({ x: 1, y: 1 }, { x: 0.035, y: 0.022 })).toEqual({ dx: 0.035, dy: -0.022 });
  });

  it("approaches the target smoothly", () => {
    const half = approach({ x: 0, y: 0 }, { x: 1, y: 1 }, 0.1);
    expect(half.x).toBeGreaterThan(0);
    expect(half.x).toBeLessThan(1);
    expect(approach({ x: 0, y: 0 }, { x: 1, y: 0 }, 0).x).toBe(0);
  });

  it("starts optimized on small devices", () => {
    expect(initialQuality({ cores: 8, memory: 8 })).toBe("full");
    expect(initialQuality({})).toBe("full");
    expect(initialQuality({ cores: 4 })).toBe("optimized");
    expect(initialQuality({ memory: 2 })).toBe("optimized");
    expect(initialQuality({ cores: 16, saveData: true })).toBe("optimized");
    expect(pixelRatioFor("full", 3)).toBe(2);
    expect(pixelRatioFor("optimized", 2)).toBe(1.25);
  });

  it("reports a slow device once", () => {
    const isSlow = createSlowMeter();
    const results = Array.from({ length: 120 }, () => isSlow(1 / 20));
    expect(results.filter(Boolean)).toHaveLength(1);
    const fast = createSlowMeter();
    expect(Array.from({ length: 120 }, () => fast(1 / 60)).some(Boolean)).toBe(false);
  });
});
