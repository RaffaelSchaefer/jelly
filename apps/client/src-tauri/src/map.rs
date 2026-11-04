//! Das Fenster mit der Karte: die 3D-Bühne der LAN. Solange es offen ist, vertritt es das Pet.
//!
//! Die Seite dazu ist `map.html`, ihre Rechte stehen in `capabilities/map.json`. Sie holt ihre Daten
//! wie das Pet-Fenster über Tauri-Befehle, das Token bleibt also in Rust.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::{
    error::{Error, Result},
    MAIN_WINDOW,
};

/// Label des Fensters, so auch in `capabilities/map.json`.
pub const MAP_WINDOW: &str = "map";
/// Seite des Fensters. `vite.config.ts` baut sie als zweiten Einstieg.
const MAP_PAGE: &str = "map.html";
/// Titel des Fensters.
const MAP_TITLE: &str = "Jelly – Karte";
/// Größe beim Öffnen: Die Halle ist tiefer als breit, 70 Jellies bleiben so anklickbar.
const MAP_SIZE: (f64, f64) = (960.0, 800.0);
/// Darunter wären die Jellies zu klein zum Treffen.
const MAP_MIN_SIZE: (f64, f64) = (480.0, 400.0);

/// Öffnet die Karte oder holt ein offenes Fenster nach vorn.
///
/// # Fehler
///
/// [`Error::Window`], wenn das Betriebssystem das Fenster nicht öffnet oder nicht aktiviert.
pub fn open(app: &AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window(MAP_WINDOW) {
        return window
            .unminimize()
            .and_then(|()| window.show())
            .and_then(|()| window.set_focus())
            .map_err(Error::Window);
    }
    WebviewWindowBuilder::new(app, MAP_WINDOW, WebviewUrl::App(MAP_PAGE.into()))
        .title(MAP_TITLE)
        .inner_size(MAP_SIZE.0, MAP_SIZE.1)
        .min_inner_size(MAP_MIN_SIZE.0, MAP_MIN_SIZE.1)
        // Rahmen und Knöpfe zeichnet die Seite selbst, wie beim Pet.
        .decorations(false)
        .transparent(true)
        .shadow(false)
        // Der erste Klick auf ein Jelly zählt auch, solange das Spiel den Fokus hat.
        .accept_first_mouse(true)
        .build()
        .map_err(Error::Window)?;
    // Die Karte vertritt das Pet, solange sie offen ist.
    show_pet(app, false);
    Ok(())
}

/// Zeigt das Pet-Fenster wieder, sobald die Karte zu ist. `lib.rs` ruft es beim Fensterereignis.
pub fn on_closed(app: &AppHandle) {
    show_pet(app, true);
}

/// Zeigt das Pet-Fenster oder versteckt es.
fn show_pet(app: &AppHandle, visible: bool) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let result = if visible {
        window.show()
    } else {
        window.hide()
    };
    if let Err(error) = result {
        eprintln!("Das Pet-Fenster konnte nicht umgeschaltet werden: {error}");
    }
}

/// Ob die Karte gerade offen ist.
pub fn is_open(app: &AppHandle) -> bool {
    app.get_webview_window(MAP_WINDOW).is_some()
}

/// Schließt die Karte, falls sie offen ist.
pub fn close(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAP_WINDOW) else {
        return;
    };
    if let Err(error) = window.close() {
        eprintln!("Die Karte konnte nicht geschlossen werden: {error}");
    }
}
