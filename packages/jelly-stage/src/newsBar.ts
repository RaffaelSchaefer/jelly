/**
 * The television look of the Jelly-News, painted over the room: the opening title, the lower third
 * with logo, rubric, headline and reporter, the clock, the ticker and the card over the shoulder.
 * A breaking news takes the bar over for its seconds, with or without a show. Every motion follows
 * the report on air and the server time, so all screens show the same picture. The parts live in
 * the `newsBar*` modules beside this one.
 *
 * @module
 */

import type { StageInsets } from "./insets.ts";
import type { ScreenSize } from "./lens.ts";
import type { NewsBarLayout } from "./newsBarLayout.ts";
import type { NewsFlash, NewsLive } from "./newsDirector.ts";

import { drawBumper } from "./newsBarBumper.ts";
import { drawNewsCard } from "./newsBarCard.ts";
import { layoutNewsBar } from "./newsBarLayout.ts";
import { clipTo, FLASH_COLORS, pickColors } from "./newsBarPaint.ts";
import { drawLowerThird } from "./newsBarThird.ts";
import { findFlashPhase, findShowPhase, measureBumper, type FlashPhase } from "./newsBarTiming.ts";

/** What the look needs besides the news on air. */
export interface NewsBarFrame {
  /** Size of the picture in CSS pixels. */
  size: ScreenSize;
  /** Bands the page covers with its own buttons. The look stays between them. */
  insets: StageInsets;
  /** Server time in milliseconds, the clock all screens share. */
  serverTime: number;
  reducedMotion: boolean;
}

/** The news a frame can show: the report of a show and the latest breaking news. */
export interface NewsOnAir {
  live: NewsLive | null;
  flash: NewsFlash | null;
}

/** Returns the server time a breaking news gave the picture back during this report, if it did. */
function findReturn(live: NewsLive, flash: NewsFlash | null, serverTime: number): number | null {
  const isOver = flash !== null && flash.endsAt <= serverTime;
  return isOver && flash.endsAt > live.moment.startedAt ? flash.endsAt : null;
}

/** Paints the show: the opening title, or the card and the lower third. */
function drawShow(
  context: CanvasRenderingContext2D,
  news: { live: NewsLive; flash: NewsFlash | null; cover: number },
  layout: NewsBarLayout,
  frame: NewsBarFrame,
): void {
  const { live, flash } = news;
  const { serverTime, reducedMotion } = frame;
  const phase = findShowPhase(live.moment, serverTime, findReturn(live, flash, serverTime));
  context.save();
  context.globalAlpha *= phase.alpha * (1 - news.cover);
  const { card, ticker } = live;
  const colors = pickColors(card.isUrgent);
  const { kind } = live.moment.beat;
  if (layout.card && kind !== "intro" && kind !== "outro") {
    drawNewsCard(context, { card, rect: layout.card, colors, shown: phase.card, reducedMotion });
  }
  if (phase.build > 0) {
    context.save();
    if (reducedMotion) context.globalAlpha *= phase.build;
    const { build, texts } = phase;
    drawLowerThird(context, {
      card,
      ticker,
      layout,
      colors,
      build,
      texts,
      serverTime,
      reducedMotion,
    });
    context.restore();
  }
  // The opening title lies over the bands that build behind its leaving sweep.
  if (phase.bumper !== null) {
    const length = measureBumper(live.moment);
    drawBumper(context, { free: layout.free, progress: phase.bumper, length, reducedMotion });
  }
  context.restore();
}

/** A breaking news while it is on air, with how far it is in. */
interface FlashOnAir {
  flash: NewsFlash;
  phase: FlashPhase;
}

/** Returns the breaking news while it is on air, null before and after. */
function findFlashOnAir(flash: NewsFlash | null, serverTime: number): FlashOnAir | null {
  const phase = flash ? findFlashPhase(flash, serverTime) : null;
  return flash && phase ? { flash, phase } : null;
}

/** Paints a breaking news over the show, or alone. The ticker keeps the show's reports if one runs. */
function drawFlash(
  context: CanvasRenderingContext2D,
  news: FlashOnAir & { live: NewsLive | null },
  layout: NewsBarLayout,
  frame: NewsBarFrame,
): void {
  const { flash, phase, live } = news;
  const { serverTime, reducedMotion } = frame;
  context.save();
  context.globalAlpha *= phase.alpha * (reducedMotion ? phase.build : 1);
  const { card } = flash;
  const ticker = live ? live.ticker : flash.ticker;
  const colors = FLASH_COLORS;
  const { build, texts } = phase;
  drawLowerThird(context, {
    card,
    ticker,
    layout,
    colors,
    build,
    texts,
    serverTime,
    reducedMotion,
  });
  context.restore();
}

/** Paints the news on air over the picture: a breaking news before the show, nothing without news. */
export function drawNewsBar(
  context: CanvasRenderingContext2D,
  news: NewsOnAir,
  frame: NewsBarFrame,
): void {
  const layout = layoutNewsBar(frame.size, frame.insets);
  const { live } = news;
  const breaking = findFlashOnAir(news.flash, frame.serverTime);
  if (!layout || (!live && !breaking)) return;
  context.save();
  clipTo(context, layout.free);
  // The show goes while the red bands come, and is not painted at all once they cover it.
  const cover = breaking ? breaking.phase.cover : 0;
  if (live && cover < 1) drawShow(context, { live, flash: news.flash, cover }, layout, frame);
  if (breaking) drawFlash(context, { ...breaking, live }, layout, frame);
  context.restore();
}
