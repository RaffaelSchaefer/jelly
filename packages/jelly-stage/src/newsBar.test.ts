import assert from "node:assert/strict";
import { test } from "node:test";

import type { NewsMoment } from "./news.ts";
import type { Rect } from "./newsBarLayout.ts";
import type { StageCatalog, StageGathering, StagePlayer } from "./types.ts";

import { NO_INSETS } from "./insets.ts";
import { drawNewsBar } from "./newsBar.ts";
import { cutToFit, fitHeadline, fitLine, type MeasureText } from "./newsBarFit.ts";
import { layoutNewsBar } from "./newsBarLayout.ts";
import {
  findFlashPhase,
  findShowPhase,
  findTickerItem,
  findTickerPhase,
  measureBumper,
} from "./newsBarTiming.ts";
import { createNewsDirector, flashNews, stepNews } from "./newsDirector.ts";

/** Like a system font: every character is half the size wide, plus some tracking that small sizes feel more. */
const measure: MeasureText = (text, size) => [...text].length * (size * 0.5 + 1.2);
const MAP_INSETS = { top: 44, bottom: 70 };
const SCREENS = [
  { width: 520, height: 460 },
  { width: 720, height: 600 },
  { width: 1920, height: 1080 },
];
const HEADLINE = {
  width: 300,
  single: { largest: 24, smallest: 18 },
  double: { largest: 16, smallest: 12 },
};

function makeMoment(kind: "intro" | "top_xp" | "outro", length: number, run = 1): NewsMoment {
  const beat = kind === "top_xp" ? { kind, playerId: 2, xp: 300 } : { kind };
  return { beat, index: 0, run, progress: 0, startedAt: 10_000, endsAt: 10_000 + length };
}

