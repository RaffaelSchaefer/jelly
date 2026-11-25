/**
 * The lower third of the Jelly-News: the logo and the rubric as tabs on top, the headline on a
 * light band, the line about who reports below it, the ticker under all of it. Bands build from the
 * left, texts come up from below, and with less motion both only fade. Bands live in
 * `newsBarBands.ts`, tabs in `newsBarTabs.ts`, the ticker in `newsBarTicker.ts`.
 *
 * @module
 */

import type { Rect } from "./newsBarLayout.ts";
import type { ThirdScene } from "./newsBarScene.ts";

import { drawBands, measureHeadlineBar, measureSubEnd } from "./newsBarBands.ts";
import { fitHeadline, fitLine } from "./newsBarFit.ts";
import {
  clipTo,
  easeOut,
  measureWith,
  ON_COLOR,
  setFont,
  stagger,
  WEIGHT,
} from "./newsBarPaint.ts";
import { showBand } from "./newsBarScene.ts";
import { drawTags } from "./newsBarTabs.ts";
import { drawTicker } from "./newsBarTicker.ts";

export type { ThirdScene } from "./newsBarScene.ts";

/** Lines of a headline stand this far apart, as a share of their size. */
const LINE_HEIGHT = 1.14;
/** Texts come up from this deep in their band, as a share of its height. */
const RISE_SHARE = 0.65;

/** Clips to what is built of a band and sets how a text in it is in. Returns its offset downward. */
function enterText(
  context: CanvasRenderingContext2D,
  scene: ThirdScene,
  band: { rect: Rect; index: number; delay: number },
): number {
  const { rect, index, delay } = band;
  clipTo(context, { ...rect, width: rect.width * showBand(scene, index) });
  const shown = stagger(scene.texts, delay, 2);
  context.globalAlpha *= shown;
  return scene.reducedMotion ? 0 : (1 - easeOut(shown)) * rect.height * RISE_SHARE;
}

/** Writes the headline, on one line or two, cut only if two lines at the smallest size do not hold it. */
function drawHeadline(context: CanvasRenderingContext2D, scene: ThirdScene): void {
  const { layout, colors } = scene;
  const { headline: rect, padding } = layout;
  const indent = measureHeadlineBar(rect.height) + padding;
  const width = rect.width - indent - padding;
  const box = { width, ...layout.fonts.headline };
  const fitted = fitHeadline(scene.card.headline, box, measureWith(context, WEIGHT.headline));
  context.save();
  const drop = enterText(context, scene, { rect, index: 0, delay: 0 });
  setFont(context, fitted.size, WEIGHT.headline);
  context.fillStyle = colors.ink;
  const step = fitted.size * LINE_HEIGHT;
  const firstY = rect.y + rect.height / 2 - ((fitted.lines.length - 1) * step) / 2 + drop;
  fitted.lines.forEach((line, index) => {
    context.fillText(line, rect.x + indent, firstY + index * step, width);
  });
  context.restore();
}

/** Writes who reports or what it is about, in the band under the headline, before its slanted end. */
function drawSub(context: CanvasRenderingContext2D, scene: ThirdScene): void {
  const { sub: rect, padding, fonts } = scene.layout;
  const width = rect.width - padding - measureSubEnd(rect.height);
  const fitted = fitLine(
    scene.card.sub,
    { width, ...fonts.sub },
    measureWith(context, WEIGHT.text),
  );
  context.save();
  const drop = enterText(context, scene, { rect, index: 1, delay: 1 });
  setFont(context, fitted.size, WEIGHT.text);
  context.fillStyle = ON_COLOR;
  context.fillText(fitted.lines[0] ?? "", rect.x + padding, rect.y + rect.height / 2 + drop, width);
  context.restore();
}

/** Paints the lower third with the ticker under it. */
export function drawLowerThird(context: CanvasRenderingContext2D, scene: ThirdScene): void {
  drawBands(context, scene);
  drawTags(context, scene);
  drawHeadline(context, scene);
  drawSub(context, scene);
  drawTicker(context, { ...scene, shown: showBand(scene, 2) });
}
