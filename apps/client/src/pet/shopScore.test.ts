import { describe, expect, it } from "vitest";

import type { CosmeticSlot } from "./types";

import { DRONE_HZ, ORB_HZ } from "./shopAmbience";
import { SOUND_PANS } from "./shopMix";
import {
  COIN_GAIN_BELL,
  COIN_PARTIALS,
  createShopRng,
  cueJitter,
  D5_HZ,
  EQUIP_BEATS,
  EQUIP_CHORD,
  equipRun,
  FIZZLE_BELLS,
  GATHER_TONES,
  GLINT_BELLS,
  harpHz,
  HAT_TIP_BELLS,
  KNOCK_HZ,
  ORB_CHIME,
  ownedBells,
  pentatonicCents,
  pentatonicHz,
  ritualScore,
  ritualTimes,
  SHIMMER_BELLS,
  SHOP_CUES,
  SHOP_THEME,
  shortScore,
  sparkleBells,
  STAMP_THUDS,
  SUB_BLOOM,
  TAKE_OFF_SCORE,
  TILL_BELL,
  trailBells,
  tryOnBells,
  TRY_ON_PEAK,
  WAX_TONES,
  type RitualTimes,
} from "./shopScore";
import { purchaseTimeline } from "./shopTimeline";
import { UI_SOUND_NAMES } from "./uiSounds";

const SLOTS: CosmeticSlot[] = ["head", "face", "hands", "body", "aura"];

/** Der Kaufplan in Millisekunden ab C, so wie der Laden ihn an `shopSound.purchase` gibt. */
function timeline(price: number): RitualTimes {
  return ritualTimes(purchaseTimeline(price));
}

/** Alle Töne mit Tonhöhe, die der Laden spielt. Münzen klingen unharmonisch und fehlen hier. */
function pitchedNotes() {
  const rng = createShopRng(3);
  const ritual = ritualScore(timeline(8), rng);
  return [
    ...SLOTS.flatMap((slot) => [0, 1, 2, 3, 8].flatMap((price) => tryOnBells(slot, price))),
    ...SLOTS.flatMap((slot) => [...shortScore(slot).bells, ...ownedBells(slot)]),
    ...SLOTS.map((slot) => ({ hz: shortScore(slot).sigh.hz })),
    ...equipRun(),
    ...SHIMMER_BELLS,
    ...GLINT_BELLS,
    ...HAT_TIP_BELLS,
    ...ORB_CHIME,
    COIN_GAIN_BELL,
    ...ritual.trail,
    ...ritual.sparkle,
    ...sparkleBells(rng, 40),
    ...trailBells(rng, 0.6),
  ]
    .map((note) => note.hz)
    .concat(
      [...EQUIP_CHORD, ...SUB_BLOOM.map((note) => note.hz), ...GATHER_TONES.flat()],
      [TILL_BELL.hz, TAKE_OFF_SCORE.popFrom, TAKE_OFF_SCORE.popTo, TAKE_OFF_SCORE.bell],
      [...Object.values(KNOCK_HZ), ...STAMP_THUDS.heavy, ...STAMP_THUDS.light],
      [...WAX_TONES, ...FIZZLE_BELLS, ...DRONE_HZ, ORB_HZ.base, ORB_HZ.overtone],
      Array.from({ length: 20 }, (_, step) => harpHz(step)),
    );
}

describe("SHOP_THEME", () => {
  it("covers every UI sound", () => {
    expect(Object.keys(SHOP_THEME).sort()).toEqual([...UI_SOUND_NAMES].sort());
  });

  it("themes the controls and leaves rare moments to the MP3s", () => {
    for (const cue of Object.values(SHOP_THEME)) {
      if (cue !== null) expect(SHOP_CUES).toContain(cue);
    }
    expect(SHOP_THEME.tap).toBe("tap");
    expect(SHOP_THEME.select).toBe("pageTurn");
    expect(SHOP_THEME.error).toBe("fizzle");
    for (const rare of ["window", "windowClose", "achievement", "invite", "hatch"] as const) {
      expect(SHOP_THEME[rare]).toBeNull();
    }
  });
});

