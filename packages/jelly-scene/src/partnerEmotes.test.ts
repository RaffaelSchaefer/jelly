/**
 * Das Duett beginnt und endet in Ruhe, wechselt sich ab und springt nirgends.
 *
 * @module
 */

import { expect, test } from "vitest";

import {
  DUET_OFFSET_X,
  DUET_SCALE,
  emoteSeconds,
  isPartnerMotionKey,
  OFFSTAGE_X,
  PARTNER_EMOTE_SECONDS,
  partnerPose,
  restPose,
  type DuetPose,
  type DuetRole,
  type PartnerMotionKey,
} from "./partnerEmotes.ts";

const KEYS: PartnerMotionKey[] = ["hop", "spin", "wiggle"];
const ROLES: DuetRole[] = ["own", "partner", "solo"];

/** Die Pose bei `elapsed` Sekunden, mit Bewegung. */
function at(key: PartnerMotionKey, role: DuetRole, elapsed: number) {
  return partnerPose({ key, elapsed, role }, false);
}

/** Der Teil einer Pose, den eine Geste bewegt. */
const movement = ({ lift, turn, tilt }: DuetPose) =>
  Math.abs(lift) + Math.abs(turn) + Math.abs(tilt);

/** Eine ganze Drehung schaut wieder nach vorn: Nur die Blickrichtung zählt, nicht der Winkel. */
const facing = (pose: DuetPose) => ({ ...pose, turn: Math.sin(pose.turn) });

/** Erwartet, dass zwei Posen bis auf Rundung gleich sind. */
function expectSamePose(actual: DuetPose, expected: DuetPose, digits = 9) {
  for (const field of ["x", "lift", "turn", "tilt", "scale"] as const) {
    expect(actual[field]).toBeCloseTo(expected[field], digits);
  }
}

test.each(KEYS)("%s beginnt und endet in Ruhe", (key) => {
  for (const role of ROLES) {
    expectSamePose(at(key, role, 0), restPose(role));
    expectSamePose(at(key, role, PARTNER_EMOTE_SECONDS), restPose(role));
  }
  expect(restPose("partner").x).toBe(OFFSTAGE_X);
  expect(restPose("own")).toMatchObject({ x: 0, scale: 1 });
});

test("beide teilen sich den Platz, solange die Geste läuft", () => {
  expect(at("hop", "own", 2)).toMatchObject({ x: DUET_OFFSET_X, scale: DUET_SCALE });
  expect(at("hop", "partner", 2)).toMatchObject({ x: -DUET_OFFSET_X, scale: DUET_SCALE });
});

test("ohne Partner bleibt das eigene Jelly in der Mitte und in voller Größe", () => {
  for (const elapsed of [0.25, 0.75, 2, 3.75]) {
    expect(at("hop", "solo", elapsed)).toMatchObject({ x: 0, scale: 1 });
  }
  // Es tanzt auch die Takte des Partners, sonst stünde es dort einfach herum.
  expect(at("hop", "solo", 0.75).lift).toBeGreaterThan(0);
  expect(at("hop", "solo", 1.25).lift).toBeGreaterThan(0);
});

test.each([
  ["hop", 0.75, 1.25],
  ["spin", 1.25, 2.75],
  ["wiggle", 0.625, 1.125],
] as const)("%s wechselt sich ab", (key, ownTurn, partnerTurn) => {
  expect(movement(at(key, "own", ownTurn))).toBeGreaterThan(0);
  expect(movement(at(key, "partner", ownTurn))).toBe(0);
  expect(movement(at(key, "partner", partnerTurn))).toBeGreaterThan(0);
  expect(movement(at(key, "own", partnerTurn))).toBe(0);
});

test("an den Taktgrenzen stehen beide still", () => {
  for (const key of ["hop", "wiggle"] as const) {
    for (let beat = 0; beat <= 6; beat += 1) {
      const elapsed = 0.5 + beat * 0.5;
      expect(movement(at(key, "own", elapsed))).toBeCloseTo(0, 9);
      expect(movement(at(key, "partner", elapsed))).toBeCloseTo(0, 9);
    }
  }
});

test.each(KEYS)("%s springt nicht beim Wechsel zwischen Auftritt, Geste und Abgang", (key) => {
  const moment = 1e-6;
  for (const role of ROLES) {
    for (const border of [0.5, 3.5]) {
      const before = facing(at(key, role, border - moment));
      expectSamePose(before, facing(at(key, role, border + moment)), 3);
    }
  }
});

test("der Partner kommt von links und geht dorthin zurück", () => {
  const quarter = at("hop", "partner", 0.125);
  expect(quarter.x).toBeGreaterThan(OFFSTAGE_X);
  expect(quarter.x).toBeLessThan(-DUET_OFFSET_X);
  expect(quarter.lift).toBeGreaterThan(0);
  const leaving = at("hop", "partner", 3.875);
  expect(leaving.x).toBeCloseTo(quarter.x, 9);
});

test("bei reduzierter Bewegung stehen beide still und ohne Gesten daneben", () => {
  for (const key of KEYS) {
    for (const elapsed of [0, 0.25, 1.1, 3.75]) {
      const own = partnerPose({ key, elapsed, role: "own" }, true);
      const partner = partnerPose({ key, elapsed, role: "partner" }, true);
      const solo = partnerPose({ key, elapsed, role: "solo" }, true);
      expect(own).toEqual({ x: DUET_OFFSET_X, lift: 0, turn: 0, tilt: 0, scale: DUET_SCALE });
      expect(partner).toEqual({
        x: -DUET_OFFSET_X,
        lift: 0,
        turn: 0,
        tilt: 0,
        scale: DUET_SCALE,
      });
      expect(solo).toEqual(restPose("solo"));
    }
  }
});

test.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 99])("Laufzeit %s ergibt Ruhe", (elapsed) => {
  for (const role of ROLES) {
    expect(partnerPose({ key: "hop", elapsed, role }, false)).toEqual(restPose(role));
    expect(partnerPose({ key: "hop", elapsed, role }, true)).toEqual(restPose(role));
  }
});

test("Schlüssel und Laufzeit", () => {
  expect(isPartnerMotionKey("hop")).toBe(true);
  expect(isPartnerMotionKey("wave")).toBe(false);
  expect(isPartnerMotionKey("__proto__")).toBe(false);
  expect(emoteSeconds("hop")).toBe(PARTNER_EMOTE_SECONDS);
  expect(emoteSeconds("wave")).toBe(3);
});
