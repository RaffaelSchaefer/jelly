/**
 * Gemeinsame Schlüssel, Zeichen und Laufzeit der kurzen Jelly-Gesten, ohne Renderer.
 *
 * @module
 */

/** Laufzeit einer Geste in Sekunden. */
export const EMOTE_SECONDS = 3;

/** Zeichen der bekannten Gesten. Die Beschriftung kommt aus dem Server-Katalog. */
export const EMOTE_GLYPHS = {
  wave: "👋",
  dance: "💃",
  cheer: "🎉",
  laugh: "😂",
  sleep: "💤",
  love: "❤️",
  shrug: "🤷",
  point: "👉",
  think: "🤔",
  angry: "😠",
  sad: "😢",
  shy: "😊",
} as const;

/** Schlüssel einer Geste, die dieses Jelly darstellen kann. */
export type EmoteKey = keyof typeof EMOTE_GLYPHS;

/** Eine Geste und ihre bisherige Laufzeit in Sekunden. */
export interface EmoteFrame {
  key: EmoteKey;
  elapsed: number;
}

/** Erkennt bekannte Gesten, auch bei einem neueren Server-Katalog. */
export function isEmoteKey(key: string): key is EmoteKey {
  return Object.hasOwn(EMOTE_GLYPHS, key);
}
