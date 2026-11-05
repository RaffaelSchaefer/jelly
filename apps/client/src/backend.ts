/**
 * Die einzige Stelle, die mit dem Rust-Backend und dem Desktop-Fenster spricht.
 *
 * Jede Funktion entspricht einem Befehl in `src-tauri/src/commands.rs`. Rust spricht mit dem Server
 * und hält das Secret, die Oberfläche sieht nur den fertigen {@link Game}. Schlägt ein Befehl fehl,
 * kommt eine fertige deutsche Meldung als Text an und wird mit `String(cause)` angezeigt. Im
 * Browser (`pnpm webpreview:dev`) gibt es kein Backend: Dort ist {@link desktop} `false`, und es
 * darf nichts von hier aufgerufen werden.
 *
 * @module
 */

import type { StageEvent, StageMove } from "@jelly/stage";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type {
  Action,
  Catalog,
  CosmeticSlot,
  Game,
  InviteAnswer,
  PartnerInvite,
  PetColor,
  ServerEvent,
  Settings,
  Stage,
} from "./pet";

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

/** Ergebnis einer Aufforderung zu einem Partner-Emote oder der Antwort darauf. */
export interface PartnerOutcome extends ActResult {
  /** Die Aufforderung nach der Änderung. */
  invite: PartnerInvite;
}

/** Lädt Stand und LAN neu (`get_game`). Prüft beim ersten Mal die App-Version. */
export const getGame = () => invoke<Game>("get_game");

/** Feste Listen des Servers (`get_catalog`). */
export const getCatalog = () => invoke<Catalog>("get_catalog");

/**
 * Tauscht einen Code gegen einen Zugang (`redeem_access`). Name und Farbe zählen nur, wenn der Code
 * ein neues Konto anlegt. Ein vorhandenes Konto kommt damit zurück.
 */
export const redeemAccess = (code: string, name?: string, color?: PetColor) =>
  invoke<Game>("redeem_access", { code, name, color });

/** Stupser oder Selbstmeldung (`act`). */
export const act = (action: Action) => invoke<ActResult>("act", { action });

/** Spielt eine Geste aus dem Server-Katalog (`emote`). */
export const emote = (key: string) => invoke<Game>("emote", { key });

/** Hebt ein Schild aus dem Server-Katalog oder senkt es mit `null` (`set_sign`). */
export const setSign = (key: string | null) => invoke<Game>("set_sign", { key });

/** Stellt das Jelly neben ein anderes oder lässt es mit `null` weggehen (`set_follow`). */
export const setFollow = (playerId: number | null) => invoke<Game>("set_follow", { playerId });

/** Schickt das Jelly auf einen Ausflug zu einem Punkt der Bühne, in Prozent (`go_to`). */
export const goTo = (x: number, y: number) => invoke<Game>("go_to", { x, y });

/** Lässt ein Jelly aufleuchten (`highlight_player`). */
export const highlightPlayer = (playerId: number) => invoke<Game>("highlight_player", { playerId });

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

/** Fordert ein Jelly in der Nähe zu einem Partner-Emote auf (`invite_partner`). */
export const invitePartner = (key: string, partnerId: number) =>
  invoke<PartnerOutcome>("invite_partner", { key, partnerId });

/** Nimmt eine Aufforderung an, lehnt sie ab oder zieht die eigene zurück (`answer_partner`). */
export const answerPartner = (id: number, answer: InviteAnswer) =>
  invoke<PartnerOutcome>("answer_partner", { id, answer });

/** Was sich am Profil ändert. Fehlende Felder bleiben, wie sie sind. */
export interface ProfilePatch {
  name?: string;
  color?: PetColor;
}

/** Übernimmt Name und/oder Farbe (`update_profile`). */
export const updateProfile = (patch: ProfilePatch) => invoke<Game>("update_profile", { ...patch });

/** Legt ein Cosmetic auf einen Platz oder leert ihn mit `null` (`equip_cosmetic`). */
export const equipCosmetic = (slot: CosmeticSlot, key: string | null, color?: string) =>
  invoke<Game>("equip_cosmetic", { slot, key, color });

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

/** Hört für die Karte auf die Wege der Jellies. Liefert die Funktion zum Abmelden. */
export const onStageMove = (handler: (move: StageMove) => void) =>
  listen<StageMove>("stage-move", (event) => handler(event.payload));

/** Hört darauf, dass der Server Ereignisse verworfen hat. Dann gilt es, den Stand neu zu lesen. */
export const onStreamReset = (handler: () => void) => listen("stream-reset", () => handler());

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
