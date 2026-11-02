/**
 * Paints one frame. It only reads the scene and holds no state of its own.
 *
 * @module
 */

import type { MotionPose, StageEffect } from "./effects.ts";
import type { ScreenPoint, ScreenSize } from "./projection.ts";
import type { StageArea, StagePlayer, StagePoint } from "./types.ts";

import { calculateMotionPose } from "./effects.ts";
import { projectToScreen } from "./projection.ts";
import { SPRITE_FEET } from "./sprite.ts";

const STAGE_SIZE = 100;
const BACKDROP_TOP = "#0f1519";
const BACKDROP_BOTTOM = "#1e272a";
const FLOOR_COLOR = "rgba(255, 255, 255, 0.03)";
const AREA_FILL = "rgba(63, 232, 219, 0.07)";
const AREA_LINE = "rgba(63, 232, 219, 0.22)";
const SHADOW_COLOR = "rgba(0, 0, 0, 0.35)";
const TEXT_COLOR = "#f4f7f8";
const TEXT_OUTLINE = "rgba(10, 14, 16, 0.9)";
const SIGN_FILL = "#f5e6b8";
const SIGN_TEXT = "#3b2f0f";

/** Jelly height relative to the screen, limited by width so narrow screens still fit everyone. */
const JELLY_HEIGHT_SHARE = 0.14;
const JELLY_WIDTH_SHARE = 0.09;
const SPRITE_GRID = 256;
const SHADOW_WIDTH = 0.34;
const SHADOW_HEIGHT = 0.08;
const BREATH_AMOUNT = 0.025;
const BREATH_PERIOD_MS = 1800;
const FULL_CIRCLE = 2 * Math.PI;

const NAME_FONT_SHARE = 0.17;
const MIN_FONT_PIXELS = 11;
const NAME_GAP_SHARE = 0.08;
const HEAD_TOP_SHARE = 0.84;
const SIGN_FONT_SHARE = 0.16;
const SIGN_PADDING = 6;
const SIGN_RADIUS = 6;
const BUBBLE_FONT_SHARE = 0.42;
const TOAST_FONT_SHARE = 0.22;
const TOAST_RISE_SHARE = 0.5;
const OUTLINE_PIXELS = 3;

/** A jelly with the point where it is shown right now. */
export interface ShownJelly {
  player: StagePlayer;
  point: StagePoint;
  /** Offset in milliseconds, so jellies do not breathe in step. */
  breathOffset: number;
}

/** Everything a frame shows. */
export interface StageScene {
  size: ScreenSize;
  areas: StageArea[];
  jellies: ShownJelly[];
  effects: StageEffect[];
  signLabels: Map<string, string>;
  now: number;
  findSprite: (color: string, cosmetic: string | null) => CanvasImageSource;
}

/** A jelly with its screen position, used by all layers of a frame. */
interface PlacedJelly extends ShownJelly {
  screen: ScreenPoint;
  height: number;
}

/** Paints the whole stage, from back to front. */
export function drawStage(context: CanvasRenderingContext2D, scene: StageScene): void {
  drawFloor(context, scene);
  const placed = placeJellies(scene);
  for (const jelly of placed) {
    drawJelly(context, jelly, scene);
  }
  // Texts come last, so a jelly in front never covers a name.
  for (const jelly of placed) {
    drawLabels(context, jelly, scene);
  }
  drawEffects(context, placed, scene);
}

/** Sorts jellies by depth, so nearer ones cover those behind them. */
function placeJellies(scene: StageScene): PlacedJelly[] {
  const fullHeight = Math.min(
    scene.size.height * JELLY_HEIGHT_SHARE,
    scene.size.width * JELLY_WIDTH_SHARE,
  );
  return scene.jellies
    .map((jelly) => {
      const screen = projectToScreen(jelly.point, scene.size);
      return { ...jelly, screen, height: fullHeight * screen.scale };
    })
    .sort((first, second) => first.screen.y - second.screen.y);
}

/** Paints the room and the unlabeled areas. */
function drawFloor(context: CanvasRenderingContext2D, scene: StageScene): void {
  const { size, areas } = scene;
  const backdrop = context.createLinearGradient(0, 0, 0, size.height);
  backdrop.addColorStop(0, BACKDROP_TOP);
  backdrop.addColorStop(1, BACKDROP_BOTTOM);
  context.fillStyle = backdrop;
  context.fillRect(0, 0, size.width, size.height);
  context.fillStyle = FLOOR_COLOR;
  context.fill(traceFloorShape({ id: 0, x: 0, y: 0, width: STAGE_SIZE, height: STAGE_SIZE }, size));
  context.lineWidth = 2;
  for (const area of areas) {
    const shape = traceFloorShape(area, size);
    context.fillStyle = AREA_FILL;
    context.strokeStyle = AREA_LINE;
    context.fill(shape);
    context.stroke(shape);
  }
}

/** Returns the outline of a rectangle lying on the floor. */
function traceFloorShape(area: StageArea, size: ScreenSize): Path2D {
  const corners = [
    { x: area.x, y: area.y },
    { x: area.x + area.width, y: area.y },
    { x: area.x + area.width, y: area.y + area.height },
    { x: area.x, y: area.y + area.height },
  ];
  const shape = new Path2D();
  for (const corner of corners) {
    const screen = projectToScreen(corner, size);
    shape.lineTo(screen.x, screen.y);
  }
  shape.closePath();
  return shape;
}