function overlaps(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

function isInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

test("a line takes the largest size that fits, then shrinks, then gets an ellipsis", () => {
  const box = { width: 200, largest: 20, smallest: 12 };
  assert.deepEqual(fitLine("IM STUDIO", box, measure), { size: 20, lines: ["IM STUDIO"] });
  const shrunk = fitLine("IM STUDIO: Prinzessin", box, measure);
  assert.ok(shrunk.size < 20 && shrunk.size >= 12);
  assert.ok(measure(shrunk.lines[0] ?? "", shrunk.size) <= 200);
  const cut = fitLine("Bitte Controller mitbringen und pünktlich sein. ".repeat(4), box, measure);
  assert.equal(cut.size, 12);
  assert.match(cut.lines[0] ?? "", /…$/);
  assert.ok(measure(cut.lines[0] ?? "", 12) <= 200);
});

test("a headline shrinks first, then takes two even lines, then is cut", () => {
  const short = fitHeadline("Guten Tag.", HEADLINE, measure);
  assert.deepEqual(short, { size: 24, lines: ["Guten Tag."] });
  const shrunk = fitHeadline("Jelly 2 sammelt 420 XP.", HEADLINE, measure);
  assert.equal(shrunk.lines.length, 1);
  assert.ok(shrunk.size < 24 && shrunk.size >= 18);
  const two = fitHeadline(
    "Wasserwerke schlagen Alarm: Jelly 2 ist gut hydriert.",
    HEADLINE,
    measure,
  );
  assert.equal(two.lines.length, 2);
  assert.deepEqual(two.lines, ["Wasserwerke schlagen Alarm:", "Jelly 2 ist gut hydriert."]);
  const long = fitHeadline("Um 20:00 Uhr: Großes Turnier. ".repeat(6), HEADLINE, measure);
  assert.equal(long.size, 12);
  assert.equal(long.lines.length, 2);
  assert.doesNotMatch(long.lines[0] ?? "", /…$/);
  assert.match(long.lines[1] ?? "", /…$/);
});

test("no line ever comes out wider than its band", () => {
  const texts = [
    "„Bin ich jetzt auf dem Beamer?!“",
    "A".repeat(200),
    `Prinzessin🎉Wackelpudding${"x".repeat(80)} sammelt 420 XP.`,
    "Um 20:00 Uhr: Großes Mario-Kart-Turnier der Umwelt-Campus-LAN mit Siegerehrung im Foyer!!",
  ];
  for (const width of [3, 40, 120, 300, 900]) {
    for (const text of texts) {
      const headline = fitHeadline(text, { ...HEADLINE, width }, measure);
      for (const line of headline.lines) assert.ok(measure(line, headline.size) <= width, line);
      const line = fitLine(text, { width, largest: 20, smallest: 12 }, measure);
      assert.ok(measure(line.lines[0] ?? "", line.size) <= width);
    }
  }
});

test("a cut keeps whole characters, drops loose punctuation and prefers the end of a word", () => {
  assert.equal(cutToFit("Party 🎉🎉🎉🎉", 60, 10, measure), "Party 🎉🎉…");
  assert.equal(cutToFit("Hallo, Welt und mehr", 50, 10, measure), "Hallo…");
  assert.equal(cutToFit("Bitte Controller mitbringen", 130, 10, measure), "Bitte Controller…");
  assert.equal(cutToFit("Lang", 2, 10, measure), "");
});

test("every part stays between the insets and nothing overlaps", () => {
  for (const size of SCREENS) {
    for (const insets of [NO_INSETS, MAP_INSETS]) {
      const layout = layoutNewsBar(size, insets);
      assert.ok(layout, `${size.width}x${size.height}`);
      const free = {
        x: 0,
        y: insets.top,
        width: size.width,
        height: size.height - insets.top - insets.bottom,
      };
      assert.deepEqual(layout.free, free);
      const parts = [layout.tags, layout.headline, layout.sub, layout.ticker];
      assert.ok(layout.card, "the card has room on every usual screen");
      for (const part of [...parts, layout.card]) assert.ok(isInside(part, free));
      [...parts, layout.card].forEach((part, index, all) => {
        for (const other of all.slice(index + 1)) assert.ok(!overlaps(part, other));
      });
      assert.ok(isInside(layout.clock, layout.ticker));
      assert.ok(layout.fonts.tag >= 11 && layout.fonts.ticker >= 11);
      assert.ok(layout.fonts.headline.double.smallest >= 11 && layout.fonts.sub.smallest >= 11);
    }
  }
});

test("a beamer gets letters for the back of the hall, a tiny picture gets no look", () => {
  const beamer = layoutNewsBar({ width: 1920, height: 1080 }, NO_INSETS);
  assert.ok(beamer && beamer.fonts.headline.single.largest >= 44);
  // A 4K picture without scaling gets everything twice as large, the card too.
  const huge = layoutNewsBar({ width: 3840, height: 2160 }, NO_INSETS);
  assert.ok(huge?.card && beamer.card);
  assert.ok(Math.abs(huge.card.width / beamer.card.width - 2) < 0.02);
  assert.ok(Math.abs(huge.headline.height / beamer.headline.height - 2) < 0.02);
  assert.equal(layoutNewsBar({ width: 180, height: 400 }, NO_INSETS), null);
  // Insets that cover more than half of a small window are cut to half, see `keepHalf`.
  const squeezed = layoutNewsBar({ width: 520, height: 460 }, { top: 200, bottom: 200 });
  assert.ok(squeezed && squeezed.tags.y >= squeezed.free.y);
});

test("the ticker stands at the same words for the same server time, on any screen", () => {
  const time = 1_795_000_012_345;
  assert.equal(findTickerPhase(240, time), findTickerPhase(240, time));
  const phase = findTickerPhase(240, time);
  assert.ok(phase >= 0 && phase < 1);
  assert.notEqual(findTickerPhase(240, time + 500), phase);
  // One loop later it stands where it stood.
  assert.equal(findTickerPhase(240, time + 240 * 130), phase);
  assert.equal(findTickerItem(4, time), findTickerItem(4, time + 10));
});

test("the opening title leaves time to read the greeting, also in the shortest opening", () => {
  const intro = makeMoment("intro", 3600);
  assert.ok(measureBumper(intro) <= 1500);
  assert.equal(measureBumper(makeMoment("top_xp", 8000)), 0);
  assert.ok(findShowPhase(intro, intro.startedAt + 100, null).bumper !== null);
  // The bands build behind the leaving title, the greeting is in well before the end.
  const done = findShowPhase(intro, intro.endsAt - 1500, null);
  assert.equal(done.bumper, null);
  assert.equal(done.texts, 1);
  assert.equal(done.build, 1);
});

test("a late screen finds everything in place, a report brings its texts in and out", () => {
  const report = makeMoment("top_xp", 8000);
  const middle = findShowPhase(report, report.startedAt + 4000, null);
  assert.deepEqual(middle, { bumper: null, build: 1, texts: 1, card: 1, alpha: 1 });
  assert.equal(findShowPhase(report, report.startedAt, null).texts, 0);
  assert.ok(findShowPhase(report, report.endsAt - 50, null).texts < 0.5);
});

test("the closing fades the look before the show ends", () => {
  const outro = makeMoment("outro", 4800);
  assert.equal(findShowPhase(outro, outro.startedAt + 1000, null).alpha, 1);
  assert.ok(findShowPhase(outro, outro.endsAt - 300, null).alpha < 0.5);
  assert.equal(findShowPhase(outro, outro.endsAt, null).alpha, 0);
  // The texts of the closing stay until the whole look goes.
  assert.equal(findShowPhase(outro, outro.endsAt - 300, null).texts, 1);
});

test("after a breaking news the bands build again", () => {
  const report = makeMoment("top_xp", 12_000);
  const back = report.startedAt + 6000;
  assert.equal(findShowPhase(report, back + 10, back).build < 0.1, true);
  assert.equal(findShowPhase(report, back + 10, back).texts, 0);
  assert.equal(findShowPhase(report, back + 2000, back).texts, 1);
});

test("a breaking news is on air for its time only and covers the show", () => {
  const flash = { startedAt: 50_000, endsAt: 58_000 };
  assert.equal(findFlashPhase(flash, 49_999), null);
  assert.equal(findFlashPhase(flash, 58_000), null);
  assert.equal(findFlashPhase(flash, 50_000)?.cover, 0);
  assert.equal(findFlashPhase(flash, 52_000)?.cover, 1);
  assert.ok((findFlashPhase(flash, 57_900)?.alpha ?? 1) < 0.5);
});

const ENDS_AT = 1_795_000_090_000;
const catalog: StageCatalog = {
  signs: [],
  achievements: [{ key: "hatched", title: "Geschlüpft" }],
};
const players: StagePlayer[] = [1, 2, 3, 4].map((id) => ({
  id,
  name: id === 2 ? "Prinzessin Wackelpudding die Dritte" : `Jelly ${id}`,
  color: "mint",
  equipped: {},
  level: 1,
  sign: null,
  follow: null,
  area_id: null,
  is_visitor: false,
  home_x: 10,
  home_y: 20,
}));
const gathering: StageGathering = {
  kind: "news",
  winner_id: null,
  ends_at: ENDS_AT,
  presenter_id: 1,
  news: {
    top_xp: { player_id: 2, xp: 300 },
    achievements: [{ player_id: 3, key: "hatched" }],
    tallest_stack: [3, 4],
    next_item: {
      starts_at: ENDS_AT,
      ends_at: null,
      title: "T".repeat(80),
      detail: "D".repeat(200),
      kind: "orga",
    },
  },
};

/** A 2D context that only counts: text is as wide as the test measure says, all else does nothing. */
function makeContext() {
  const counts = { saves: 0, depth: 0, texts: 0 };
  let font = "10px";
  const target: Record<string | symbol, unknown> = {
    canvas: { style: {} },
    globalAlpha: 1,
    save: () => {
      counts.saves += 1;
      counts.depth += 1;
    },
    restore: () => {
      counts.depth -= 1;
      assert.ok(counts.depth >= 0, "restore without save");
    },
    measureText: (text: string) => ({
      width: measure(text, Number(/([\d.]+)px/u.exec(font)?.[1])),
    }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillText: () => {
      counts.texts += 1;
    },
  };
  const context = new Proxy(target, {
    get: (object, key) => (key in object ? object[key] : () => undefined),
    set: (object, key, value) => {
      if (key === "font") font = String(value);
      object[key] = value;
      return true;
    },
  });
  return { context: context as unknown as CanvasRenderingContext2D, counts };
}

test("the look paints every moment of a show and a breaking news, and leaves the canvas as it was", () => {
  const director = createNewsDirector();
  const award = { id: 7, type: "award.given", player_id: 2, payload: { title: "A".repeat(90) } };
  let texts = 0;
  for (let left = 89_900; left > 0; left -= 700) {
    const serverTime = ENDS_AT - left;
    stepNews(director, { gathering, players, catalog, serverTime, now: serverTime });
    // The award comes 30 seconds before the end, while the show runs.
    if (left < 30_000)
      flashNews(director, { ...award, created_at: ENDS_AT - 30_000 }, { players, serverTime });
    for (const size of SCREENS) {
      for (const reducedMotion of [false, true]) {
        const { context, counts } = makeContext();
        drawNewsBar(context, director, { size, insets: MAP_INSETS, serverTime, reducedMotion });
        assert.equal(counts.depth, 0, `unbalanced at ${left} ms before the end`);
        assert.ok(counts.saves > 0);
        texts += counts.texts;
      }
    }
  }
  assert.ok(texts > 0);
});

test("without news the look paints nothing", () => {
  const { context, counts } = makeContext();
  const frame = {
    size: { width: 720, height: 600 },
    insets: NO_INSETS,
    serverTime: ENDS_AT,
    reducedMotion: false,
  };
  drawNewsBar(context, { live: null, flash: null }, frame);
  assert.deepEqual(counts, { saves: 0, depth: 0, texts: 0 });
});

test("the lower third and the card share one rhythm of stripes, finer in a small window", () => {
  const beamer = layoutNewsBar({ width: 1920, height: 1080 }, NO_INSETS);
  const map = layoutNewsBar({ width: 520, height: 460 }, MAP_INSETS);
  assert.ok(beamer?.card && map?.card);
  assert.equal(beamer.card.period, beamer.stripes.period);
  assert.deepEqual([beamer.stripes.x, beamer.stripes.y], [beamer.tags.x, beamer.tags.y]);
  assert.ok(beamer.stripes.period > 50 && beamer.stripes.period < 65);
  assert.ok(map.stripes.period >= 20 && map.stripes.period < beamer.stripes.period);
});