describe("pentatonic", () => {
  it("climbs D E F♯ A H from D5", () => {
    const steps = [0, 1, 2, 3, 4, 5].map((step) => pentatonicHz(step));
    expect(steps.map((hz) => Math.round(hz * 100) / 100)).toEqual([
      587.33, 659.26, 739.99, 880, 987.77, 1174.66,
    ]);
    expect(pentatonicHz(-5)).toBeCloseTo(D5_HZ / 2, 9);
    expect(pentatonicHz(-15)).toBeCloseTo(73.4163, 3);
  });

  it("keeps every pitched note in D major pentatonic within 1 cent", () => {
    const notes = pitchedNotes();
    expect(notes.length).toBeGreaterThan(200);
    for (const hz of notes) expect(pentatonicCents(hz)).toBeLessThan(1);
  });

  it("notices notes outside the key", () => {
    expect(pentatonicCents(311.13)).toBeGreaterThan(90);
    expect(pentatonicCents(ORB_HZ.base + ORB_HZ.beat)).toBeGreaterThan(1);
  });
});

describe("seeded scores", () => {
  it("repeat for the same seed and differ for another", () => {
    const one = ritualScore(timeline(3), createShopRng(7));
    expect(ritualScore(timeline(3), createShopRng(7))).toEqual(one);
    expect(ritualScore(timeline(3), createShopRng(8))).not.toEqual(one);
    expect(cueJitter(createShopRng(1), 4)).toEqual(cueJitter(createShopRng(1), 4));
  });

  it("keep every gain within (0, 1]", () => {
    const ritual = ritualScore(timeline(8), createShopRng(11));
    const gains = [
      ...SLOTS.flatMap((slot) => [...tryOnBells(slot, 8), ...ownedBells(slot)]),
      ...equipRun(),
      ...ritual.hits,
      ...ritual.trail,
      ...ritual.sparkle,
      ...SUB_BLOOM,
      ...SHIMMER_BELLS,
      ...GLINT_BELLS,
      ...HAT_TIP_BELLS,
      ...ORB_CHIME,
      COIN_GAIN_BELL,
    ].map((note) => note.gain);
    for (const gain of [...gains, ...TILL_BELL.gains, ...COIN_PARTIALS.gains]) {
      expect(gain).toBeGreaterThan(0);
      expect(gain).toBeLessThanOrEqual(1);
    }
  });

  it("jitter ±1.5 dB around −1.5 dB, up to 16 ms and ±8 % on filters, in three rounds", () => {
    const rng = createShopRng(5);
    for (let count = 0; count < 200; count++) {
      const jitter = cueJitter(rng, count);
      expect(jitter.gain).toBeGreaterThanOrEqual(10 ** (-3 / 20));
      expect(jitter.gain).toBeLessThanOrEqual(1);
      expect(jitter.delay).toBeGreaterThanOrEqual(0);
      expect(jitter.delay).toBeLessThanOrEqual(0.016);
      expect(Math.abs(jitter.filter - 1)).toBeLessThanOrEqual(0.08);
      expect(jitter.round).toBe(count % 3);
    }
  });
});

describe("try-on", () => {
  it("rises from the slot's root: head D5, face F♯5, hands A5, body E5, aura H5", () => {
    const roots = SLOTS.map((slot) => Math.round(tryOnBells(slot, 1)[0]?.hz ?? 0));
    expect(roots).toEqual([587, 740, 880, 659, 988]);
  });

  it("rings 3 to 5 bells with the price, 45 ms apart from the poof's peak", () => {
    expect([0, 1, 2, 3, 9].map((price) => tryOnBells("face", price).length)).toEqual([
      3, 3, 4, 5, 5,
    ]);
    const bells = tryOnBells("head", 3);
    expect(bells[0]?.at).toBe(TRY_ON_PEAK);
    expect((bells[1]?.at ?? 0) - (bells[0]?.at ?? 0)).toBeCloseTo(0.045, 9);
    const pitches = bells.map((note) => note.hz);
    expect(pitches).toEqual(pitches.slice().sort((a, b) => a - b));
  });

  it("rings exactly two bells when short, two an octave lower when owned", () => {
    expect(shortScore("hands").bells).toHaveLength(2);
    const owned = ownedBells("hands");
    expect(owned).toHaveLength(2);
    expect(owned[0]?.hz).toBeCloseTo((tryOnBells("hands", 1)[0]?.hz ?? 0) / 2, 9);
  });
});

