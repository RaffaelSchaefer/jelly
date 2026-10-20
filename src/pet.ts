import type { IconName } from './Icon';

export type PetColor = 'mint' | 'lilac' | 'peach';
export type Action = 'activity' | 'food' | 'drink' | 'event';
export type Report = Exclude<Action, 'activity'>;

/** One XP gain, as logged by pet.rs. Pokes are not logged. */
export interface Entry { action: Report; xp: number; /** Unix seconds. */ at: number }

export interface Pet {
  schemaVersion: number;
  name: string;
  xp: number;
  color: PetColor;
  reducedMotion: boolean;
  /** Pet size in percent (see PET_SIZE). */
  size: number;
  log: Entry[];
  cosmetic: string | null;
}

export const PET_SIZE = { min: 70, max: 150, step: 10, default: 100 } as const;

export const PREVIEW_PET: Pet = {
  schemaVersion: 1,
  name: 'Pixel',
  xp: 0,
  color: 'mint',
  reducedMotion: false,
  size: PET_SIZE.default,
  log: [],
  cosmetic: null,
};

// Mirrors REPORT_* in pet.rs, which enforces them; the UI only shows them.
export const REPORT = { cooldown: 30 * 60, window: 24 * 60 * 60, perWindow: 8 } as const;

/** Minutes until `action` may be reported again (0 = now) and how many reports are left. */
export function reportStatus(log: Entry[], action: Report, now: number) {
  const recent = log.filter((entry) => now - entry.at < REPORT.window);
  const last = recent.filter((entry) => entry.action === action && now - entry.at < REPORT.cooldown).at(-1);
  return {
    waitMinutes: last ? Math.ceil((REPORT.cooldown - (now - last.at)) / 60) : 0,
    left: Math.max(0, REPORT.perWindow - recent.length),
  };
}

/** Entries from the local calendar day of `now` (unix seconds), newest first. */
export function todaysEntries(log: Entry[], now: number) {
  const day = new Date(now * 1000).toDateString();
  return log.filter((entry) => new Date(entry.at * 1000).toDateString() === day).reverse();
}

export type AchievementId = 'first-game' | 'marathon' | 'hydrated' | 'tournament' | 'night-owl';
export interface Achievement { id: AchievementId; title: string; detail: string; icon: IconName; goal: number; unit?: string; secret?: boolean }

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-game', title: 'Erste Runde', detail: 'Dein erstes Spiel über Steam', icon: 'gamepad', goal: 1 },
  { id: 'marathon', title: 'Marathon', detail: '10 Stunden am Stück gezockt', icon: 'clock', goal: 10, unit: 'h' },
  { id: 'hydrated', title: 'Gut hydriert', detail: '10 Getränke geholt', icon: 'droplet', goal: 10 },
  { id: 'tournament', title: 'Turnierheld', detail: 'Bei 3 Events mitgemacht', icon: 'trophy', goal: 3 },
  { id: 'night-owl', title: 'Nachteule', detail: 'Um 4 Uhr nachts noch dabei', icon: 'moon', goal: 1, secret: true },
];

/** Progress per achievement, capped at its goal. Steam ones stay at 0 until Steam is connected. */
export function achievementProgress(log: Entry[]): Record<AchievementId, number> {
  const count = (test: (entry: Entry) => boolean) => log.filter(test).length;
  const raw = {
    'first-game': 0,
    marathon: 0,
    hydrated: count((entry) => entry.action === 'drink'),
    tournament: count((entry) => entry.action === 'event'),
    'night-owl': count((entry) => new Date(entry.at * 1000).getHours() === 4),
  };
  return Object.fromEntries(ACHIEVEMENTS.map((item) => [item.id, Math.min(item.goal, raw[item.id])])) as Record<AchievementId, number>;
}

export interface Cosmetic { id: string; name: string; slot: 'Kopf' | 'Gesicht' | 'Effekte'; icon: IconName; unlock: { level: number } | { achievement: AchievementId } | { event: true } }

export const COSMETICS: Cosmetic[] = [
  { id: 'headset', name: 'Headset', slot: 'Kopf', icon: 'headset', unlock: { level: 2 } },
  { id: 'beanie', name: 'Mütze', slot: 'Kopf', icon: 'beanie', unlock: { level: 3 } },
  { id: 'party-hat', name: 'Party-Hut', slot: 'Kopf', icon: 'partyhat', unlock: { event: true } },
  { id: 'pixel-glasses', name: 'Pixel-Brille', slot: 'Gesicht', icon: 'glasses', unlock: { level: 5 } },
  { id: 'hood', name: 'Kapuze', slot: 'Kopf', icon: 'hood', unlock: { level: 6 } },
  { id: 'crown', name: 'Krone', slot: 'Kopf', icon: 'crown', unlock: { level: 10 } },
  { id: 'glow-aura', name: 'Glüh-Aura', slot: 'Effekte', icon: 'aura', unlock: { achievement: 'marathon' } },
];

export function isUnlocked(cosmetic: Cosmetic, pet: Pet) {
  const { unlock } = cosmetic;
  if ('level' in unlock) return levelProgress(pet.xp).level >= unlock.level;
  if ('event' in unlock) return pet.log.some((entry) => entry.action === 'event');
  const achievement = ACHIEVEMENTS.find((item) => item.id === unlock.achievement)!;
  return achievementProgress(pet.log)[achievement.id] >= achievement.goal;
}

/** How a cosmetic is unlocked, in a few words. */
export function unlockLabel(cosmetic: Cosmetic) {
  const { unlock } = cosmetic;
  if ('level' in unlock) return `Level ${unlock.level}`;
  if ('event' in unlock) return 'Bei einem Event';
  return ACHIEVEMENTS.find((item) => item.id === unlock.achievement)!.title;
}

/** The first level cosmetic unlocked above `level` (COSMETICS lists level unlocks in order). */
export function nextLevelCosmetic(level: number) {
  return COSMETICS.find((item) => 'level' in item.unlock && item.unlock.level > level);
}

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
