//! Rust-Backend von **Jelly**, dem Desktop-Begleiter für die LAN am Umwelt-Campus Birkenfeld.
//!
//! Über XP, Level, Cosmetics und Erfolge entscheidet der Jelly-Server (`apps/server`). Rust spricht
//! mit ihm, hält das Token und speichert die Geräte-Einstellungen. Die Oberfläche (React im
//! Tauri-WebView) zeigt nur an und meldet, was passieren soll.
//!
//! # Aufbau
//!
//! - [`pet`]: lokaler Stand und reine Regeln, ohne Dateizugriff und ohne Netz.
//! - [`store`]: lädt und speichert den lokalen Stand atomar als `jelly.json`.
//! - [`api`]: Typen aus dem Server-Vertrag und der HTTP-Client.
//! - [`events`]: leitet den Ereignis-Stream des Servers an die Oberfläche weiter.
//! - [`map`]: das Fenster mit der Karte.
//! - [`error`]: alle Fehler samt deutscher Meldung für die Oberfläche.
//! - [`commands`]: die Tauri-Befehle, die die Oberfläche aufruft.
//!
//! [`run`] setzt die App zusammen. `main.rs` ruft nur diese Funktion auf, wie es Tauri vorsieht,
//! damit Desktop und Mobile denselben Einstieg teilen.

#![warn(missing_docs)]
// Die Doku wird immer mit `--document-private-items` gebaut (`pnpm run doc:rust`), Links auf
// private Items funktionieren dort.
#![allow(rustdoc::private_intra_doc_links)]

pub mod api;
mod commands;
pub mod error;
pub mod events;
pub mod map;
pub mod pet;
pub mod store;

use tauri::{AppHandle, Manager, WindowEvent};

/// Label des Pet-Fensters aus `tauri.conf.json`.
pub const MAIN_WINDOW: &str = "main";

/// Startet die App: Single-Instance-Schutz, Sitzungs-State und alle Befehle.
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
        .manage(commands::GameState::default())
        .on_window_event(|window, event| match (window.label(), event) {
            // Ohne das Pet hat die Karte keinen Sinn, und die App liefe mit ihr ohne Pet weiter.
            (MAIN_WINDOW, WindowEvent::CloseRequested { .. }) => map::close(window.app_handle()),
            // Die Karte vertritt das Pet. Ist sie zu, kommt das Pet zurück.
            (map::MAP_WINDOW, WindowEvent::Destroyed) => map::on_closed(window.app_handle()),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_game,
            commands::get_catalog,
            commands::register,
            commands::join_lan,
            commands::act,
            commands::emote,
            commands::set_sign,
            commands::set_follow,
            commands::get_stage,
            commands::get_map_state,
            commands::open_map,
            commands::redeem_code,
            commands::start_partner_emote,
            commands::join_partner_emote,
            commands::update_profile,
            commands::equip_cosmetic,
            commands::update_settings,
            commands::presence
        ])
        .run(tauri::generate_context!())
        .expect("Jelly konnte nicht gestartet werden");
}

/// Holt das Pet-Fenster aus der Taskleiste und gibt ihm den Fokus.
fn focus_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
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
