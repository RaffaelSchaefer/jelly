/**
 * Datentypen des Spielstands und die Grenzwerte, die die Oberfläche kennen muss.
 *
 * Alles hier spiegelt `src-tauri/src/pet.rs`. Rust prüft und erzwingt die Werte, die Oberfläche
 * zeigt sie nur an. Ändert sich dort etwas, muss es hier mitziehen.
 *
 * @module
 */

/** Farbvariante des Pets (Rust: `Color`). */
export type PetColor = "mint" | "lilac" | "peach";

/** Alles, wofür es XP gibt (Rust: `Action`). `activity` ist ein Stupser. */
export type Action = "activity" | "food" | "drink" | "event";

/** Aktionen, die im Verlauf landen. Stupser werden nicht geloggt. */
export type Report = Exclude<Action, "activity">;

/** Ein XP-Gewinn im Verlauf (Rust: `Entry`). */
export interface Entry {
  /** Wofür es die XP gab. */
  action: Report;
  /** Wie viele XP es gab. */
  xp: number;
  /** Unix-Zeit in Sekunden. */
  at: number;
  /** Nur bei Events: die Event-ID aus dem System der Orga. */
  event?: string;
}

/** Der komplette Spielstand, wie Rust ihn liefert (Rust: `Pet`). */
export interface Pet {
  /** Version des Dateiformats. */
  schemaVersion: number;
  /** Anzeigename, 1–24 Zeichen. */
  name: string;
  /** Gesammelte XP. */
  xp: number;
  /** Farbvariante. */
  color: PetColor;
  /** Animation auf eine ruhige Darstellung reduzieren. */
  reducedMotion: boolean;
  /** Größe in Prozent, siehe {@link PET_SIZE}. */
  size: number;
  /** Jeder XP-Gewinn außer Stupsern, ältester zuerst. */
  log: Entry[];
  /** ID des angelegten Cosmetics oder `null`. */
  cosmetic: string | null;
}

/**
 * Was der Nutzer selbst einstellen kann (Rust: `Appearance`).
 *
 * Rust lehnt unbekannte Felder ab. Deshalb nie ein ganzes {@link Pet} schicken, sondern
 * {@link appearanceOf} verwenden.
 */
export type Appearance = Pick<Pet, "name" | "color" | "reducedMotion" | "size">;

/** Nimmt genau die einstellbaren Felder aus einem Pet. */
export function appearanceOf({ name, color, reducedMotion, size }: Pet): Appearance {
  return { name, color, reducedMotion, size };
}

/** Größenbereich des Pets in Prozent (Rust: `MIN_SIZE`, `MAX_SIZE`, `DEFAULT_SIZE`). */
export const PET_SIZE = { min: 70, max: 150, step: 10, default: 100 } as const;

/** Startzustand für die Browser-Vorschau, entspricht `Pet::default()` in Rust. */
export const PREVIEW_PET: Pet = {
  schemaVersion: 1,
  name: "Pixel",
  xp: 0,
  color: "mint",
  reducedMotion: false,
  size: PET_SIZE.default,
  log: [],
  cosmetic: null,
};

/**
 * Regeln für Selbstmeldungen in Sekunden (Rust: `REPORT_COOLDOWN`, `REPORT_WINDOW`,
 * `REPORTS_PER_WINDOW`). Rust erzwingt sie, die Oberfläche zeigt sie nur an. Events zählen nicht
 * mit.
 */
export const REPORT = { cooldown: 30 * 60, window: 24 * 60 * 60, perWindow: 8 } as const;
