import { BODY_BOTTOM, headSurface } from "@jelly/scene/geometry";
import { describe, expect, it } from "vitest";

import {
  BUBBLE,
  CANDLE,
  convexHull,
  COUNTER,
  counterOutline,
  depthScale,
  flameOf,
  FLOOR_Y,
  moonBeam,
  moonPatch,
  MOUTH,
  ORB,
  OWN_AT,
  projectRect,
  RUNE_CIRCLE,
  SHOP_VIEW,
  shopProject,
  STAGE_POINTS,
  STAGE_SPOTS,
  STAGE_ZONES,
  TAPER,
  toWizardLocal,
  TRAY,
  tryOnLabel,
  unitPx,
  WALL_Z,
  WINDOW,
  type StagePoint,
} from "./shopStage";

/** Auf so viele Nachkommastellen gerundet, wie die Tabelle der Spezifikation sie nennt. */
const rounded = (value: number, digits = 1) => Number(value.toFixed(digits));

/** Ein Punkt der Bühne, auf eine Nachkommastelle gerundet. */
const spot = ({ left, top }: StagePoint) => [rounded(left), rounded(top)];

describe("shop camera", () => {
  it("matches the first shop for the old camera", () => {
    const v1 = { eye: [0, 0.62, 8.8] as const, fov: 24, aspect: 2.4 };
    expect(rounded(shopProject([2.15, -1.05, 0], 2.4, v1).top, 2)).toBe(94.64);
    expect(rounded(shopProject([0, -0.3, 0], 2.4, v1).top, 2)).toBe(74.59);
  });
  it("sees y −1.498 to 2.498 and x ±4.795 at z 0", () => {
    expect(rounded(shopProject([0, 2.498, 0]).top, 2)).toBe(0);
    expect(rounded(shopProject([0, -1.498, 0]).top, 2)).toBe(100);
    expect(rounded(shopProject([4.795, 0, 0]).left, 2)).toBe(100);
    expect(rounded(shopProject([-4.795, 0, 0]).left, 2)).toBe(0);
  });
  it("gives px per unit at z 0 and the growth with depth", () => {
    expect(unitPx(3.9961)).toBeCloseTo(1, 4);
    expect(unitPx(288)).toBeCloseTo(72.07, 2);
    expect(depthScale(0)).toBe(1);
    expect(depthScale(0.85)).toBeCloseTo(9.4 / 8.55, 6);
  });
  it("keeps the stage at 12:5", () => {
    expect(SHOP_VIEW.aspect).toBe(2.4);
  });
});

describe("stage spots", () => {
  it("puts the reference spots where the design wants them", () => {
    expect(spot(STAGE_SPOTS.feet)).toEqual([74, 88.8]);
    expect(spot(STAGE_SPOTS.orb)).toEqual([43, 66.9]);
    expect(spot(STAGE_SPOTS.slotHead)).toEqual([74.9, 32.3]);
    expect(spot(STAGE_SPOTS.slotFace)).toEqual([76, 45.1]);
    expect(rounded(STAGE_SPOTS.floorLine.top)).toBe(82.3);
    expect(rounded(STAGE_SPOTS.counterBackTop.top, 2)).toBe(74.99);
    expect(rounded(STAGE_SPOTS.counterRight.top)).toBe(76.6);
  });
  it("projects every named point, nothing typed by hand", () => {
    for (const [name, point] of Object.entries(STAGE_POINTS)) {
      expect(STAGE_SPOTS[name as keyof typeof STAGE_SPOTS]).toEqual(shopProject(point));
    }
  });
  it("puts the jellies at a quarter and three quarters of the width", () => {
    expect(rounded(STAGE_SPOTS.wizardCentre.left)).toBe(26);
    expect(rounded(STAGE_SPOTS.customerCentre.left)).toBe(74);
    expect(spot(STAGE_SPOTS.wizardMouth)).toEqual([24, 53.4]);
  });
  it("takes the mouth from the face of a jelly", () => {
    const [x, y, z] = headSurface(0, -0.165, 0.004);
    expect(MOUTH[0]).toBe(x);
    expect(MOUTH[1]).toBeCloseTo(y, 3);
    expect(MOUTH[2]).toBeCloseTo(z, 3);
  });
  it("lights the flames where the scene light expects them", () => {
    expect(flameOf(CANDLE)).toEqual([-0.12, expect.closeTo(0, 6), 0.85]);
    expect(flameOf(TAPER)).toEqual([-3.75, expect.closeTo(0.26, 6), 0.8]);
  });
});

