import { describe, expect, it } from "vitest";

import {
  COSMETICS,
  nameToSave,
  PET_COLORS,
  PREVIEW_CATALOG,
  PREVIEW_ME,
  projectToStage,
  REGIONS,
  regionItems,
  shapeGrowth,
  shapeOnCanvas,
  stepPresence,
  wornRegions,
} from ".";

/** Die Region mit dieser ID. */
const region = (id: string) => REGIONS.find((item) => item.id === id)!;

/** Die Einträge einer Region für `me`. */
const items = (id: string, me = PREVIEW_ME) => regionItems(region(id), me, PREVIEW_CATALOG);

describe("studio regions", () => {
  it("offers every cosmetic in exactly one region", () => {
    const offered = ["kopf", "gesicht", "haende"].flatMap((id) =>
      items(id).flatMap((item) => (item.id ? [item.id] : [])),
    );
    expect(offered.sort()).toEqual(COSMETICS.map((item) => item.id).sort());
    expect(items("kopf")).toHaveLength(6);
    expect(items("gesicht")).toHaveLength(2);
    expect(items("haende")).toHaveLength(2);
  });
  it("marks what is free, locked and worn", () => {
    const head = items("kopf");
    expect(head[0]).toMatchObject({ id: null, state: "equipped" });
    expect(head.find((item) => item.id === "beanie")?.state).toBe("unlocked");
    expect(head.find((item) => item.id === "party-hat")).toMatchObject({
      state: "locked",
      note: "Bei einem Event",
    });
    expect(head.find((item) => item.id === "crown")).toMatchObject({
      state: "locked",
      note: "Level 10",
    });
  });
  it("wearing something only changes its own region", () => {
    const me = { ...PREVIEW_ME, equipped: { head: { key: "beanie", color: null } } };
    expect(items("kopf", me).find((item) => item.id === "beanie")?.state).toBe("equipped");
    expect(items("kopf", me)[0].state).toBe("unlocked");
    expect(items("gesicht", me)[0].state).toBe("equipped");
    expect(wornRegions(me)).toEqual(["kopf"]);
    expect(wornRegions(PREVIEW_ME)).toEqual([]);
    const unknown = { head: { key: "unknown", color: null } };
    expect(wornRegions({ ...PREVIEW_ME, equipped: unknown })).toEqual([]);
  });
  it("wears one cosmetic per slot at the same time", () => {
    const equipped = {
      head: { key: "beanie", color: null },
      face: { key: "pixel-glasses", color: null },
      hands: { key: "golden-cup", color: null },
    };
    const me = { ...PREVIEW_ME, equipped };
    expect(wornRegions(me)).toEqual(["kopf", "gesicht", "haende"]);
    expect(items("gesicht", me).find((item) => item.id === "pixel-glasses")?.state).toBe(
      "equipped",
    );
  });
  it("offers the body colours", () => {
    const colors = items("farbe");
    expect(colors).toHaveLength(3);
    expect(colors[0]).toMatchObject({
      id: "mint",
      state: "equipped",
      swatch: PET_COLORS.mint,
    });
  });
});

describe("studio slots", () => {
  it("shows every slot of the server, also those without a cosmetic", () => {
    const slots = REGIONS.flatMap((item) => item.slot ?? []);
    expect(slots.sort()).toEqual(PREVIEW_CATALOG.cosmetic_slots.map((slot) => slot.key).sort());
    for (const id of ["koerper", "aura"]) {
      expect(items(id)).toEqual([
        { id: null, name: "Noch nichts da", icon: "close", state: "equipped", note: "" },
      ]);
    }
  });
  it("offers the cup in the hands, only the orga hands it out", () => {
    expect(items("haende").find((item) => item.id === "golden-cup")).toMatchObject({
      state: "locked",
      note: "Von der Orga",
    });
    const me = { ...PREVIEW_ME, cosmetics: ["golden-cup"] };
    expect(items("haende", me).find((item) => item.id === "golden-cup")?.state).toBe("unlocked");
  });
});

describe("projectToStage", () => {
  const size = { width: 396, height: 315 };
  it("maps camera coordinates to canvas pixels", () => {
    expect(projectToStage({ x: 0, y: 0 }, size)).toEqual({ x: 198, y: 157.5 });
  });
  it("keeps points away from the edge", () => {
    expect(projectToStage({ x: 1, y: 1 }, size)).toEqual({ x: 378, y: 18 });
    expect(projectToStage({ x: -1, y: -1 }, size)).toEqual({ x: 18, y: 297 });
    expect(projectToStage({ x: 9, y: -9 }, size)).toEqual({ x: 378, y: 297 });
  });
});

describe("nameToSave", () => {
  it("only saves real changes", () => {
    expect(nameToSave("  Glibber ", "Pixel")).toBe("Glibber");
    expect(nameToSave("   ", "Pixel")).toBeNull();
    expect(nameToSave(" Pixel ", "Pixel")).toBeNull();
    expect(nameToSave("x".repeat(25), "Pixel")).toBeNull();
  });
});

describe("studio shapes", () => {
  it("lets the glass appear slowly, vanish quickly and stay within its range", () => {
    expect(stepPresence(0, true, 0.35, false)).toBeCloseTo(0.5);
    expect(stepPresence(1, false, 0.15, false)).toBeCloseTo(0.5);
    expect(stepPresence(0.9, true, 1, false)).toBe(1);
    expect(stepPresence(0.1, false, 1, false)).toBe(0);
  });
  it("skips the transition with reduced motion", () => {
    expect(stepPresence(0, true, 0, true)).toBe(1);
    expect(stepPresence(1, false, 0, true)).toBe(0);
  });
  it("reads an element as center and half size on the canvas", () => {
    const canvas = { left: 100, top: 50, width: 594, height: 472 };
    const rect = { left: 200, top: 100, width: 40, height: 20 };
    expect(shapeOnCanvas(rect, canvas, 594)).toEqual({
      x: 120,
      y: 60,
      halfWidth: 20,
      halfHeight: 10,
    });
    expect(shapeOnCanvas(rect, canvas, 297)).toEqual({
      x: 60,
      y: 30,
      halfWidth: 10,
      halfHeight: 5,
    });
  });
  it("grows one shape after the other", () => {
    expect(shapeGrowth(0, 0)).toBeCloseTo(0);
    expect(shapeGrowth(1, 0)).toBeCloseTo(1);
    expect(shapeGrowth(1, 6)).toBeCloseTo(1);
    expect(shapeGrowth(0.2, 6)).toBeCloseTo(0);
    expect(shapeGrowth(0.2, 0)).toBeGreaterThan(0);
  });
});
