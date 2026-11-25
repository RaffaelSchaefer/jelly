/**
 * The tabs on top of the lower third of the Jelly-News: the logo, the rubric with its sign and, for
 * a report from the hall, the live mark. They are small, so they carry no stripes: they are lacquered
 * instead, their color at the top deepening toward the bottom, with a highlight on the top edge.
 *
 * @module
 */

import type { NewsCard } from "./newsLines.ts";
import type { ThirdScene } from "./newsBarScene.ts";

import { cutToFit } from "./newsBarFit.ts";
import {
  clipTo,
  drawLogo,
  easeOut,
  LIVE_COLOR,
  measureLogo,
  measureWith,
  ON_COLOR,
  setFont,
  WEIGHT,
} from "./newsBarPaint.ts";
import { showBand } from "./newsBarScene.ts";
import { drawNewsSign } from "./newsBarSign.ts";
import { paintLacquer } from "./newsBarTexture.ts";
import { pulse } from "./newsBarTiming.ts";

/** The channel never shows its own name as a rubric, the logo says it already. */
const CHANNEL_RUBRIC = "JELLY NEWS";
const LIVE_TEXT = "LIVE";
/** Room between the tabs, and inside a tab around its text, as shares of the tab height. */
const TAG_GAP_SHARE = 0.3;
const TAB_PADDING_SHARE = 0.42;
/**
 * The sign of a rubric takes a square this many times its font size, with this much room before
 * the text. Picture and emoji take the same room, so the tab does not change when the picture comes.
 */
const SIGN = { room: 1.3, size: 1.15, gap: 0.4 };
/** The dot of the live mark, as a share of the tab height. It takes three of its radii of room. */
const LIVE_DOT_SHARE = 0.13;
const LIVE_DOT_ROOM = 3;
/** An urgent rubric pulses this often, in milliseconds, and this bright at most. */
const ALARM_MS = 900;
const ALARM_GLOW = 0.28;

/**
 * Paints the rubric tab with its sign and text, returns its width. The text is cut so the tab
 * stays within `most` pixels, and the sign keeps its square whether picture or emoji.
 */
function drawTab(
  context: CanvasRenderingContext2D,
  tab: { x: number; most: number; card: NewsCard },
  scene: ThirdScene,
): number {
  const { tags, fonts } = scene.layout;
  const padding = tags.height * TAB_PADDING_SHARE;
  const signRoom = fonts.tag * (SIGN.room + SIGN.gap);
  const measure = measureWith(context, WEIGHT.tag);
  const text = cutToFit(tab.card.rubric, tab.most - 2 * padding - signRoom, fonts.tag, measure);
  if (!text) return 0;
  const width = measure(text, fonts.tag) + 2 * padding + signRoom;
  paintLacquer(context, { ...tags, x: tab.x, width }, scene.colors.brand, "light");
  const middle = tags.y + tags.height / 2;
  const spot = { x: tab.x + padding + (fonts.tag * SIGN.room) / 2, y: middle };
  context.fillStyle = ON_COLOR;
  drawNewsSign(context, tab.card, { ...spot, size: fonts.tag * SIGN.size }, fonts.tag);
  setFont(context, fonts.tag, WEIGHT.tag);
  context.fillStyle = ON_COLOR;
  context.fillText(text, tab.x + padding + signRoom, middle, width - 2 * padding - signRoom);
  return width;
}

/** Paints the live mark at the right end of the tabs, with its dot. Returns where it begins. */
function drawLive(context: CanvasRenderingContext2D, scene: ThirdScene): number {
  const { tags, fonts } = scene.layout;
  const dot = tags.height * LIVE_DOT_SHARE;
  const padding = tags.height * TAB_PADDING_SHARE;
  setFont(context, fonts.tag, WEIGHT.tag);
  const width = context.measureText(LIVE_TEXT).width + 2 * padding + LIVE_DOT_ROOM * dot;
  const x = tags.x + tags.width - width;
  paintLacquer(context, { ...tags, x, width }, LIVE_COLOR, "light");
  setFont(context, fonts.tag, WEIGHT.tag);
  context.fillStyle = ON_COLOR;
  context.fillText(LIVE_TEXT, x + padding + LIVE_DOT_ROOM * dot, tags.y + tags.height / 2);
  // The dot blinks like a camera light, and holds still without motion.
  context.globalAlpha *= scene.reducedMotion ? 1 : 0.35 + 0.65 * pulse(scene.serverTime, 1200);
  context.beginPath();
  context.arc(x + padding + dot, tags.y + tags.height / 2, dot, 0, 2 * Math.PI);
  context.fill();
  return x;
}

/** Paints the rubric tab between `from` and `to`, pulsing while the report is urgent. */
function drawRubric(
  context: CanvasRenderingContext2D,
  scene: ThirdScene,
  from: number,
  to: number,
): void {
  const { card, layout } = scene;
  if (card.rubric === CHANNEL_RUBRIC) return;
  context.save();
  const shown = scene.reducedMotion ? 1 : easeOut(scene.texts);
  clipTo(context, { ...layout.tags, x: from, width: (to - from) * shown });
  context.globalAlpha *= scene.texts;
  const width = drawTab(context, { x: from, most: to - from, card }, scene);
  if (card.isUrgent && !scene.reducedMotion) {
    context.globalAlpha *= ALARM_GLOW * pulse(scene.serverTime, ALARM_MS);
    context.fillStyle = ON_COLOR;
    context.fillRect(from, layout.tags.y, width, layout.tags.height);
  }
  context.restore();
}

/** Paints the tabs on top of the headline: logo, rubric and, for a report from the hall, live. */
export function drawTags(context: CanvasRenderingContext2D, scene: ThirdScene): void {
  const { tags } = scene.layout;
  context.save();
  clipTo(context, { ...tags, width: tags.width * showBand(scene, 0) });
  drawLogo(context, tags, tags.height, true);
  const gap = tags.height * TAG_GAP_SHARE;
  const logoEnd = tags.x + measureLogo(context, tags.height);
  let end = tags.x + tags.width;
  if (scene.card.isLive) {
    context.save();
    context.globalAlpha *= scene.texts;
    end = drawLive(context, scene) - gap;
    context.restore();
  }
  drawRubric(context, scene, logoEnd, end);
  context.restore();
}
