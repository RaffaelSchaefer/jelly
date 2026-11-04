/**
 * Das Jelly für Client und Server-Bühne: bauen, animieren, freigeben, dazu Farben und Maße.
 *
 * @module
 */

export { createMotion, type Motion } from "./animation.ts";
export {
  EMOTE_GLYPHS,
  EMOTE_SECONDS,
  isEmoteKey,
  type EmoteKey,
  type EmoteFrame,
} from "./emotes.ts";
export { JELLY_COLORS, type JellyColor, type JellyPalette } from "./colors.ts";
export { BODY_BOTTOM, HAND, HEAD } from "./jellyGeometry.ts";
export {
  animateJelly,
  createJelly,
  disposeJelly,
  type Jelly,
  type JellyFrameInput,
} from "./jelly.ts";
