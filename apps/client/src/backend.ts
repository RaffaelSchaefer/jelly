/**
 * Die einzige Stelle, die mit dem Rust-Backend und dem Desktop-Fenster spricht.
 *
 * Jede Funktion entspricht einem Befehl in `src-tauri/src/commands.rs`. Rust spricht mit dem Server
 * und hält das Token, die Oberfläche sieht nur den fertigen {@link Game}. Schlägt ein Befehl fehl,
 * kommt eine fertige deutsche Meldung als Text an und wird mit `String(cause)` angezeigt. Im
 * Browser (`pnpm webpreview:dev`) gibt es kein Backend: Dort ist {@link desktop} `false`, und es
 * darf nichts von hier aufgerufen werden.
 *
 * @module
 */

import type { StageEvent } from "@jelly/stage";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { Action, Catalog, Game, PetColor, ServerEvent, Settings, Stage } from "./pet";

/** Läuft die Oberfläche in der Desktop-App (sonst: Browser-Vorschau)? */
export const desktop = isTauri();

/** Ergebnis einer Aktion: gewonnene XP und neuer Stand. */
export interface ActResult {
  xpGained: number;
  game: Game;
}

/** Ergebnis eines eingelösten Event-Codes. */
export interface RedeemResult extends ActResult {
  /** Titel des Events. */
  title: string;
}

/** Ergebnis eines gestarteten Partner-Emotes: der Code für den Partner. */
export interface PartnerOffer {
  code: string;
  key: string;
  /** Ablauf des Codes als Server-Zeit. */
  expiresAt: number;
  game: Game;
}

/** Ergebnis eines Beitritts zu einem Partner-Emote. */
export interface PartnerJoin extends ActResult {
  key: string;
  partnerId: number;
}

/** Lädt Stand und LAN neu (`get_game`). Prüft beim ersten Mal die App-Version. */
export const getGame = () => invoke<Game>("get_game");

/** Feste Listen des Servers (`get_catalog`). */
export const getCatalog = () => invoke<Catalog>("get_catalog");

/** Legt ein Konto an (`register`). */
export const register = (code: string, name: string, color: PetColor) =>
  invoke<Game>("register", { code, name, color });

/** Tritt mit einem vorhandenen Konto der laufenden LAN bei (`join_lan`). */
export const joinLan = (code: string) => invoke<Game>("join_lan", { code });

/** Stupser oder Selbstmeldung (`act`). */
export const act = (action: Action) => invoke<ActResult>("act", { action });

/** Spielt eine Geste aus dem Server-Katalog (`emote`). */
export const emote = (key: string) => invoke<Game>("emote", { key });

/** Hebt ein Schild aus dem Server-Katalog oder senkt es mit `null` (`set_sign`). */
export const setSign = (key: string | null) => invoke<Game>("set_sign", { key });

/** Stellt das Jelly neben ein anderes oder lässt es mit `null` weggehen (`set_follow`). */
export const setFollow = (playerId: number | null) => invoke<Game>("set_follow", { playerId });

/** Liest, wer gerade auf der Bühne steht (`get_stage`). */
export const getStage = () => invoke<Stage>("get_stage");

/** Was die Karte bei jedem Lesen bekommt (Rust: `MapState`). */
export interface MapState {
  ownId: number;
  reducedMotion: boolean;
  stage: Stage;
}

/** Liest, was die Karte zeigt (`get_map_state`). */
export const getMapState = () => invoke<MapState>("get_map_state");

/** Öffnet die Karte im eigenen Fenster oder holt sie nach vorn (`open_map`). */
export const openMap = () => invoke<void>("open_map");

/** Löst einen Event-Code ein (`redeem_code`). */
export const redeemCode = (code: string) => invoke<RedeemResult>("redeem_code", { code });

/** Startet ein Partner-Emote aus dem Server-Katalog (`start_partner_emote`). */
export const startPartnerEmote = (key: string) =>
  invoke<PartnerOffer>("start_partner_emote", { key });

/** Tritt mit dem Code eines anderen Jellys dessen Partner-Emote bei (`join_partner_emote`). */
export const joinPartnerEmote = (code: string) =>
  invoke<PartnerJoin>("join_partner_emote", { code });

/** Was sich am Profil ändert. Fehlende Felder bleiben, wie sie sind. */
export interface ProfilePatch {
  name?: string;
  color?: PetColor;
}

/** Übernimmt Name und/oder Farbe (`update_profile`). */
export const updateProfile = (patch: ProfilePatch) => invoke<Game>("update_profile", { ...patch });

/** Legt ein Cosmetic an oder mit `null` ab (`equip_cosmetic`). */
export const equipCosmetic = (cosmetic: string | null) =>
  invoke<Game>("equip_cosmetic", { cosmetic });

/** Übernimmt Größe und Bewegung, nur auf diesem Gerät (`update_settings`). */
export const updateSettings = (settings: Settings) => invoke<Game>("update_settings", { settings });

/** Meldet, dass die App noch läuft (`presence`). */
export const presence = () => invoke<Game>("presence");

/** Hört auf Ereignisse zum eigenen Jelly. Liefert die Funktion zum Abmelden. */
export const onServerEvent = (handler: (event: ServerEvent) => void) =>
  listen<ServerEvent>("server-event", (event) => handler(event.payload));

/** Hört für die Karte auf alle Ereignisse der LAN. Liefert die Funktion zum Abmelden. */
export const onStageEvent = (handler: (event: StageEvent) => void) =>
  listen<StageEvent>("stage-event", (event) => handler(event.payload));

/** Was die Fensterknöpfe tun. Freigegeben in `src-tauri/capabilities/main.json`. */
export type WindowAction = "drag" | "minimize" | "close";

/** Verschiebt, minimiert oder schließt das Pet-Fenster. */
export async function windowAction(action: WindowAction) {
  const current = getCurrentWindow();
  if (action === "drag") return current.startDragging();
  if (action === "minimize") return current.minimize();
  return current.close();
}

/** Setzt die Größe des Pet-Fensters in CSS-Pixeln. Die linke obere Ecke bleibt stehen. */
export const resizeWindow = (width: number, height: number) =>
  getCurrentWindow().setSize(new LogicalSize(width, height));
