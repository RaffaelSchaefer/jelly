/**
 * Die Stimme des Jellys klingt wie in der ersten Fassung, die des Zauberers tiefer und rauer.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { JELLY_TIMBRE, WIZARD_TIMBRE } from "./voiceTimbre";

/** Die Vokale, die beide singen. */
const VOWELS = ["a", "e", "i", "o", "u"] as const;

describe("Klangfarben", () => {
  it("hält das Jelly genau bei den Werten der ersten Fassung", () => {
    expect(JELLY_TIMBRE).toEqual({
      formants: {
        a: [950, 1500, 3100],
        e: [560, 2200, 3200],
        i: [340, 2700, 3700],
        o: [560, 1000, 3000],
        u: [360, 800, 2700],
      },
      formantGains: [1, 0.75, 0.35],
      formantQ: [4, 6, 8],
      vowelGlide: 0.015,
      bodyGain: 0.16,
      bodyCutoff: 2400,
      detuneCents: 7,
      vibratoCents: 5,
      breath: 0.05,
      drive: 1.8,
      voiceLevel: 0.38,
    });
  });

  it("legt die Formanten des Zauberers tiefer, wie bei einem Erwachsenen", () => {
    for (const vowel of VOWELS) {
      const wizard = WIZARD_TIMBRE.formants[vowel];
      const jelly = JELLY_TIMBRE.formants[vowel];
      const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
      expect(sum(wizard)).toBeLessThan(sum(jelly));
      // Zwei Formanten liegen knapp darüber (o 565, u 840), keiner um mehr als 5 %.
      wizard.forEach((hz, index) => expect(hz).toBeLessThanOrEqual(jelly[index]! * 1.05));
    }
  });

  it("gibt dem Zauberer mehr Atem, Schwebung, Vibrato und Körper", () => {
    expect(WIZARD_TIMBRE.breath).toBeGreaterThan(JELLY_TIMBRE.breath);
    expect(WIZARD_TIMBRE.detuneCents).toBeGreaterThan(JELLY_TIMBRE.detuneCents);
    expect(WIZARD_TIMBRE.vibratoCents).toBeGreaterThan(JELLY_TIMBRE.vibratoCents);
    expect(WIZARD_TIMBRE.bodyGain).toBeGreaterThan(JELLY_TIMBRE.bodyGain);
    expect(WIZARD_TIMBRE.bodyCutoff).toBeLessThan(JELLY_TIMBRE.bodyCutoff);
  });
});