describe("stage geometry", () => {
  it("stands the customer on the floor of a jelly body", () => {
    expect(FLOOR_Y).toBe(BODY_BOTTOM);
    expect(RUNE_CIRCLE.at).toEqual([OWN_AT[0], FLOOR_Y, OWN_AT[2]]);
  });
  it("puts the orb on the wizard's right", () => {
    const local = toWizardLocal(ORB.at);
    expect(local[0]).toBeCloseTo(1.68, 9);
    expect(local[1]).toBeCloseTo(0, 9);
    expect(local[2]).toBeCloseTo(0.75, 9);
  });
  it("frames the window between the jellies", () => {
    const { left, top, width, height } = projectRect(WINDOW, WALL_Z);
    expect([rounded(left), rounded(left + width)]).toEqual([47, 59.1]);
    expect([rounded(top), rounded(top + height)]).toEqual([30.2, 65.6]);
  });
  it("draws the rune circle around the customer's feet", () => {
    const [x, y, z] = RUNE_CIRCLE.at;
    const r = RUNE_CIRCLE.radius;
    expect(rounded(shopProject([x, y, z - r]).top)).toBe(84.4);
    expect(rounded(shopProject([x, y, z + r]).top)).toBe(94.5);
    expect(rounded(shopProject([x - r, y, z]).left)).toBe(61.5);
    expect(rounded(shopProject([x + r, y, z]).left)).toBe(86.5);
  });
  it("outlines the counter from its back edge to its front foot", () => {
    const outline = counterOutline();
    expect(outline).toHaveLength(5);
    expect(rounded(outline[1].top, 2)).toBe(74.99);
    expect(rounded(outline[2].top)).toBe(76.6);
    expect(rounded(outline[2].left)).toBe(50.6);
    expect(rounded(outline[3].top)).toBe(93.8);
    expect(outline[0].left).toBeLessThan(0);
    expect(outline[4].left).toBeLessThan(0);
  });
  it("keeps the counter, the tray and the candles together", () => {
    for (const thing of [TRAY.at, CANDLE.at, TAPER.at, ORB.at]) {
      expect(thing[0]).toBeGreaterThan(COUNTER.left);
      expect(thing[0]).toBeLessThan(COUNTER.right);
    }
    expect(CANDLE.at[1]).toBe(COUNTER.topY);
    expect(TAPER.at[1]).toBe(COUNTER.topY);
  });
});

describe("moonlight", () => {
  it("throws the window onto the floor under the customer", () => {
    const patch = moonPatch();
    const [backLeft, backRight] = patch;
    expect(spot(backLeft)).toEqual([55.6, 85.1]);
    expect(spot(backRight)).toEqual([68.8, 85.1]);
    const lefts = patch.map((point) => point.left);
    expect(Math.min(...lefts)).toBeLessThan(STAGE_SPOTS.feet.left);
    expect(Math.max(...lefts)).toBeGreaterThan(STAGE_SPOTS.feet.left);
    for (const point of patch) expect(point.top).toBeGreaterThan(STAGE_SPOTS.floorLine.top);
  });
  it("fills the shaft from the window arch down to the patch", () => {
    const beam = moonBeam();
    const tops = beam.map((point) => point.top);
    expect(rounded(Math.min(...tops))).toBe(30.2);
    expect(Math.max(...tops)).toBeLessThan(95);
    expect(rounded(Math.min(...beam.map((point) => point.left)))).toBe(47);
  });
  it("builds a convex hull without inner points", () => {
    const square = [
      { left: 0, top: 0 },
      { left: 10, top: 0 },
      { left: 5, top: 5 },
      { left: 10, top: 10 },
      { left: 0, top: 10 },
    ];
    const hull = convexHull(square);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ left: 5, top: 5 });
  });
});

describe("reserved zones", () => {
  it("keeps the speech zone above the window and the bubble inside it", () => {
    const window = projectRect(WINDOW, WALL_Z);
    expect(STAGE_ZONES.speech.bottom).toBeLessThan(window.top);
    expect(BUBBLE.left).toBeGreaterThanOrEqual(STAGE_ZONES.speech.left);
    expect(BUBBLE.top).toBeGreaterThanOrEqual(STAGE_ZONES.speech.top);
    expect(BUBBLE.left + BUBBLE.width).toBeLessThanOrEqual(STAGE_ZONES.speech.right);
  });
  it("lets the poke zone cover the wizard above his counter", () => {
    const { poke } = STAGE_ZONES;
    expect(STAGE_SPOTS.wizardMouth.left).toBeGreaterThan(poke.left);
    expect(STAGE_SPOTS.wizardMouth.left).toBeLessThan(poke.right);
    expect(poke.bottom).toBeLessThan(STAGE_SPOTS.counterBackTop.top);
  });
});

describe("try-on tag", () => {
  const worn = { head: { key: "beanie", color: null } };
  it("stays away while the jelly shows what it wears", () => {
    expect(tryOnLabel(worn, worn)).toBeNull();
    expect(tryOnLabel({}, {})).toBeNull();
  });
  it("names the worn piece the try-on replaces", () => {
    const shown = { head: { key: "crown", color: null } };
    expect(tryOnLabel(shown, worn)).toBe("Zur Probe · statt Mütze");
  });
  it("says only 'Zur Probe' for a free slot", () => {
    const shown = { ...worn, face: { key: "pixel-glasses", color: null } };
    expect(tryOnLabel(shown, worn)).toBe("Zur Probe");
  });
  it("falls back to the key of an unknown piece", () => {
    const shown = { head: { key: "crown", color: null } };
    expect(tryOnLabel(shown, { head: { key: "zylinder", color: null } })).toBe(
      "Zur Probe · statt zylinder",
    );
  });
  it("says 'Ohne Abbild' for a piece without a model", () => {
    const models = ["beanie", "pixel-glasses"];
    const crown = { head: { key: "crown", color: null } };
    expect(tryOnLabel(crown, worn, models)).toBe("Ohne Abbild · statt Mütze");
    expect(tryOnLabel(crown, {}, models)).toBe("Ohne Abbild");
    const glasses = { ...worn, face: { key: "pixel-glasses", color: null } };
    expect(tryOnLabel(glasses, worn, models)).toBe("Zur Probe");
  });
});
