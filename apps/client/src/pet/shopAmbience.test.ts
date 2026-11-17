import { describe, expect, it } from "vitest";

import {
  AMBIENCE_GAINS,
  BREATH_WALK,
  createCandleScore,
  CRACKLE_MIN_GAP,
  CRACKLE_RATE,
  droneSway,
  moodGain,
  MOOD_TAU,
  POP_GAP,
  roomCutoff,
  type AmbienceLayer,
  type CrackleHit,
} from "./shopAmbience";

const LAYERS: AmbienceLayer[] = ["room", "drone", "orb", "crackle", "breath"];

/** Nur die Knister-Ereignisse, ohne Nachschläge und Knacken. */
function events(hits: CrackleHit[]) {
  return hits.filter((hit) => !hit.extra && !hit.pop);
}

describe("createCandleScore", () => {
  it("crackles about λ·600 times in ten minutes, awake and dozing", () => {
    for (const mood of ["awake", "dozing"] as const) {
      const count = events(createCandleScore(7).crackles(600, mood)).length;
      const expected = CRACKLE_RATE[mood] * 600;
      expect(Math.abs(count - expected)).toBeLessThanOrEqual(expected * 0.1);
    }
  });

  it("never strikes twice within 6 ms and stays in order", () => {
    const hits = createCandleScore(3).crackles(600, "awake");
    hits.slice(1).forEach((hit, index) => {
      expect(hit.at - (hits[index]?.at ?? 0)).toBeGreaterThanOrEqual(CRACKLE_MIN_GAP - 1e-9);
    });
  });

  it("adds soft extra hits to about a third of the crackles", () => {
    const hits = createCandleScore(5).crackles(600, "awake");
    const share = hits.filter((hit) => hit.extra).length / events(hits).length;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.7);
    for (const hit of hits) {
      expect(hit.gain).toBeGreaterThanOrEqual(0);
      expect(hit.gain).toBeLessThanOrEqual(1);
    }
  });

  it("pops every 7 to 15 seconds", () => {
    const pops = createCandleScore(9)
      .crackles(600, "awake")
      .filter((hit) => hit.pop);
    expect(pops.length).toBeGreaterThan(600 / POP_GAP[1] - 2);
    pops.slice(1).forEach((pop, index) => {
      const gap = pop.at - (pops[index]?.at ?? 0);
      expect(gap).toBeGreaterThanOrEqual(POP_GAP[0] - 0.1);
      expect(gap).toBeLessThanOrEqual(POP_GAP[1] + 0.1);
    });
  });

  it("gives the same score for a seed, in pieces or at once", () => {
    const whole = createCandleScore(7, 2).crackles(30, "awake");
    const pieces = createCandleScore(7, 2);
    const parts = [...pieces.crackles(10, "awake"), ...pieces.crackles(30, "awake")];
    expect(parts).toEqual(whole);
    expect(createCandleScore(8, 2).crackles(30, "awake")).not.toEqual(whole);
    for (const hit of whole) expect(hit.at).toBeGreaterThanOrEqual(2);
  });

  it("breathes within its bounds every quarter second", () => {
    const steps = createCandleScore(7).breath(60);
    expect(steps).toHaveLength(60 / BREATH_WALK.every);
    for (const step of steps) {
      expect(step.level).toBeGreaterThanOrEqual(BREATH_WALK.low);
      expect(step.level).toBeLessThanOrEqual(BREATH_WALK.high);
    }
    expect(new Set(steps.map((step) => step.level)).size).toBeGreaterThan(20);
  });
});

describe("moods", () => {
  it("never makes a layer louder while he dozes", () => {
    for (const layer of LAYERS) {
      expect(AMBIENCE_GAINS.dozing[layer]).toBeLessThanOrEqual(AMBIENCE_GAINS.awake[layer]);
      expect(AMBIENCE_GAINS.awake[layer]).toBeLessThanOrEqual(1);
    }
    expect(CRACKLE_RATE.dozing).toBeLessThan(CRACKLE_RATE.awake);
  });

  it("glides to the new mood with τ 1.3 s", () => {
    const change = { at: 10, from: "awake", to: "dozing" } as const;
    const { awake, dozing } = AMBIENCE_GAINS;
    expect(moodGain("drone", change, 9)).toBe(awake.drone);
    expect(moodGain("drone", change, 10)).toBe(awake.drone);
    const oneTau = dozing.drone + (awake.drone - dozing.drone) * Math.exp(-1);
    expect(moodGain("drone", change, 10 + MOOD_TAU)).toBeCloseTo(oneTau, 9);
    expect(moodGain("drone", change, 30)).toBeCloseTo(dozing.drone, 6);
  });

  it("sways the drone by 12 % and the room filter by 60 Hz", () => {
    for (let time = 0; time < 60; time += 0.37) {
      expect(Math.abs(droneSway(time) - 1)).toBeLessThanOrEqual(0.12 + 1e-9);
      expect(Math.abs(roomCutoff(time) - 260)).toBeLessThanOrEqual(60 + 1e-9);
    }
  });
});
