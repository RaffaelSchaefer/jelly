/**
 * Brauen, Schnurrbart und Blick des Zauberers als reine Rechnung.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import {
  browRig,
  createGaze,
  GAZE_AIMS,
  GAZE_TIMING,
  moodDoze,
  mustacheTwitch,
  stepGaze,
  wizardFrame,
  type GazeState,
} from "./wizardFaceRig";
import { RESTING_POSE, type GazeTarget } from "./wizardScripts";

/** Ein fester Zufall. */
const half = () => 0.5;

/** Schaut `seconds` lang in Bildern zu 1/60 s auf `target`. */
function look(state: GazeState, target: GazeTarget, seconds: number, calm = false) {
  let next = state;
  const frames = Math.round(seconds * 60);
  for (let frame = 1; frame <= frames; frame++) {
    next = stepGaze(next, target, {
      now: state.since + frame / 60,
      delta: 1 / 60,
      calm,
      random: half,
    });
  }
  return next;
}

describe("Brauen und Schnurrbart", () => {
  it("hebt die buschige Braue 1,3-mal so weit und spiegelt links die Drehung", () => {
    expect(browRig(0.04, 0.2, 1, 0)).toEqual({ y: expect.closeTo(0.052), rotation: 0.2 });
    expect(browRig(0.04, 0.2, -1, 0)).toEqual({ y: expect.closeTo(0.052), rotation: -0.2 });
    expect(browRig(0, 0, 1, 1).y).toBeCloseTo(-0.015);
  });

  it("lässt die Brauen beim Dösen sinken", () => {
    expect([moodDoze("neutral"), moodDoze("drowsy"), moodDoze("asleep")]).toEqual([0, 0.5, 1]);
  });

  it.each(["a", "o", "e", "grin"] as const)("zuckt mit dem Schnurrbart bei „%s“", (shape) => {
    expect(mustacheTwitch(shape)).toBe(0.07);
  });

  it.each(["m", "sad", "flat", "i", "u", null, undefined] as const)("ruht bei „%s“", (shape) => {
    expect(mustacheTwitch(shape)).toBe(0);
  });
});

describe("Blick", () => {
  it("bleibt in den Grenzen der Augen", () => {
    for (const aim of Object.values(GAZE_AIMS)) {
      expect(Math.abs(aim.dx)).toBeLessThanOrEqual(0.035);
      expect(Math.abs(aim.dy)).toBeLessThanOrEqual(0.022);
    }
  });

  it("schickt die Augen voraus, der Kopf folgt erst nach 80 ms", () => {
    const early = look(createGaze(0), "customer", 0.05);
    expect(early.dx).toBeGreaterThan(0.02);
    expect(early.roll).toBe(0);
    const later = look(createGaze(0), "customer", 0.5);
    expect(later.dx).toBeCloseTo(GAZE_AIMS.customer.dx, 3);
    expect(later.roll).toBeLessThan(-0.03);
    const settled = look(createGaze(0), "customer", 1.4);
    expect(settled.roll).toBeCloseTo(GAZE_AIMS.customer.roll, 3);
  });

  it("zuckt mit den Augen, wenn er lange auf dasselbe schaut", () => {
    const calm = look(createGaze(0), "orb", 1.4);
    expect(calm.jitter).toEqual({ dx: 0, dy: 0 });
    let random = 0;
    const restless = stepGaze(calm, "orb", {
      now: 1.6,
      delta: 1 / 60,
      calm: false,
      random: () => (random = (random + 0.37) % 1),
    });
    expect(Math.abs(restless.jitter.dx)).toBeLessThanOrEqual(GAZE_TIMING.saccade);
    expect(restless.jitter).not.toEqual({ dx: 0, dy: 0 });
    expect(restless.nextJitter).toBeGreaterThanOrEqual(1.6 + 0.6);
    expect(restless.nextJitter).toBeLessThanOrEqual(1.6 + 1.4);
  });

  it("schaut bei reduzierter Bewegung ruhig nach vorn", () => {
    const calm = look(createGaze(0), "purse", 1, true);
    expect([calm.dx, calm.dy, calm.roll, calm.target]).toEqual([0, 0, 0, "viewer"]);
  });
});

describe("Haltung als Bild", () => {
  it("spielt nur seine eigenen Gesten, mit Laufzeit, Schlaf und Hut in Sekunden", () => {
    const pose = {
      ...RESTING_POSE,
      mood: "asleep" as const,
      asleepSince: 1000,
      gesture: { key: "cast" as const, startedAt: 2000, seconds: 3.4, releaseAt: 1.2 },
    };
    expect(wizardFrame(pose, 3000, 7)).toEqual({
      time: 7,
      mood: "asleep",
      speaking: false,
      asleepFor: 2,
      hat: { off: false, since: Infinity },
      gesture: { key: "cast", elapsed: 1, seconds: 3.4, releaseAt: 1.2 },
    });
    const bald = { ...pose, hat: { off: true, at: 2500 } };
    expect(wizardFrame(bald, 3000, 7).hat).toEqual({ off: true, since: 0.5 });
    // Ohne Hut bleibt er empört, auch wenn etwas die Stimmung zurücksetzt. Gekränkt bleibt gekränkt.
    expect(wizardFrame({ ...bald, mood: "neutral" }, 3000, 7).mood).toBe("indignant");
    expect(wizardFrame({ ...bald, mood: "hurt" }, 3000, 7).mood).toBe("hurt");
    const pointing = { ...pose, gesture: { key: "point" as const, startedAt: 0, seconds: 1.6 } };
    expect(wizardFrame(pointing, 3000, 7).gesture).toBeNull();
    expect(wizardFrame(RESTING_POSE, 3000, 7).asleepFor).toBeNull();
  });
});
