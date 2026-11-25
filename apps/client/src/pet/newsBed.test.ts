import { describe, expect, it } from "vitest";

import { BED_ENTRY_SECONDS, bedSegments, NEWS_BED, type SoundSegment } from ".";

/** Wann ein Abschnitt endet. */
const endOf = (segment: SoundSegment) => segment.at + segment.duration;

/**
 * Prüft, dass jeder Abschnitt dort beginnt, wo die Schleife zurückspringt, sich mit dem vorigen um
 * die Überblendung überlappt und nichts über das Ende hinaus läuft.
 */
function expectSeamless(segments: SoundSegment[], seconds: number) {
  segments.slice(1).forEach((segment, index) => {
    const before = segments[index]!;
    expect(segment.offset).toBe(NEWS_BED.loopStart);
    const step = index === 0 ? NEWS_BED.loopEnd : NEWS_BED.loopEnd - NEWS_BED.loopStart;
    expect(segment.at).toBeCloseTo(before.at + step, 6);
    // Der vorige klingt noch die ganze Überblendung lang, außer die Sendung endet darin.
    expect(endOf(before)).toBeCloseTo(Math.min(segment.at + NEWS_BED.crossfade, seconds), 6);
  });
  for (const segment of segments) {
    expect(endOf(segment)).toBeLessThanOrEqual(seconds + 1e-9);
    expect(segment.fadeIn + segment.fadeOut).toBeLessThanOrEqual(segment.duration + 1e-9);
  }
}

describe("the music under the news", () => {
  it("comes in under the end of the jingle", () => {
    expect(BED_ENTRY_SECONDS).toBeGreaterThan(12);
    expect(BED_ENTRY_SECONDS).toBeLessThan(13.5);
    const [first] = bedSegments(77.5);
    expect(first).toMatchObject({ at: 0, offset: 0, fadeIn: NEWS_BED.fadeIn });
  });

  it("loops with a crossfade for as long as the show runs", () => {
    for (const seconds of [77.5, 167.5, 600]) {
      const segments = bedSegments(seconds);
      expectSeamless(segments, seconds);
      expect(endOf(segments.at(-1)!)).toBeCloseTo(seconds, 6);
    }
    const loop = NEWS_BED.loopEnd - NEWS_BED.loopStart;
    expect(bedSegments(600).length).toBe(1 + Math.ceil((600 - NEWS_BED.loopEnd) / loop));
  });

  it("fades out at the end of the show, also inside a crossfade", () => {
    for (const seconds of [77.5, NEWS_BED.loopEnd + 1, 20]) {
      const segments = bedSegments(seconds);
      for (const segment of segments.filter((part) => endOf(part) > seconds - 1e-6)) {
        expect(segment.fadeOut).toBeGreaterThan(0);
        expect(segment.fadeOut).toBeLessThanOrEqual(NEWS_BED.fadeOut);
      }
    }
  });

  it("stays silent when the show is over before the music would come in", () => {
    expect(bedSegments(0)).toEqual([]);
    expect(bedSegments(-3)).toEqual([]);
  });
});
