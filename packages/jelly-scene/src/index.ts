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
export {
  isPartnerMotionKey,
  partnerPose,
  restPose,
  type DuetPose,
  type DuetRole,
} from "./partnerEmotes.ts";
export { JELLY_COLORS, type JellyColor, type JellyPalette } from "./colors.ts";
export { BODY_BOTTOM, HAND, HEAD } from "./jellyGeometry.ts";
export { MOUTH_SHAPE_NAMES, type MouthFrame, type MouthShape } from "./mouthShapes.ts";
export {
  animateJelly,
  createJelly,
  disposeJelly,
  type Jelly,
  type JellyFrameInput,
} from "./jelly.ts";
