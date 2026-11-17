//! Die ausgelagerten Fenster: Karte und Shop. Solange eines offen ist, vertritt es das Pet.
//!
//! Ihre Seiten sind `map.html` und `shop.html`, ihre Rechte stehen je Fenster in `capabilities/`.
//! Sie holen ihre Daten wie das Pet-Fenster über Tauri-Befehle, das Secret bleibt also in Rust.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::{
    error::{Error, Result},
    MAIN_WINDOW,
};

/// Ein Fenster, das statt des Pets erscheint.
#[derive(Debug, Clone, Copy)]
pub struct Popout {
    /// Label des Fensters, so auch in `capabilities/`.
    pub label: &'static str,
    /// Seite des Fensters. `vite.config.ts` baut sie als eigenen Einstieg.
    page: &'static str,
    /// Titel des Fensters.
    title: &'static str,
    /// Größe beim Öffnen.
    size: (f64, f64),
    /// Kleinste Größe.
    min_size: (f64, f64),
}

/// Die Karte: die 3D-Bühne der LAN. Die Halle ist tiefer als breit, 70 Jellies bleiben so
/// anklickbar, darunter wären sie zu klein zum Treffen.
pub const MAP: Popout = Popout {
    label: "map",
    page: "map.html",
    title: "Jelly – Karte",
    size: (960.0, 800.0),
    min_size: (480.0, 400.0),
};

/// Der Shop: Cosmetics für Münzen, mit Anprobe am eigenen Jelly.
pub const SHOP: Popout = Popout {
    label: "shop",
    page: "shop.html",
    title: "Jelly – Shop",
    size: (720.0, 600.0),
    min_size: (520.0, 460.0),
};

/// Alle ausgelagerten Fenster.
const POPOUTS: [Popout; 2] = [MAP, SHOP];

/// Öffnet `popout` oder holt ein offenes Fenster nach vorn.
///
/// # Fehler
///
/// [`Error::Window`], wenn das Betriebssystem das Fenster nicht öffnet oder nicht aktiviert.
pub fn open(app: &AppHandle, popout: Popout) -> Result<()> {
    if let Some(window) = app.get_webview_window(popout.label) {
        return window
            .unminimize()
            .and_then(|()| window.show())
            .and_then(|()| window.set_focus())
            .map_err(Error::Window);
    }
    WebviewWindowBuilder::new(app, popout.label, WebviewUrl::App(popout.page.into()))
        .title(popout.title)
        .inner_size(popout.size.0, popout.size.1)
        .min_inner_size(popout.min_size.0, popout.min_size.1)
        // Rahmen und Knöpfe zeichnet die Seite selbst, wie beim Pet.
        .decorations(false)
        .transparent(true)
        .shadow(false)
        // Der erste Klick zählt auch, solange das Spiel den Fokus hat.
        .accept_first_mouse(true)
        .build()
        .map_err(Error::Window)?;
    show_pet(app, false);
    Ok(())
}

/// Zeigt das Pet-Fenster wieder, sobald kein ausgelagertes Fenster mehr offen ist. `lib.rs` ruft
/// es, wenn das Fenster `label` zerstört wurde.
pub fn on_closed(app: &AppHandle, label: &str) {
    // Tauri hat das zerstörte Fenster da schon ausgetragen. Es wird trotzdem übersprungen, damit
    // das Pet nicht von dieser Reihenfolge abhängt.
    let others_open = POPOUTS
        .iter()
        .filter(|popout| popout.label != label)
        .any(|popout| is_open(app, *popout));
    if !others_open {
        show_pet(app, true);
    }
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

/// Ob `popout` gerade offen ist.
pub fn is_open(app: &AppHandle, popout: Popout) -> bool {
    app.get_webview_window(popout.label).is_some()
}

/// Ob `label` ein ausgelagertes Fenster ist.
pub fn is_popout(label: &str) -> bool {
    POPOUTS.iter().any(|popout| popout.label == label)
}

/// Schließt alle ausgelagerten Fenster, die offen sind.
pub fn close_all(app: &AppHandle) {
    for popout in POPOUTS {
        let Some(window) = app.get_webview_window(popout.label) else {
            continue;
        };
        if let Err(error) = window.close() {
            eprintln!(
                "Das Fenster {} konnte nicht geschlossen werden: {error}",
                popout.label
            );
        }
    }
}
