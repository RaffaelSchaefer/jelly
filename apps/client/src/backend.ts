/**
 * Die einzige Stelle, die mit dem Rust-Backend und dem Desktop-Fenster spricht.
 *
 * Jede Funktion entspricht einem Befehl in `src-tauri/src/commands.rs`. Schlägt ein Befehl fehl,
 * kommt die fertige deutsche Meldung aus `error.rs` als Text an und wird mit `String(cause)`
 * angezeigt. Im Browser (`pnpm webpreview:dev`) gibt es kein Backend: Dort ist {@link desktop}
 * `false`, und es darf nichts von hier aufgerufen werden.
 *
 * @module
 */

import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { Action, Appearance, Pet } from "./pet";

/** Läuft die Oberfläche in der Desktop-App (sonst: Browser-Vorschau)? */
export const desktop = isTauri();

/** Aktueller Spielstand (`get_pet`). */
export const getPet = () => invoke<Pet>("get_pet");

/** Stupser oder Selbstmeldung (`interact`). Events laufen nicht hierüber. */
export const interact = (action: Action) => invoke<Pet>("interact", { action });

/** Übernimmt Name, Farbe, Bewegung und Größe (`customize_pet`). */
export const customizePet = (appearance: Appearance) =>
  invoke<Pet>("customize_pet", { appearance });

/** Legt ein Cosmetic an oder mit `null` ab (`equip_cosmetic`). */
export const equipCosmetic = (cosmetic: string | null) =>
  invoke<Pet>("equip_cosmetic", { cosmetic });

/** Was die Fensterknöpfe tun. Freigegeben in `src-tauri/capabilities/main.json`. */
export type WindowAction = "drag" | "minimize" | "close";

/** Verschiebt, minimiert oder schließt das Pet-Fenster. */
export async function windowAction(action: WindowAction) {
  const current = getCurrentWindow();
  if (action === "drag") return current.startDragging();
  if (action === "minimize") return current.minimize();
  return current.close();
}
