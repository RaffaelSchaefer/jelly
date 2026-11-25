/**
 * When the 3D opening title of the Jelly-News is on screen and how: in 3D, with the logo of the
 * band of `newsBarBumper.ts` standing in for it, or with an empty band while a screen that has just
 * started waits for the model. Where the title stands follows from the report on air and the server
 * time alone. Only whether this screen has the model in time is its own, so an opening title decides
 * that once, at its first frame, and never changes halfway. Without three or a canvas, so it can be
 * tested by itself.
 *
 * @module
 */

import type { StageInsets } from "./insets.ts";
import type { ScreenSize } from "./lens.ts";
import type { NewsOnAir } from "./newsBar.ts";
import type { BumperScene } from "./newsBarBumper.ts";

import { layoutNewsBar } from "./newsBarLayout.ts";
import { findFlashPhase, findShowPhase, measureBumper } from "./newsBarTiming.ts";

/** A screen this young waits for the model with an empty band, rather than show the stand-in. */
export const WAIT_MS = 1500;

/** How an opening title shows on this screen: in 3D, with the logo of the band, or not yet. */
export type TitleMode = "3d" | "2d" | "wait";

/** What a frame tells about the news on air. */
export interface OpenerFrame {
  news: NewsOnAir;
  /** Server time minus the clock of this screen, in milliseconds. */
  clockOffset: number;
  reducedMotion: boolean;
  /** Size of the picture in CSS pixels. */
  size: ScreenSize;
  insets: StageInsets;
  /** The clock of this screen, in milliseconds. */
  now: number;
}

/** An opening title on screen in one frame. */
export interface Opener {
  /** Tells openings apart: one per show and run. */
  key: string;
  bumper: BumperScene;
  /** How much a breaking news has left of it, from 0 to 1. */
  alpha: number;
}

/** What a screen knows about its model and the opening title it shows. */
export interface OpenerState {
  /** The model is there and ready to draw. */
  ready: boolean;
  /** The model could not be loaded: the logo of the band stands in for good. */
  failed: boolean;
  /** When the view started, on the clock of this screen. */
  bornAt: number;
  /** The opening title on screen and how it shows, null while that is open. */
  opener: { key: string; mode: TitleMode | null };
}

/** Returns the opening title on air, null in every other frame. */
export function findOpener(frame: OpenerFrame): Opener | null {
  const { live, flash } = frame.news;
  if (!live || live.moment.beat.kind !== "intro") return null;
  const serverTime = frame.now + frame.clockOffset;
  const progress = findShowPhase(live.moment, serverTime, null).bumper;
  const layout = layoutNewsBar(frame.size, frame.insets);
  // A breaking news covers the show, the title goes with it.
  const cover = (flash && findFlashPhase(flash, serverTime)?.cover) || 0;
  if (progress === null || !layout || cover >= 1) return null;
  const length = measureBumper(live.moment);
  return {
    key: `${live.show.key}:${live.moment.run}`,
    bumper: { free: layout.free, progress, length, reducedMotion: frame.reducedMotion },
    alpha: 1 - cover,
  };
}

/**
 * Decides how the opening title `key` shows: once, at its first frame on this screen. Only while
 * the screen is younger than {@link WAIT_MS} it keeps waiting for the model to come.
 */
export function chooseMode(state: OpenerState, key: string, now: number): TitleMode {
  if (state.opener.key !== key) state.opener = { key, mode: null };
  const { mode } = state.opener;
  if (mode) return mode;
  if (state.ready) {
    state.opener.mode = "3d";
  } else if (state.failed || now - state.bornAt > WAIT_MS) {
    state.opener.mode = "2d";
  }
  return state.opener.mode ?? "wait";
}