describe("equip and take-off", () => {
  it("runs eight bells from D5 to D7 that land on the 450 ms peak", () => {
    const run = equipRun();
    expect(run).toHaveLength(8);
    expect(run[0]?.hz).toBeCloseTo(pentatonicHz(0), 9);
    expect(run.at(-1)?.hz).toBeCloseTo(pentatonicHz(10), 9);
    expect(run.at(-1)?.at).toBeCloseTo(EQUIP_BEATS.peak, 9);
    expect((run.at(-1)?.at ?? 0) - (run[0]?.at ?? 0)).toBeCloseTo(0.28, 9);
  });

  it("orders the beats", () => {
    expect(EQUIP_BEATS.swell).toBeLessThan(EQUIP_BEATS.peak);
    expect(EQUIP_BEATS.peak).toBeLessThan(EQUIP_BEATS.end);
    expect(TAKE_OFF_SCORE.popAt).toBeLessThan(TAKE_OFF_SCORE.seconds);
    expect(TAKE_OFF_SCORE.seconds).toBe(0.42);
  });
});

describe("ritualScore", () => {
  it("follows the purchase timeline for three coins", () => {
    const score = ritualScore(timeline(3), createShopRng(7));
    const firsts = score.hits.filter((hit) => hit.tock);
    expect(firsts.map((hit) => hit.at)).toEqual([0.48, 0.55, 0.62]);
    const bounces = score.hits.filter((hit) => !hit.tock).map((hit) => hit.at);
    expect(bounces).toEqual([0.532, 0.602, 0.638, 0.672].map((at) => expect.closeTo(at, 9)));
    expect(score.till).toBeCloseTo(0.74, 9);
    expect(score.gather?.from).toBeCloseTo(0.42, 9);
    expect(score.gather?.to).toBeCloseTo(0.84, 9);
    expect(score.whoosh).toEqual({ from: 0.84, to: 1.44 });
    expect(score.impact).toBeCloseTo(1.44, 9);
    for (const note of score.trail) expect(note.at).toBeGreaterThan(0.84);
    for (const note of score.trail) expect(note.at).toBeLessThan(1.44);
    expect(score.sparkle).toHaveLength(12);
    for (const note of score.sparkle) expect(note.at - 1.44).toBeLessThanOrEqual(0.3);
    expect(score.end).toBeGreaterThan(score.impact);
  });

  it("pans the coins monotonically from the purse to the tray", () => {
    for (const price of [1, 2, 3, 6, 8]) {
      const pans = ritualScore(timeline(price), createShopRng(price))
        .hits.filter((hit) => hit.tock)
        .map((hit) => hit.pan);
      pans.forEach((pan, index) => {
        expect(pan).toBeLessThanOrEqual(SOUND_PANS.purse);
        if (index > 0) expect(pan).toBeLessThan(pans[index - 1] ?? Infinity);
      });
      expect(pans.at(-1)).toBeCloseTo(SOUND_PANS.tray, 9);
    }
  });

  it("shrinks the spell to its impact under reduced motion", () => {
    const score = ritualScore(timeline(3), createShopRng(7), true);
    expect(score.gather).toBeNull();
    expect(score.whoosh).toBeNull();
    expect(score.trail).toEqual([]);
    expect(score.sparkle).toHaveLength(12);
    expect(score.hits.filter((hit) => hit.tock)).toHaveLength(3);
    expect(score.till).toBeCloseTo(0.74, 9);
  });

  it("reads its times from the purchase plan, shifted to now", () => {
    expect(timeline(3)).toEqual({
      coinLandsMs: [480, 550, 620],
      tillMs: 740,
      burstMs: 840,
      impactMs: 1440,
    });
    const late = ritualTimes(purchaseTimeline(3), 500);
    expect(late).toEqual({ coinLandsMs: [0, 50, 120], tillMs: 240, burstMs: 340, impactMs: 940 });
  });

  it("gathers only from now on", () => {
    const early = { coinLandsMs: [], tillMs: 0, burstMs: 200, impactMs: 800 };
    expect(ritualScore(early, createShopRng(1)).gather).toEqual({ from: 0, to: 0.2 });
    const instant = { ...early, burstMs: 50 };
    expect(ritualScore(instant, createShopRng(1)).gather).toBeNull();
  });
});
