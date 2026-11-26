//! Der Modus „Immer im Vordergrund“ des Pet-Fensters ([`Settings::always_on_top`]).
//!
//! An heißt: über allen gewöhnlichen Fenstern und auf jeder Arbeitsfläche. Aus heißt: ein
//! gewöhnliches Fenster, das hinter anderen verschwinden kann. Je Plattform:
//!
//! - **Windows:** `HWND_TOPMOST` über tao. Das liegt über Spielen im randlosen Vollbild, über
//!   exklusivem Vollbild liegt kein Fenster. Arbeitsflächen kennt tao dort nicht, der Aufruf tut
//!   nichts.
//! - **Linux:** `keep_above` und `stick` von GTK. Beides sind Wünsche an den Fenstermanager, der sie
//!   befolgen kann oder nicht (unter Wayland oft nicht).
//! - **macOS:** Ebene und Verhalten setzt dieses Modul selbst am `NSWindow` (Untermodul `macos`,
//!   nur dort gebaut). Damit steht das Pet in jedem Space. In den Space eines anderen Programms im
//!   Vollbild lässt macOS seit 10.14 nur Fenster von Programmen ohne Dock-Symbol (so begründet es
//!   Electron in `NativeWindowMac::SetVisibleOnAllWorkspaces`), Jelly mit Dock-Symbol fehlt dort.
//!
//! Verstecken und Zeigen (`hide`, `show`, `set_focus`) lassen Ebene und Verhalten stehen, denn tao
//! ordnet das Fenster dabei nur aus und ein (`orderOut`, `makeKeyAndOrderFront`). Darum wenden
//! [`crate::popout`] und `focus_main_window` den Modus danach nicht neu an.

use tauri::{AppHandle, Manager, WebviewWindow};

#[cfg(doc)]
use crate::pet::Settings;
use crate::MAIN_WINDOW;

/// Wendet den Modus auf das Pet-Fenster an. Fehler meldet es nur, denn ein Fenster, das nicht oben
/// bleibt, soll weder das Speichern noch den Start aufhalten.
pub fn apply_always_on_top(app: &AppHandle, always_on_top: bool) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        eprintln!("Das Pet-Fenster fehlt, der Modus „Immer im Vordergrund“ bleibt, wie er war.");
        return;
    };
    if let Err(error) = set_always_on_top(&window, always_on_top) {
        eprintln!("Der Modus „Immer im Vordergrund“ ließ sich nicht anwenden: {error}");
    }
}

/// Stellt Ebene und Arbeitsflächen von `window` ein.
///
/// # Fehler
///
/// Wenn Tauri die Nachricht nicht an das Fenster zustellen kann.
#[cfg(not(target_os = "macos"))]
fn set_always_on_top(window: &WebviewWindow, always_on_top: bool) -> tauri::Result<()> {
    window.set_always_on_top(always_on_top)?;
    window.set_visible_on_all_workspaces(always_on_top)
}

/// Stellt Ebene und Spaces von `window` ein, beides in einer Aufgabe auf dem Hauptthread.
///
/// Nicht über `set_always_on_top` von Tauri: tao setzt die Ebene damit später über die
/// Dispatch-Queue (`set_level_async`) und überschriebe die höhere Ebene aus `macos` wieder mit
/// `NSFloatingWindowLevel`.
///
/// # Fehler
///
/// Wenn Tauri die Aufgabe nicht an den Hauptthread geben kann.
#[cfg(target_os = "macos")]
fn set_always_on_top(window: &WebviewWindow, always_on_top: bool) -> tauri::Result<()> {
    let target = window.clone();
    window.run_on_main_thread(move || match target.ns_window() {
        Ok(pointer) => {
            // SAFETY: `ns_window` liefert den `NSWindow` dieses Fensters, den Tauri hält, solange
            // das Fenster lebt, und diese Aufgabe läuft auf dem Hauptthread, wie AppKit es
            // verlangt.
            let ns_window = unsafe { &*pointer.cast::<objc2_app_kit::NSWindow>() };
            macos::apply(ns_window, always_on_top);
        }
        Err(error) => eprintln!("Das macOS-Fenster des Pets fehlt: {error}"),
    })
}

