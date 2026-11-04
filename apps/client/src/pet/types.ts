/**
 * Datentypen des Spielstands und die Grenzwerte, die die Oberfläche kennen muss.
 *
 * Die Server-Typen (`Me`, `LanStatus`, `Catalog` …) spiegeln den Vertrag in
 * `apps/server/docs/openapi.json` und behalten seine Feldnamen in snake_case. Rust reicht sie
 * unverändert durch (`src-tauri/src/api.rs`). Die lokalen Typen (`Settings`, `Game`) spiegeln
 * `src-tauri/src/pet.rs` und `commands.rs`. Ändert sich dort etwas, muss es hier mitziehen.
 *
 * @module
 */

/** Farbvariante des Pets (Rust: `Color`, Server: Katalog `colors`). */
export type PetColor = "mint" | "lilac" | "peach";

/** Was die Oberfläche beim Server auslösen kann (Rust: `Action`). */
export type Action = "poke" | "food" | "drink";

/** Selbstmeldungen, also alles außer Stupsern. */
export type Report = Exclude<Action, "poke">;

/** Einstellungen, die nur dieses Gerät betreffen (Rust: `Settings`). */
export interface Settings {
  /** Animation auf eine ruhige Darstellung reduzieren. */
  reducedMotion: boolean;
  /** Größe in Prozent, siehe {@link PET_SIZE}. */
  size: number;
  /** Ob das Jelly Geräusche macht. */
  sound: boolean;
  /** Lautstärke in Prozent, siehe {@link VOLUME}. */
  volume: number;
}

/** Abklingzeiten und Kontingent der Selbstmeldungen. Zeiten in Unix-Millisekunden. */
export interface Reports {
  /** Ab wann Essen wieder zählt, 0 heißt sofort. */
  food_ready_at: number;
  /** Ab wann ein Getränk wieder zählt, 0 heißt sofort. */
  drink_ready_at: number;
  /** Wie viele Meldungen im laufenden Fenster noch frei sind. */
  reports_left: number;
}

/** Die jüngste LAN eines Kontos. */
export interface LanInfo {
  slug: string;
  name: string;
  /** Ob sie gerade läuft. */
  active: boolean;
}

/** Zeitraum einer LAN in Unix-Millisekunden. */
export interface LanPeriod {
  slug: string;
  name: string;
  starts_at: number;
  ends_at: number;
}

/** Welche LAN läuft und welche kommt (`GET /v1/lans/current`). */
export interface LanStatus {
  server_time: number;
  current: LanPeriod | null;
  next: LanPeriod | null;
  /** Ob dieses Konto an der laufenden LAN teilnimmt. `null` ohne Konto oder ohne LAN. */
  joined: boolean | null;
}

/** Ein verdienter Erfolg. */
export interface EarnedAchievement {
  key: string;
  title: string;
  lan_slug: string | null;
  earned_at: number;
  /** Bei Rekord-Erfolgen der beste Wert. */
  best?: number | null;
  record_unit?: string | null;
}

/** Stand eines Spielers vom Server (`PlayerState`). */
export interface Me {
  /** Uhrzeit des Servers, von Rust auf den Moment der Antwort hochgerechnet. */
  server_time: number;
  last_event_id: number;
  id: number;
  name: string;
  color: PetColor;
  cosmetic: string | null;
  hidden: boolean;
  lan: LanInfo | null;
  /** XP in der jüngsten LAN. */
  xp: number;
  level: number;
  /** XP über alle LANs. */
  total_xp: number;
  /** Ab wann ein Stupser wieder XP gibt. `null` außerhalb einer laufenden LAN. */
  next_poke_at: number | null;
  reports: Reports | null;
  sign: string | null;
  follow_player_id: number | null;
  lans_attended: number;
  badges: { slug: string; name: string }[];
  /** Cosmetics, die der Spieler tragen darf. */
  cosmetics: string[];
  achievements: EarnedAchievement[];
  awards: { title: string; cosmetic_key: string | null; given_at: number }[];
}

/** Ein Jelly aus `GET /v1/stage` (Rust: `StagePlayer`). Raumkarte und Heimplatz liest die App nicht. */
export interface StagePlayer {
  id: number;
  name: string;
  /** Text statt `PetColor`: Ein neuerer Server kann Farben liefern, die die App nicht kennt. */
  color: string;
  cosmetic: string | null;
  level: number;
  sign: string | null;
  follow_player_id: number | null;
  last_seen_at: number;
}

/** Wer gerade auf der Bühne steht (Rust: `Stage`). Abwesende filtert schon der Server. */
export interface Stage {
  server_time: number;
  players: StagePlayer[];
}

/** Ein Eintrag einer festen Liste mit Anzeigetext. */
export interface CatalogEntry {
  key: string;
  label: string;
}

/** Ein Cosmetic im Katalog. Ohne `level` und `requires_event` gibt es es nur von der Orga. */
export interface CatalogCosmetic {
  key: string;
  name: string;
  scope: string;
  level?: number;
  requires_event?: boolean;
}

/** Ein Erfolg im Katalog. Geheime fehlen dort, bis man sie verdient hat. */
export interface CatalogAchievement {
  key: string;
  title: string;
  description: string;
  scope: string;
  secret: boolean;
  goal: number;
  record_unit?: string;
}

/** Die festen Listen des Servers (`GET /v1/catalog`). */
export interface Catalog {
  colors: CatalogEntry[];
  emotes: CatalogEntry[];
  partner_emotes: CatalogEntry[];
  signs: CatalogEntry[];
  cosmetics: CatalogCosmetic[];
  achievements: CatalogAchievement[];
}

/** Was jeder Befehl zurückgibt (Rust: `Game`). */
export interface Game {
  settings: Settings;
  /** `null`, solange es kein Konto gibt oder der Server das Token abgelehnt hat. */
  me: Me | null;
  lan: LanStatus;
  /** Adresse des Servers, nur zur Anzeige. */
  serverUrl: string;
  /** Der Server kennt das gespeicherte Token nicht mehr. */
  tokenRejected: boolean;
}

/** Ein Ereignis zum eigenen Jelly aus dem Server-Stream. */
export interface ServerEvent {
  id: number;
  type: string;
  player_id: number | null;
  payload: Record<string, unknown> | null;
  created_at: number;
}

/** Größenbereich des Pets in Prozent (Rust: `MIN_SIZE`, `MAX_SIZE`, `DEFAULT_SIZE`). */
export const PET_SIZE = { min: 70, max: 150, step: 10, default: 100 } as const;

/**
 * Bereich der Lautstärke in Prozent (Rust: `MIN_VOLUME`, `MAX_VOLUME`). Ganz still macht der
 * Schalter.
 */
export const VOLUME = { min: 10, max: 100, step: 10 } as const;
