//! Rust-Backend von **Jelly**, dem Desktop-Begleiter für die LAN am Umwelt-Campus Birkenfeld.
//!
//! Rust besitzt den Spielstand: Es rechnet XP, prüft Eingaben und speichert. Die Oberfläche
//! (React im Tauri-WebView) zeigt nur an und meldet, was passieren soll.
//!
//! # Aufbau
//!
//! - [`pet`]: Spielmodell und Regeln, ohne Dateizugriff.
//! - [`store`]: lädt und speichert den Spielstand atomar als `pet.json`.
//! - [`error`]: alle Fehler samt deutscher Meldung für die Oberfläche.
//! - [`commands`]: die Tauri-Befehle, die die Oberfläche aufruft.
//!
//! [`run`] setzt die App zusammen. `main.rs` ruft nur diese Funktion auf, wie es Tauri vorsieht,
//! damit Desktop und Mobile denselben Einstieg teilen.

#![warn(missing_docs)]
// Die Doku wird immer mit `--document-private-items` gebaut (`pnpm run doc:rust`), Links auf
// private Items funktionieren dort.
#![allow(rustdoc::private_intra_doc_links)]

mod commands;
pub mod error;
pub mod pet;
pub mod store;

use tauri::{AppHandle, Manager};

/// Startet die App: Single-Instance-Schutz, Spielstand-State und alle Befehle.
///
/// # Panics
///
/// Wenn Tauri nicht starten kann, zum Beispiel weil kein WebView installiert ist.
pub fn run() {
    tauri::Builder::default()
        // Eine zweite Instanz holt das vorhandene Fenster nach vorn, statt denselben Spielstand
        // aus einem zweiten Prozess zu überschreiben.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            focus_main_window(app)
        }))
        .manage(commands::PetState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_pet,
            commands::interact,
            commands::record_event,
            commands::customize_pet,
            commands::equip_cosmetic
        ])
        .run(tauri::generate_context!())
        .expect("Jelly konnte nicht gestartet werden");
}

/// Holt das Pet-Fenster aus der Taskleiste und gibt ihm den Fokus.
fn focus_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(error) = window
        .unminimize()
        .and_then(|_| window.show())
        .and_then(|_| window.set_focus())
    {
        eprintln!("Das vorhandene Pet-Fenster konnte nicht aktiviert werden: {error}");
    }
}
