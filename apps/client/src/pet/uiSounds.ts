/**
 * Welches Geräusch die Oberfläche zu einem Klick oder einer Änderung im Spielstand macht, als reine
 * Rechnung. Abgespielt wird es in `src/uiSound.ts`.
 *
 * @module
 */

/** Die Geräusche der Oberfläche. */
export const UI_SOUND_NAMES = [
  "tap",
  "open",
  "close",
  "select",
  "blocked",
  "toggleOn",
  "toggleOff",
  "window",
  "windowClose",
  "success",
  "error",
  "coin",
  "achievement",
  "invite",
  "hatch",
] as const;

/** Ein Geräusch der Oberfläche. */
export type UiSound = (typeof UI_SOUND_NAMES)[number];

/** Ob `name` ein bekanntes Geräusch ist, etwa aus `data-sound`. */
export function isUiSound(name: string): name is UiSound {
  return (UI_SOUND_NAMES as readonly string[]).includes(name);
}

/** Was ein angeklickter Knopf über sich verrät. */
export interface ClickedControl {
  /** `data-sound`: ein Geräusch oder `none` für Stille. */
  sound: string | null;
  /** `aria-disabled`: Der Knopf ist gerade gesperrt. */
  blocked: boolean;
  /** `aria-expanded`: Ob der Knopf schon etwas offen hält. */
  expanded: string | null;
  role: string | null;
}

/**
 * Das Geräusch zu einem Klick, oder `null` für Stille. Gesperrte Knöpfe klingen gesperrt, Knöpfe
 * mit `aria-expanded` klappen auf oder zu, Reiter wählen, alles andere tippt.
 */
export function uiSoundFor(control: ClickedControl): UiSound | null {
  const { sound, blocked, expanded, role } = control;
  if (sound === "none") return null;
  if (blocked) return "blocked";
  if (sound && isUiSound(sound)) return sound;
  if (expanded !== null) return expanded === "true" ? "close" : "open";
  return role === "tab" ? "select" : "tap";
}

/** Was im Spielstand für die Oberfläche hörbar ist. `null`, solange kein Konto da ist. */
export interface GameMoment {
  /** Alle bisher gesammelten XP. */
  xp: number | null;
  /** Erfolge und Ehrungen der Orga zusammen. */
  honors: number | null;
  /** Ob gerade eine Einladung zu einem Partner-Emote wartet. */
  invited: boolean;
  /** Ob das Jelly gerade schlüpft. */
  hatching: boolean;
}

/** Ob ein Zähler gestiegen ist. Das erste Laden eines Kontos zählt nicht. */
function rose(before: number | null, after: number | null) {
  return before !== null && after !== null && after > before;
}

/**
 * Das Geräusch zu einer Änderung im Spielstand, oder `null`. Kommt mehreres zugleich, gewinnt das
 * Seltenere.
 */
export function gameSoundFor(before: GameMoment, after: GameMoment): UiSound | null {
  if (after.hatching && !before.hatching) return "hatch";
  if (rose(before.honors, after.honors)) return "achievement";
  if (after.invited && !before.invited) return "invite";
  return rose(before.xp, after.xp) ? "coin" : null;
}
