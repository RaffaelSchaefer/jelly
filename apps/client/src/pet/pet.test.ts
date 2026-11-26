import { describe, expect, it } from "vitest";

import {
  achievementRows,
  coinLabel,
  isUnlocked,
  levelProgress,
  PET_SIZE,
  pokeWaitMinutes,
  PREVIEW_CATALOG,
  PREVIEW_ME,
  reportStatus,
  slotLabel,
  CANVAS_OVERSCAN,
  SHOWCASE_SIZE,
  stageLayout,
  stageSize,
  shopItems,
  unlockLabel,
  isColorable,
  wornCosmetics,
} from ".";

/** Die Waren der Vorschau mit 3 Münzen: Zustand und was fehlt, die günstigsten zuerst. */
const AT_THREE_COINS = [
  ["headset", "owned", 0],
  ["headset-neutral", "owned", 0],
  ["beanie", "owned", 0],
  ["sprout", "affordable", 0],
  ["bandana", "affordable", 0],
  ["bell-collar", "affordable", 0],
  ["cat-whiskers", "affordable", 0],
  ["yarn-ball", "affordable", 0],
  ["pixel-glasses", "affordable", 0],
  ["schnoerbi-mask", "affordable", 0],
  ["knit-scarf", "affordable", 0],
  ["snail-shell", "affordable", 0],
  ["piercings", "affordable", 0],
  ["ogre-ears", "affordable", 0],
  ["kamina-glasses", "affordable", 0],
  ["cat-ears", "affordable", 0],
  ["cat-paws", "affordable", 0],
  ["cat-tail", "affordable", 0],
  ["nasal-helmet", "affordable", 0],
  ["kite-shield", "affordable", 0],
  ["nail-sword", "affordable", 0],
  ["hood", "short", 1],
  ["long-schnoerbi", "short", 1],
  ["goose", "short", 1],
  ["mini-backpack", "short", 1],
  ["chicken", "short", 1],
  ["cyber-cat-ears", "short", 1],
  ["kitten", "short", 1],
  ["octopus", "short", 1],
  ["hollow-helmet", "short", 1],
  ["crown", "short", 3],
  ["fairy-wings", "short", 3],
  ["bfg", "short", 7],
];

describe("shop", () => {
  const states = (coins: number, cosmetics = PREVIEW_ME.cosmetics) =>
    shopItems(PREVIEW_CATALOG, { ...PREVIEW_ME, coins, cosmetics }).map((item) => [
      item.cosmetic.id,
      item.state,
      item.missing,
    ]);

  it("lists what it can draw, cheapest first, and leaves out events and awards", () => {
    expect(states(3)).toEqual(AT_THREE_COINS);
  });
  it("counts an awarded part as owned, the server would not sell it", () => {
    expect(states(0, ["crown"]).find(([id]) => id === "crown")).toEqual(["crown", "owned", 0]);
  });
  it("marks the crown as bought again each LAN", () => {
    const items = shopItems(PREVIEW_CATALOG, PREVIEW_ME);
    expect(items.filter((item) => item.perLan).map((item) => item.cosmetic.id)).toEqual(["crown"]);
  });
  it("skips shop entries without a price or a model", () => {
    const catalog = {
      ...PREVIEW_CATALOG,
      cosmetics: [
        { ...PREVIEW_CATALOG.cosmetics[0], price: undefined },
        { ...PREVIEW_CATALOG.cosmetics[0], key: "top-hat" },
      ],
    };
    expect(shopItems(catalog, PREVIEW_ME)).toEqual([]);
  });
});

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
    expect(unlockLabel("pixel-glasses", PREVIEW_CATALOG)).toBe("3 Münzen");
    expect(unlockLabel("headset", PREVIEW_CATALOG)).toBe("1 Münze");
    expect(unlockLabel("party-hat", PREVIEW_CATALOG)).toBe("Bei einem Event");
    expect(unlockLabel("golden-cup", PREVIEW_CATALOG)).toBe("Von der Orga");
    const sealed = {
      ...PREVIEW_CATALOG,
      cosmetics: [{ ...PREVIEW_CATALOG.cosmetics[0], unlock: "none" }],
    };
    expect(unlockLabel("headset", sealed)).toBe("Nicht freischaltbar");
  });
  it("names coins in the singular and plural", () => {
    expect(coinLabel(0)).toBe("0 Münzen");
    expect(coinLabel(1)).toBe("1 Münze");
    expect(coinLabel(6)).toBe("6 Münzen");
  });
});

describe("slots", () => {
  it("knows which cosmetics the server lets color", () => {
    expect(isColorable("beanie", PREVIEW_CATALOG)).toBe(true);
    expect(isColorable("sprout", PREVIEW_CATALOG)).toBe(false);
    expect(isColorable("unbekannt", PREVIEW_CATALOG)).toBe(false);
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
  const at = (level: number, xp_in_level: number, xp_for_next_level: number) =>
    levelProgress({ level, xp_in_level, xp_for_next_level });
  it("takes level and cost from the server instead of dividing XP", () => {
    // Quadratische Kurve 50 / 25: Level 3 kostet 100, erreicht mit 125 XP.
    expect(at(3, 40, 100)).toEqual({ level: 3, current: 40, cost: 100, remaining: 60, fill: 0.4 });
    expect(at(1, 0, 50)).toEqual({ level: 1, current: 0, cost: 50, remaining: 50, fill: 0 });
  });
  it("stays empty without a LAN", () => {
    expect(at(1, 0, 0)).toEqual({ level: 1, current: 0, cost: 0, remaining: 0, fill: 0 });
  });
  it("never overfills", () => {
    expect(at(2, 90, 75).fill).toBe(1);
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
    expect(small.canvas.height).toBeCloseTo(315 * 0.3);
    // Die Fensterknöpfe wandern mit der Sprechblase nach unten und halten ihren Abstand.
    expect(small.toolsOffset).toBeCloseTo(small.bubbleTop - 20);
    expect(small.toolsOffset).toBeGreaterThan(0);
  });
  it("lets the canvas of a small pet reach the top of the stage, the glass needs the room", () => {
    for (const size of [30, 40, 50, 60, 70, 80]) {
      const { canvas, bubbleTop } = stageLayout(size);
      expect(canvas.glassTop).toBeCloseTo(0);
      expect(canvas.glassTop).toBeLessThan(bubbleTop);
      // Ragt nach allen Seiten gleich weit über: die Mitte bleibt die des Kastens.
      expect(canvas.glassTop + (canvas.height * canvas.overscan) / 2).toBeCloseTo(
        canvas.top + canvas.height / 2,
      );
      // Das Glas der Schild-Säule am linken Fensterrand liegt noch in der Canvas.
      expect(canvas.width * canvas.overscan).toBeGreaterThan(384);
    }
    // Ab 90 % reicht der gewohnte Überstand.
    expect(stageLayout(90).canvas.overscan).toBe(CANVAS_OVERSCAN);
    expect(stageLayout(100).canvas).toMatchObject({
      overscan: CANVAS_OVERSCAN,
      glassTop: 43 - 78.75,
    });
    expect(stageLayout(PET_SIZE.max).canvas.overscan).toBe(CANVAS_OVERSCAN);
  });
  it("shows a small pet larger in studio, hatch and level-up", () => {
    expect(stageSize(30, true)).toBe(SHOWCASE_SIZE);
    expect(stageSize(30, false)).toBe(30);
    expect(stageSize(120, true)).toBe(120);
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
    expect(PET_SIZE.min).toBe(30);
    expect(stageLayout(10).scale).toBe(0.3);
    expect(stageLayout(500).scale).toBe(1.5);
  });
});