/// Ebene und Verhalten des `NSWindow` gegenüber Spaces und Programmen im Vollbild.
///
/// Tauri setzt davon nur `NSFloatingWindowLevel` und `canJoinAllSpaces`. Dazu kommen hier:
///
/// - die Ebene `NSModalPanelWindowLevel` (8) statt der schwebenden (3): über schwebenden Fenstern
///   anderer Programme, aber unter Dock (20) und Menüleiste (24), damit das Pet beide nicht
///   verdeckt.
/// - `fullScreenAuxiliary`: Damit darf das Fenster neben einem Programm im Vollbild stehen, statt
///   den Space zu verlassen.
#[cfg(target_os = "macos")]
mod macos {
    use objc2_app_kit::{
        NSModalPanelWindowLevel, NSNormalWindowLevel, NSWindow,
        NSWindowCollectionBehavior as Behavior, NSWindowLevel,
    };

    /// Setzt Ebene und Verhalten von `window`. Nur auf dem Hauptthread aufrufen.
    pub(super) fn apply(window: &NSWindow, on: bool) {
        window.setLevel(level(on));
        window.setCollectionBehavior(collection_behavior(window.collectionBehavior(), on));
    }

    /// Die Ebene des Fensters, aus ist die gewöhnliche.
    pub(super) fn level(on: bool) -> NSWindowLevel {
        if on {
            NSModalPanelWindowLevel
        } else {
            NSNormalWindowLevel
        }
    }

    /// Das Verhalten mit oder ohne die Flags dieses Modus, alle anderen bleiben.
    ///
    /// AppKit erlaubt je Gruppe nur ein Flag und wirft sonst eine Ausnahme: `canJoinAllSpaces`
    /// verdrängt `moveToActiveSpace`, `fullScreenAuxiliary` die beiden anderen Vollbild-Arten.
    pub(super) fn collection_behavior(current: Behavior, on: bool) -> Behavior {
        let ours = Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary;
        if on {
            current.difference(
                Behavior::MoveToActiveSpace
                    | Behavior::FullScreenPrimary
                    | Behavior::FullScreenNone,
            ) | ours
        } else {
            current.difference(ours)
        }
    }

    #[cfg(test)]
    mod tests {
        use objc2_app_kit::{
            NSFloatingWindowLevel, NSNormalWindowLevel, NSWindowCollectionBehavior as Behavior,
            NSWindowLevel,
        };

        use super::{collection_behavior, level};

        /// `kCGDockWindowLevel`, die Ebene des Docks.
        const DOCK_LEVEL: NSWindowLevel = 20;

        #[test]
        fn an_liegt_ueber_schwebenden_fenstern_und_unter_dem_dock() {
            assert!(level(true) > NSFloatingWindowLevel);
            assert!(level(true) < DOCK_LEVEL);
            assert_eq!(level(false), NSNormalWindowLevel);
        }

        #[test]
        fn an_setzt_beide_flags_und_behaelt_den_rest() {
            let current = Behavior::IgnoresCycle;
            assert_eq!(
                collection_behavior(current, true),
                Behavior::IgnoresCycle | Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary
            );
        }

        #[test]
        fn an_verdraengt_was_appkit_daneben_nicht_erlaubt() {
            let current = Behavior::MoveToActiveSpace
                | Behavior::FullScreenPrimary
                | Behavior::FullScreenNone;
            assert_eq!(
                collection_behavior(current, true),
                Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary
            );
        }

        #[test]
        fn aus_loescht_nur_die_eigenen_flags() {
            let current =
                Behavior::CanJoinAllSpaces | Behavior::FullScreenAuxiliary | Behavior::IgnoresCycle;
            assert_eq!(collection_behavior(current, false), Behavior::IgnoresCycle);
        }

        #[test]
        fn zweimal_anwenden_aendert_nichts() {
            for on in [true, false] {
                let once = collection_behavior(Behavior::Default, on);
                assert_eq!(collection_behavior(once, on), once);
            }
        }
    }
}
