/**
 * Gemeinsame Schlüssel, Zeichen, Laufzeit und Stimmung der kurzen Jelly-Gesten, ohne Renderer.
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

/** Stimmung einer Geste: wie hoch die Stimme klingt und wie schnell Bewegung und Laut laufen. */
export interface EmoteMood {
  /** Verschiebung der Stimme in Halbtönen. */
  pitch: number;
  /** Tempo von Bewegung und Laut. Über 1 schneller, unter 1 langsamer. */
  tempo: number;
}

/**
 * Die Stimmung jeder Geste. Freude klingt hoch und flott, Wut tief und schnell, Trauer und
 * Müdigkeit tief und langsam, Verlegenheit hoch und zögerlich. Die Bewegung (`emoteAnimation.ts`)
 * und der Laut in der App nutzen dasselbe Tempo, so bleiben beide im Takt.
 */
export const EMOTE_MOODS: Record<EmoteKey, EmoteMood> = {
  wave: { pitch: 2, tempo: 1.1 },
  dance: { pitch: 1, tempo: 1.1 },
  cheer: { pitch: 4, tempo: 1.2 },
  laugh: { pitch: 3, tempo: 1.2 },
  sleep: { pitch: -5, tempo: 0.8 },
  love: { pitch: 2, tempo: 0.85 },
  shrug: { pitch: -1, tempo: 0.9 },
  point: { pitch: 1, tempo: 1.15 },
  think: { pitch: -2, tempo: 0.8 },
  angry: { pitch: -6, tempo: 1.25 },
  sad: { pitch: -4, tempo: 0.75 },
  shy: { pitch: 3, tempo: 0.85 },
};

/** Eine Geste und ihre bisherige Laufzeit in Sekunden. */
export interface EmoteFrame {
  key: EmoteKey;
  elapsed: number;
}

/** Erkennt bekannte Gesten, auch bei einem neueren Server-Katalog. */
export function isEmoteKey(key: string): key is EmoteKey {
  return Object.hasOwn(EMOTE_GLYPHS, key);
}
