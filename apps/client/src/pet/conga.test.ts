import { CONGA_BAR, CONGA_BEAT_MS } from "@jelly/stage/conga";
import { describe, expect, it } from "vitest";

import {
  CONGA_BED,
  congaAfterRead,
  congaBedSegments,
  congaChange,
  ownConga,
  PREVIEW_CONGA_MS,
  PREVIEW_CONGA_STEPS_MS,
  previewCongaPlayers,
  sameConga,
  type CongaPlace,
} from ".";

/** Das eigene Jelly. */
const OWN = 7;

/** Ein Jelly, das `target` bis `endsAt` folgt, oder niemandem. */
const jelly = (id: number, target: number | null = null, endsAt = 1000) => ({
  id,
  follow: target === null ? null : { player_id: target, ends_at: endsAt },
});

/** Eine Polonaise aus diesen Jellies, das eigene an Platz `rank`. */
const line = (memberIds: number[], rank = memberIds.indexOf(OWN), endsAt = 1000): CongaPlace => ({
  memberIds,
  rank,
  endsAt,
});

describe("the own conga line", () => {
  it("needs three jellies in one follow tree", () => {
    expect(ownConga([jelly(1), jelly(OWN, 1)], OWN, 0)).toBeNull();
    expect(ownConga([jelly(1), jelly(OWN, 1), jelly(8, 1)], OWN, 0)).toEqual(line([1, OWN, 8]));
    expect(ownConga([jelly(OWN), jelly(8, OWN), jelly(9, 8)], OWN, 0)).toEqual(line([OWN, 8, 9]));
  });

  it("is not a line of others", () => {
    const players = [jelly(1), jelly(2, 1), jelly(3, 2), jelly(OWN), jelly(8, OWN)];
    expect(ownConga(players, OWN, 0)).toBeNull();
  });

  it("ends with the last follow in it and ignores follows that ran out", () => {
    const players = [jelly(1), jelly(OWN, 1, 500), jelly(8, 1, 900), jelly(9, 8, 700)];
    expect(ownConga(players, OWN, 0)).toEqual(line([1, OWN, 8, 9], 1, 900));
    expect(ownConga(players, OWN, 500)).toBeNull();
    expect(ownConga(players, 8, 500)).toEqual(line([1, 8, 9], 1, 900));
    expect(ownConga(players, 8, 700)).toBeNull();
  });
});

describe("the own conga line after reading the stage", () => {
  const players = [jelly(1), jelly(OWN, 1), jelly(8, 1)];

  it("follows the stage", () => {
    const reading = { players, serverTime: 100 };
    expect(congaAfterRead(reading, null, OWN, 90)).toEqual(line([1, OWN, 8]));
    expect(congaAfterRead({ players: [], serverTime: 100 }, line([1, OWN, 8]), OWN, 90)).toBeNull();
  });

  it("counts a follow as over by the later of both clocks", () => {
    expect(congaAfterRead({ players, serverTime: 990 }, null, OWN, 1000)).toBeNull();
    expect(congaAfterRead({ players, serverTime: 1000 }, null, OWN, 990)).toBeNull();
  });

  it("keeps the line when reading fails, until its last follow has run out", () => {
    expect(congaAfterRead(null, line([1, OWN, 8]), OWN, 999)).toBeUndefined();
    expect(congaAfterRead(null, line([1, OWN, 8]), OWN, 1000)).toBeNull();
    expect(congaAfterRead(null, null, OWN, 1000)).toBeUndefined();
  });
});

describe("what the jelly says about its conga line", () => {
  it("hops when it is new in a line", () => {
    expect(congaChange(null, line([1, OWN, 8]))).toEqual({
      message: "Polonaise! Wir sind zu dritt.",
      hops: true,
    });
    const eleven = line([OWN, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11]);
    expect(congaChange(null, eleven).message).toBe("Polonaise! Wir sind 11 Jellies.");
  });

  it("notices the line growing and shrinking", () => {
    expect(congaChange(line([1, OWN, 8]), line([1, OWN, 8, 9]))).toEqual({
      message: "Die Polonaise wächst, wir sind zu viert!",
      hops: false,
    });
    expect(congaChange(line([1, OWN, 8, 9]), line([1, OWN, 8]))).toEqual({
      message: "Schade, da geht wer. Wir sind noch zu dritt.",
      hops: false,
    });
  });

  it("says when the line is over", () => {
    expect(congaChange(line([1, OWN, 8]), null)).toEqual({
      message: "Die Polonaise ist vorbei. Schön war’s!",
      hops: false,
    });
  });

  it("stays quiet without news", () => {
    const quiet = { message: null, hops: false };
    expect(congaChange(null, null)).toEqual(quiet);
    expect(congaChange(line([1, OWN, 8]), line([1, 8, OWN]))).toEqual(quiet);
    expect(congaChange(line([1, OWN, 8]), line([1, OWN, 8], 1, 2000))).toEqual(quiet);
  });

  it("tells the same line from a changed one", () => {
    expect(sameConga(null, null)).toBe(true);
    expect(sameConga(line([1, OWN, 8]), line([1, OWN, 8]))).toBe(true);
    expect(sameConga(line([1, OWN, 8]), null)).toBe(false);
    expect(sameConga(line([1, OWN, 8]), line([1, 8, OWN]))).toBe(false);
    expect(sameConga(line([1, OWN, 8]), line([1, OWN, 8], 1, 2000))).toBe(false);
  });
});

describe("the music to the conga line", () => {
  it("loops over whole bars of the dance", () => {
    const loopMs = (CONGA_BED.loopEnd - CONGA_BED.loopStart) * 1000;
    const bars = loopMs / (CONGA_BEAT_MS * CONGA_BAR);
    expect(Math.abs(bars - Math.round(bars))).toBeLessThan(0.01);
  });

  it("fades in softly and loops for a long time", () => {
    const segments = congaBedSegments();
    expect(segments[0]).toMatchObject({ at: 0, offset: 0, fadeIn: CONGA_BED.fadeIn });
    expect(segments[0]!.fadeIn).toBeGreaterThanOrEqual(1);
    expect(segments[1]).toMatchObject({ at: CONGA_BED.loopEnd, offset: CONGA_BED.loopStart });
    expect(segments.at(-1)!.fadeOut).toBeGreaterThan(0);
    expect(segments.length).toBeGreaterThan(100);
  });
});

describe("the conga line of the preview", () => {
  const at = (ms: number) => ownConga(previewCongaPlayers(0, 5000, 5000 + ms), 0, 5000 + ms);

  it("forms, grows, shrinks and runs out by the clock", () => {
    const [start, joins, leaves] = PREVIEW_CONGA_STEPS_MS;
    expect(at(start)?.memberIds).toEqual([7, 0, 8]);
    expect(at(joins)?.memberIds).toEqual([7, 0, 8, 9]);
    expect(at(leaves)?.memberIds).toEqual([7, 0, 8]);
    expect(at(leaves)?.endsAt).toBe(5000 + PREVIEW_CONGA_MS);
    expect(at(PREVIEW_CONGA_MS)).toBeNull();
  });
});
