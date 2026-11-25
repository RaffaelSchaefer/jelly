/**
 * The broadcast of the Jelly-News on the beamer screens: a canvas painted once per report and
 * handed to the material all screens share, which fades it in over the test card the screens show
 * between broadcasts. The canvas is made with the first picture, never on import.
 *
 * @module
 */

import { CanvasTexture, SRGBColorSpace } from "three";

import type { BroadcastPicture } from "./newsSetPlan.ts";

import { findNewsPicture } from "./newsPictures.ts";
import { paintBroadcast } from "./newsScreensPaint.ts";
import { findTestCard } from "./newsTestCard.ts";
import { BROADCAST, SCREEN_ASPECT } from "./stageScreen.ts";

/** Height of the picture in canvas pixels: sharp on a screen that fills half a 4K frame. */
const PICTURE_HEIGHT = 640;
const ANISOTROPY = 8;

/** The picture of the screens and what it shows right now. */
export interface NewsScreens {
  texture: CanvasTexture | null;
  /** The key of the painted picture, empty before the first. */
  key: string;
  /** What the canvas shows: the picture and whether its photo was there when it was painted. */
  painted: string;
}

/** Creates the broadcast, with nothing painted yet. */
export function createNewsScreens(): NewsScreens {
  return { texture: null, key: "", painted: "" };
}

/** Returns the texture of the picture, made with its canvas on first use. */
function prepareTexture(screens: NewsScreens): CanvasTexture {
  if (screens.texture) return screens.texture;
  const canvas = document.createElement("canvas");
  canvas.height = PICTURE_HEIGHT;
  canvas.width = Math.round(PICTURE_HEIGHT * SCREEN_ASPECT);
  const texture = new CanvasTexture(canvas);
  // The screen shader turns its colors back into sRGB, so the canvas is read as sRGB.
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = ANISOTROPY;
  screens.texture = texture;
  BROADCAST.uBroadcast.value = texture;
  return texture;
}

/** Paints a picture onto the canvas of the screens, unless it shows that one already. */
function paintPicture(screens: NewsScreens, picture: BroadcastPicture): void {
  // A picture decodes in the background: once it is there, the screens are painted again with it.
  const hasPhoto = findNewsPicture(picture.card?.picture ?? null) !== null;
  const key = `${picture.key}|${hasPhoto}`;
  if (key === screens.painted) return;
  const texture = prepareTexture(screens);
  const context = (texture.image as HTMLCanvasElement).getContext("2d");
  if (!context) return;
  paintBroadcast(context, picture);
  texture.needsUpdate = true;
  screens.key = picture.key;
  screens.painted = key;
}

/**
 * Puts the test card on the screens once it is decoded, cut to their shape without stretching, and
 * lets its scan line run unless motion is reduced. It shows whenever no broadcast covers it.
 */
export function showTestCard(reducedMotion: boolean): void {
  BROADCAST.uLively.value = reducedMotion ? 0 : 1;
  const card = findTestCard();
  if (!card || BROADCAST.uTestCard.value === card) return;
  const image = card.image as HTMLImageElement;
  const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
  // The screens are a little wider than the card: it fills their width and loses a sliver above and below.
  if (SCREEN_ASPECT > aspect) BROADCAST.uTestCardShare.value.set(1, aspect / SCREEN_ASPECT);
  else BROADCAST.uTestCardShare.value.set(SCREEN_ASPECT / aspect, 1);
  BROADCAST.uTestCard.value = card;
  BROADCAST.uTestCardReady.value = 1;
}

/**
 * Shows a picture on the screens, `onAir` of the way from 0 to 1. The canvas is painted again only
 * when the picture changes. Without a picture, or one that could not be painted, the screens show
 * their test card.
 */
export function showBroadcast(
  screens: NewsScreens,
  picture: BroadcastPicture | null,
  onAir: number,
): void {
  if (picture && onAir > 0) paintPicture(screens, picture);
  const isPainted = picture !== null && picture.key === screens.key;
  BROADCAST.uOnAir.value = isPainted ? onAir : 0;
}
