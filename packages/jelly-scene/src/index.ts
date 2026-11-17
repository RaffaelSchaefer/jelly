/**
 * Das Jelly für Client und Server-Bühne: bauen, animieren, freigeben, dazu Farben und Maße.
 *
 * @module
 */

export { createMotion, type Motion } from "./animation.ts";
export {
  createCosmetic,
  disposeCosmetic,
  hasCosmeticModel,
  loadCosmetic,
  loadModelParts,
  stickerOrder,
  type CosmeticLook,
  type CosmeticMode,
} from "./cosmetic.ts";
export {
  animateCrystalBall,
  createCrystalBall,
  disposeCrystalBall,
  type CrystalLook,
} from "./crystal.ts";
export {
  EMOTE_GLYPHS,
  EMOTE_MOODS,
  EMOTE_SECONDS,
  isEmoteKey,
  type EmoteKey,
  type EmoteFrame,
  type EmoteMood,
} from "./emotes.ts";
export {
  isPartnerMotionKey,
  partnerPose,
  restPose,
  type DuetPose,
  type DuetRole,
} from "./partnerEmotes.ts";
export { JELLY_COLORS, type JellyColor, type JellyPalette } from "./colors.ts";
export { BODY_BOTTOM, GRIP, HAND, HEAD } from "./jellyGeometry.ts";
export { MOUTH_SHAPE_NAMES, type MouthFrame, type MouthShape } from "./mouthShapes.ts";
export type { JellyQuality } from "./body.ts";
export {
  lightMaterial,
  SCENE_LIGHTS,
  createSceneLight,
  setSceneLight,
  setSceneRim,
  type SceneLight,
  type SceneLightSpot,
  type SceneLightUniforms,
  type SceneRim,
} from "./sceneLight.ts";
export {
  animateJelly,
  createJelly,
  disposeJelly,
  type Jelly,
  type JellyFrameInput,
} from "./jelly.ts";
