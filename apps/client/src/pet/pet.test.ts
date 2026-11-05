import { describe, expect, it } from "vitest";

import {
  achievementRows,
  equipColor,
  isUnlocked,
  levelCosmetic,
  levelProgress,
  nextLevelCosmetic,
  PET_SIZE,
  pokeWaitMinutes,
  PREVIEW_CATALOG,
  PREVIEW_ME,
  reportStatus,
  slotLabel,
  stageLayout,
  unlockLabel,
  wornCosmetics,
} from ".";

describe("self-reports", () => {
  const reports = { food_ready_at: 0, drink_ready_at: 1_000_000, reports_left: 5 };
  it("counts the cooldown down to the server's ready time", () => {
    expect(reportStatus(reports, "drink", 1_000_000 - 29 * 60_000 - 1)).toEqual({
      waitMinutes: 30,
      left: 5,
    });
    expect(reportStatus(reports, "drink", 1_000_000 - 60_000).waitMinutes).toBe(1);
    expect(reportStatus(reports, "drink", 1_000_000).waitMinutes).toBe(0);
    expect(reportStatus(reports, "food", 0).waitMinutes).toBe(0);
  });
  it("blocks reports outside a running LAN", () => {
    expect(reportStatus(null, "food", 0)).toEqual({ waitMinutes: 0, left: 0 });
  });
  it("tells when the next poke earns XP", () => {
    expect(pokeWaitMinutes(null, 0)).toBeNull();
    expect(pokeWaitMinutes(900_000, 0)).toBe(15);
    expect(pokeWaitMinutes(900_000, 900_000)).toBe(0);
  });
});

describe("unlocks", () => {
  it("follows the server's list and catalog", () => {
    expect(isUnlocked("beanie", PREVIEW_ME)).toBe(true);
    expect(isUnlocked("pixel-glasses", PREVIEW_ME)).toBe(false);
    expect(unlockLabel("pixel-glasses", PREVIEW_CATALOG)).toBe("Level 5");
    expect(unlockLabel("party-hat", PREVIEW_CATALOG)).toBe("Bei einem Event");
    expect(unlockLabel("golden-cup", PREVIEW_CATALOG)).toBe("Von der Orga");
  });
  it("finds level rewards in level order", () => {
    // Level 2 schaltet beide Headsets frei, das Level-up zeigt das erste.
    expect(levelCosmetic(2, PREVIEW_CATALOG)?.id).toBe("headset");
    expect(levelCosmetic(3, PREVIEW_CATALOG)?.id).toBe("beanie");
    expect(levelCosmetic(4, PREVIEW_CATALOG)).toBeUndefined();
    expect(nextLevelCosmetic(3, PREVIEW_CATALOG)?.id).toBe("pixel-glasses");
    expect(nextLevelCosmetic(10, PREVIEW_CATALOG)).toBeUndefined();
  });
});

describe("slots", () => {
  it("sends the first colour only for colourable cosmetics", () => {
    expect(equipColor("beanie", PREVIEW_CATALOG)).toBe(PREVIEW_CATALOG.cosmetic_colors[0]);
    expect(equipColor("headset", PREVIEW_CATALOG)).toBeUndefined();
    expect(equipColor(null, PREVIEW_CATALOG)).toBeUndefined();
  });
  it("wears what it can draw, head before face before hands", () => {
    const worn = wornCosmetics({
      hands: { key: "golden-cup", color: null },
      face: { key: "pixel-glasses", color: null },
      head: { key: "hood", color: null },
      aura: { key: "unknown", color: null },
    });
    expect(worn.map((item) => item.id)).toEqual(["hood", "pixel-glasses", "golden-cup"]);
    expect(wornCosmetics({ head: { key: "pixel-glasses", color: null } })).toEqual([]);
  });
  it("names a slot from the catalog", () => {
    expect(slotLabel("head", PREVIEW_CATALOG)).toBe("Kopf");
    expect(slotLabel("future", PREVIEW_CATALOG)).toBe("future");
  });
});

describe("achievements", () => {
  it("keeps catalog order and marks what the server granted", () => {
    const rows = achievementRows(PREVIEW_CATALOG, PREVIEW_ME);
    expect(rows.map((item) => item.key)).toEqual(PREVIEW_CATALOG.achievements.map((a) => a.key));
    expect(rows.filter((item) => item.done).map((item) => item.key)).toEqual(["hatched"]);
  });
  it("shows a secret achievement only once it is earned", () => {
    const earned = { key: "night-owl", title: "Nachteule", lan_slug: "ucb", earned_at: 1 };
    const me = { ...PREVIEW_ME, achievements: [...PREVIEW_ME.achievements, earned, earned] };
    const rows = achievementRows(PREVIEW_CATALOG, me);
    expect(rows.at(-1)).toMatchObject({ key: "night-owl", title: "Nachteule", done: true });
    expect(rows.filter((item) => item.key === "night-owl")).toHaveLength(1);
  });
});

describe("level progress", () => {
  it("starts at level one with the full next level ahead", () => {
    expect(levelProgress(0)).toEqual({ level: 1, current: 0, remaining: 100 });
  });
  it("carries excess XP across level boundaries", () => {
    expect(levelProgress(99)).toEqual({ level: 1, current: 99, remaining: 1 });
    expect(levelProgress(100)).toEqual({ level: 2, current: 0, remaining: 100 });
    expect(levelProgress(235)).toEqual({ level: 3, current: 35, remaining: 65 });
  });
});

describe("stage layout", () => {
  it("matches the original layout at 100 %", () => {
    expect(stageLayout(100)).toMatchObject({
      scale: 1,
      canvas: { top: 43, width: 396, height: 315 },
      feet: 299,
      bubbleTop: 20,
      toolsOffset: 0,
      stage: 330,
      window: { width: 384, height: 430 },
    });
  });
  it("keeps a small pet on the ground and the stage tall enough for the panels", () => {
    const small = stageLayout(PET_SIZE.min);
    expect(small.feet).toBe(299);
    expect(small.stage).toBe(330);
    expect(small.window.height).toBe(430);
    expect(small.canvas.height).toBeCloseTo(315 * 0.7);
    // Die Fensterknöpfe wandern mit der Sprechblase nach unten und halten ihren Abstand.
    expect(small.toolsOffset).toBeCloseTo(small.bubbleTop - 20);
    expect(small.toolsOffset).toBeGreaterThan(0);
  });
  it("grows a big pet downwards, keeps the bubble above his head and grows the window along", () => {
    const big = stageLayout(PET_SIZE.max);
    expect(big.bubbleTop).toBe(20);
    expect(big.toolsOffset).toBe(0);
    expect(big.feet).toBeCloseTo(43 + 52 + 204 * 1.5);
    // Fensterrand + Knöpfe + Bühne + Dock (Abstand und Höhe) + unterer Rand.
    expect(big.window).toEqual({ width: 384, height: 8 + 30 + big.stage + 8 + 40 + 14 });
  });
  it("clamps sizes outside the allowed range", () => {
    expect(stageLayout(10).scale).toBe(0.7);
    expect(stageLayout(500).scale).toBe(1.5);
  });
});
