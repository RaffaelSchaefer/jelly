export type PetColor = 'mint' | 'lilac' | 'peach';
export type Action = 'activity' | 'food' | 'drink' | 'event';

export interface Pet {
  schemaVersion: number;
  name: string;
  xp: number;
  color: PetColor;
  reducedMotion: boolean;
  /** Pet size in percent (see PET_SIZE). */
  size: number;
}

export const PET_SIZE = { min: 70, max: 150, step: 10, default: 100 } as const;

export const PREVIEW_PET: Pet = {
  schemaVersion: 1,
  name: 'Pixel',
  xp: 0,
  color: 'mint',
  reducedMotion: false,
  size: PET_SIZE.default,
};

export const PET_COLORS = {
  mint: { label: 'Aqua', hex: '#2059ed', glow: '#23f5dc', outline: '#16248a', ink: '#0b1550' },
  lilac: { label: 'Flieder', hex: '#8045df', glow: '#f1a5f3', outline: '#45188a', ink: '#2a0f52' },
  peach: { label: 'Pfirsich', hex: '#ed7448', glow: '#ffdc8a', outline: '#8a3216', ink: '#4f1c0b' },
} as const;

export function levelProgress(xp: number) {
  return { level: Math.floor(xp / 100) + 1, current: xp % 100, remaining: 100 - xp % 100 };
}

// Pet stage geometry at 100 %, in CSS pixels (matches .pet-stage in styles.css).
const BASE = {
  stage: 330,
  canvas: { top: 43, width: 396, height: 315 },
  feet: 256, // from the top of the canvas to where he stands
  head: 52, // from the top of the canvas to the top of his head
  bubbleGap: 75, // from the top of the bubble to the top of his head
  bubbleTop: 20,
};

/**
 * Where everything in the pet stage goes for a given size. Shrinking keeps his feet on the
 * ground (the stage keeps its height so the panels still fit); growing keeps his head where it
 * was and extends the stage downwards into the spare room below the dock, so the window itself
 * never has to change size. The speech bubble always floats the same distance above his head,
 * and the window tools above it move down with it.
 */
export function stageLayout(size: number) {
  const scale = Math.min(PET_SIZE.max, Math.max(PET_SIZE.min, size)) / 100;
  const baseFeet = BASE.canvas.top + BASE.feet;
  const baseHead = BASE.canvas.top + BASE.head;
  const feet = Math.max(baseFeet, baseHead + (BASE.feet - BASE.head) * scale);
  const canvasTop = feet - BASE.feet * scale;
  const headTop = canvasTop + BASE.head * scale;
  const stage = feet + (BASE.stage - baseFeet);
  const bubbleTop = headTop - BASE.bubbleGap;
  return {
    scale,
    canvas: { top: canvasTop, width: BASE.canvas.width * scale, height: BASE.canvas.height * scale },
    feet,
    bubbleTop,
    toolsOffset: Math.max(0, bubbleTop - BASE.bubbleTop),
    stage,
  };
}
