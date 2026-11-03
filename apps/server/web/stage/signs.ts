/**
 * Signs with text, painted once into a canvas: the neon sign of the lounge and the boards of the
 * snack bar. Their texts are German, like everything the stage shows.
 *
 * @module
 */

import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from "three";

import { keepMaterial } from "./props.ts";

/** Canvas pixels per jelly unit, enough for sharp letters on a 4K screen. */
const PIXELS_PER_UNIT = 320;
const FONT_FAMILY = "system-ui, sans-serif";
/** Letters fill this share of the sign height and keep this share of the width free. */
const TEXT_HEIGHT_SHARE = 0.6;
const TEXT_WIDTH_SHARE = 0.84;
/** Blur of the glow around neon letters and tubes, as a share of the letter size. */
const GLOW_BLURS = [0.5, 0.22];
const CORE_BLUR = 0.06;
/** A neon tube runs around the sign this far inside its edge, as a share of the height. */
const TUBE_INSET = 0.12;
const TUBE_WIDTH = 0.035;
const ANISOTROPY = 8;

/** How a sign looks. Sizes in jelly units. */
export interface SignLook {
  text: string;
  width: number;
  height: number;
  board: string;
  ink: string;
  weight: number;
  /** Glow around letters and frame, like a neon tube. Without it the letters are plain paint. */
  glow?: string;
  /** Color of a neon tube running around the sign. */
  frame?: string;
}

/** Creates the face of a sign. It glows by itself and lives for the whole page. */
export function createSignMaterial(look: SignLook): MeshBasicMaterial {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(look.width * PIXELS_PER_UNIT);
  canvas.height = Math.round(look.height * PIXELS_PER_UNIT);
  const context = canvas.getContext("2d");
  if (context) paintSign(context, look);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  return keepMaterial(new MeshBasicMaterial({ map: texture, toneMapped: false }));
}

/** Paints board, frame and text. */
function paintSign(context: CanvasRenderingContext2D, look: SignLook): void {
  const { width, height } = context.canvas;
  context.fillStyle = look.board;
  context.fillRect(0, 0, width, height);
  const size = fitText(context, look);
  if (look.frame) paintTube(context, look.frame, look.glow ?? look.frame);
  context.textAlign = "center";
  context.textBaseline = "middle";
  const [x, y] = [width / 2, height / 2 + size * CORE_BLUR];
  if (look.glow) {
    context.shadowColor = look.glow;
    context.fillStyle = look.glow;
    for (const blur of GLOW_BLURS) {
      context.shadowBlur = size * blur;
      context.fillText(look.text, x, y);
    }
  }
  context.shadowBlur = look.glow ? size * CORE_BLUR : 0;
  context.fillStyle = look.ink;
  context.fillText(look.text, x, y);
}

/** Sets the largest font that fits the sign and returns its size in pixels. */
function fitText(context: CanvasRenderingContext2D, look: SignLook): number {
  const { width, height } = context.canvas;
  let size = height * TEXT_HEIGHT_SHARE;
  context.font = `${look.weight} ${size}px ${FONT_FAMILY}`;
  const measured = context.measureText(look.text).width;
  if (measured > width * TEXT_WIDTH_SHARE) {
    size *= (width * TEXT_WIDTH_SHARE) / measured;
    context.font = `${look.weight} ${size}px ${FONT_FAMILY}`;
  }
  return size;
}

/** Paints a glowing tube around the sign. */
function paintTube(context: CanvasRenderingContext2D, color: string, glow: string): void {
  const { width, height } = context.canvas;
  const inset = height * TUBE_INSET;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = height * TUBE_WIDTH;
  context.shadowColor = glow;
  context.shadowBlur = height * TUBE_INSET;
  context.beginPath();
  context.roundRect(inset, inset, width - 2 * inset, height - 2 * inset, inset);
  context.stroke();
  context.restore();
}