/** Returns the current motion of a jelly, or the resting pose. */
function findPose(playerId: number, scene: StageScene): MotionPose {
  for (const effect of scene.effects) {
    if (effect.kind === "motion" && effect.playerId === playerId) {
      const progress = (scene.now - effect.startedAt) / (effect.endsAt - effect.startedAt);
      return calculateMotionPose(effect.motion, progress);
    }
  }
  return { lift: 0, angle: 0 };
}

/** Paints shadow and body. */
function drawJelly(context: CanvasRenderingContext2D, jelly: PlacedJelly, scene: StageScene): void {
  const { screen, height, player } = jelly;
  context.fillStyle = SHADOW_COLOR;
  context.beginPath();
  context.ellipse(
    screen.x,
    screen.y,
    height * SHADOW_WIDTH,
    height * SHADOW_HEIGHT,
    0,
    0,
    FULL_CIRCLE,
  );
  context.fill();

  const pose = findPose(player.id, scene);
  const wave = (scene.now + jelly.breathOffset) / BREATH_PERIOD_MS;
  const breath = 1 + BREATH_AMOUNT * Math.sin(wave * FULL_CIRCLE);
  context.save();
  context.translate(screen.x, screen.y - pose.lift * height);
  context.rotate(pose.angle);
  context.scale(1 / breath, breath);
  const feet = (height * SPRITE_FEET) / SPRITE_GRID;
  context.drawImage(
    scene.findSprite(player.color, player.cosmetic),
    -height / 2,
    -feet,
    height,
    height,
  );
  context.restore();
}

/** Writes text with a dark edge, so it stays readable on any jelly. */
function writeOutlined(
  context: CanvasRenderingContext2D,
  text: string,
  position: { x: number; y: number },
): void {
  context.strokeStyle = TEXT_OUTLINE;
  context.lineWidth = OUTLINE_PIXELS;
  context.lineJoin = "round";
  context.strokeText(text, position.x, position.y);
  context.fillStyle = TEXT_COLOR;
  context.fillText(text, position.x, position.y);
}

/** Sets a font scaled to the jelly, but never below a readable size. */
function useFont(context: CanvasRenderingContext2D, pixels: number, weight = "600"): void {
  const size = Math.max(MIN_FONT_PIXELS, Math.round(pixels));
  context.font = `${weight} ${size}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
}

/** Paints the name below a jelly and its sign above it. */
function drawLabels(
  context: CanvasRenderingContext2D,
  jelly: PlacedJelly,
  scene: StageScene,
): void {
  const { screen, height, player } = jelly;
  useFont(context, height * NAME_FONT_SHARE);
  const nameY = screen.y + height * NAME_GAP_SHARE + height * NAME_FONT_SHARE;
  writeOutlined(context, `${player.name} · ${player.level}`, { x: screen.x, y: nameY });
  const signLabel = scene.signLabels.get(player.sign ?? "");
  if (signLabel) {
    drawSign(context, signLabel, jelly);
  }
}

/** Paints a sign over the head. */
function drawSign(context: CanvasRenderingContext2D, label: string, jelly: PlacedJelly): void {
  const { screen, height } = jelly;
  useFont(context, height * SIGN_FONT_SHARE);
  const fontPixels = Math.max(MIN_FONT_PIXELS, height * SIGN_FONT_SHARE);
  const width = context.measureText(label).width + 2 * SIGN_PADDING;
  const boxHeight = fontPixels + SIGN_PADDING;
  const centerY = screen.y - height * HEAD_TOP_SHARE - boxHeight;
  context.fillStyle = SIGN_FILL;
  context.beginPath();
  context.roundRect(screen.x - width / 2, centerY - boxHeight / 2, width, boxHeight, SIGN_RADIUS);
  context.fill();
  context.fillStyle = SIGN_TEXT;
  context.fillText(label, screen.x, centerY);
}

/** Paints bubbles and rising texts over their jellies. */
function drawEffects(
  context: CanvasRenderingContext2D,
  placed: PlacedJelly[],
  scene: StageScene,
): void {
  const jellyById = new Map(placed.map((jelly) => [jelly.player.id, jelly]));
  for (const effect of scene.effects) {
    const jelly = jellyById.get(effect.playerId);
    if (!jelly || effect.kind === "motion") {
      continue;
    }
    const progress = (scene.now - effect.startedAt) / (effect.endsAt - effect.startedAt);
    const headY = jelly.screen.y - jelly.height * HEAD_TOP_SHARE;
    context.globalAlpha = Math.min(1, 2 * (1 - progress));
    if (effect.kind === "bubble") {
      useFont(context, jelly.height * BUBBLE_FONT_SHARE);
      context.fillText(effect.glyph, jelly.screen.x, headY - jelly.height * BUBBLE_FONT_SHARE);
    } else {
      useFont(context, jelly.height * TOAST_FONT_SHARE, "700");
      const riseY = headY - progress * jelly.height * TOAST_RISE_SHARE;
      writeOutlined(context, effect.text, { x: jelly.screen.x, y: riseY });
    }
    context.globalAlpha = 1;
  }
}
