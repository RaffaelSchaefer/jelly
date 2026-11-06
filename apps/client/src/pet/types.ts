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

import type {
  EquippedCosmetic,
  StageArea,
  StageFollow,
  StageGathering,
  StageMove,
  StageRoom,
  StageStack,
  StageTrip,
} from "@jelly/stage";

/** Farbvariante des Pets (Rust: `Color`, Server: Katalog `colors`). */
export type PetColor = "mint" | "lilac" | "peach";

/** Was die Oberfläche beim Server auslösen kann (Rust: `Action`). */
export type Action = "poke" | "food" | "drink";

/** Selbstmeldungen, also alles außer Stupsern. */
export type Report = Exclude<Action, "poke">;

/** Die Plätze eines Jellys, je Platz höchstens ein Cosmetic (Server: Katalog `cosmetic_slots`). */
export type CosmeticSlot = "head" | "hands" | "body" | "face" | "aura";

/** Was ein Jelly trägt, je Platz. Text als Schlüssel: Ein neuerer Server kann Plätze ergänzen. */
export type Equipped = Record<string, EquippedCosmetic>;

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
  /** Einfachere Oberflächen und weniger Grafikeffekte, siehe {@link OPTIMIZED_RENDERING}. */
  optimizedRendering: boolean;
  /** Bilder pro Sekunde, siehe {@link FRAME_RATE}. `null` heißt unbegrenzt. */
  frameLimit: number | null;
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

/**
 * Die Regeln der LAN, soweit die App sie anzeigt (`PublicRules`). Entscheiden tut immer der Server.
 * Ein neuerer Server darf Regeln ergänzen.
 */
export interface Rules {
  /** Bis zu diesem Abstand in Jelly-Einheiten stehen zwei Jellies nebeneinander. */
  near_distance: number;
  /** XP je Level, linear. */
  xp_per_level: number;
}

/** Welche LAN läuft und welche kommt (`GET /v1/lans/current`). */
export interface LanStatus {
  server_time: number;
  current: LanPeriod | null;
  next: LanPeriod | null;
  /** Regeln der laufenden LAN, sonst der nächsten, sonst die Standardwerte. */
  rules: Rules;
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
  equipped: Equipped;
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
  /** Wem das Jelly nachläuft. Das Ende meldet `follow.changed`, auch wenn die Zeit abläuft. */
  follow: StageFollow | null;
  trip: StageTrip | null;
  lans_attended: number;
  badges: { slug: string; name: string }[];
  /** Cosmetics, die der Spieler tragen darf. */
  cosmetics: string[];
  achievements: EarnedAchievement[];
  awards: { title: string; cosmetic_key: string | null; given_at: number }[];
}

/** Ein Jelly aus `GET /v1/stage` (Rust: `StagePlayer`). */
export interface StagePlayer {
  id: number;
  name: string;
  /** Text statt `PetColor`: Ein neuerer Server kann Farben liefern, die die App nicht kennt. */
  color: string;
  equipped: Equipped;
  level: number;
  sign: string | null;
  follow: StageFollow | null;
  /** `null` ohne eigenen Bereich und ohne Zone für Besucher. */
  area_id: number | null;
  /** Ein Jelly ohne eigenen Bereich wandert als Besucher. */
  is_visitor: boolean;
  /** Heimplatz in Prozent der Bühne. */
  home_x: number;
  home_y: number;
}

/**
 * Raumkarte und wer gerade auf der Bühne steht (Rust: `Stage`, `StageArea`). Abwesende filtert
 * schon der Server.
 */
export interface Stage {
  last_event_id: number;
  server_time: number;
  room: StageRoom;
  areas: StageArea[];
  players: StagePlayer[];
  /** Der aktuelle Weg je Jelly. Wo es läuft, bestimmt nur der Server. */
  moves: StageMove[];
  stacks: StageStack[];
  /** Essens-Event oder Siegerehrung, sonst `null`. */
  gathering: StageGathering | null;
}

/** Wie sich eine Aufforderung zu einem Partner-Emote ändern kann (Rust: `InviteState`). */
export type InviteAnswer = "accepted" | "declined" | "cancelled";

/** Eine Aufforderung zu einem Partner-Emote, auch im Ereignis `partner_emote.updated`. */
export interface PartnerInvite {
  id: number;
  key: string;
  from_id: number;
  /** Wer aufgefordert wird. */
  partner_id: number;
  state: "pending" | InviteAnswer;
  /** Ablauf als Server-Zeit. Dazu kommt kein Ereignis. */
  expires_at: number;
}

/** Ein Eintrag einer festen Liste mit Anzeigetext. */
export interface CatalogEntry {
  key: string;
  label: string;
}

/**
 * Ein Cosmetic im Katalog. `unlock` sagt, wie man es bekommt: `level` ab `level`, `event` über
 * einen Event-Code, `award` als Preis der Orga, `none` gar nicht. Unbekannte Werte gelten wie
 * `none`.
 */
export interface CatalogCosmetic {
  key: string;
  name: string;
  scope: string;
  slot: string;
  /** Ob es eine Farbe aus `cosmetic_colors` annimmt. */
  colorable: boolean;
  unlock: string;
  /** Das Level, ab dem es frei ist, nur bei `unlock` `level`. */
  level?: number;
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
  cosmetic_slots: CatalogEntry[];
  /** Die Farben einfärbbarer Cosmetics als Hex-Werte. */
  cosmetic_colors: string[];
  achievements: CatalogAchievement[];
}

/** Was jeder Befehl zurückgibt (Rust: `Game`). */
export interface Game {
  settings: Settings;
  /** `null`, solange es kein Konto gibt oder der Server das Secret abgelehnt hat. */
  me: Me | null;
  lan: LanStatus;
  /** Adresse des Servers, nur zur Anzeige. */
  serverUrl: string;
  /** Der Server kennt das gespeicherte Secret nicht mehr. Dann hilft nur ein neuer Code. */
  secretRejected: boolean;
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
