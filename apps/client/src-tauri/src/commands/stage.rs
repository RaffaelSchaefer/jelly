//! Die Befehle zur Bühne: wer dort steht, was die Karte zeigt und was man auf ihr auslöst.

use serde::Serialize;
use tauri::{AppHandle, State};

use super::{session::session, Game, GameState};
use crate::{
    api::{Stage, Trip},
    error::{Error, Result},
    popout,
};

/// Was die Karte bei jedem Lesen vom Server bekommt. Die Einstellungen des Geräts liest sie
/// getrennt mit [`super::get_settings`], denn dieses Lesen scheitert ohne laufende LAN.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapState {
    /// Das eigene Jelly. Frisch je Lesen, denn ein neuer Code kann es ändern.
    own_id: i64,
    /// Regel `near_distance` der LAN: Bis dahin reicht eine Aufforderung, in Jelly-Einheiten.
    near_distance: f64,
    /// Der laufende Ausflug des eigenen Jellys. Die Bühne nennt ihn nicht, nur der eigene Stand.
    trip: Option<Trip>,
    /// Raumkarte und Jellies vom Server.
    stage: Stage,
}

/// Liest, wer gerade auf der Bühne steht.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler.
#[tauri::command]
pub async fn get_stage(app: AppHandle, state: State<'_, GameState>) -> Result<Stage> {
    let api = {
        let mut slot = state.0.lock().await;
        let session = session(&app, &mut slot).await?;
        session.registered()?;
        session.api.clone()
    };
    // Ohne Lock: Hinge diese Anfrage, warteten alle Aktionen des Pets mit.
    api.stage().await
}

/// Schickt das Jelly auf einen Ausflug zu einem Punkt der Bühne, in Prozent.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `invalid_trip`.
#[tauri::command]
pub async fn go_to(app: AppHandle, state: State<'_, GameState>, x: f64, y: f64) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = session.api.go_to(x, y).await?;
    session.set_me(me);
    Ok(session.game())
}

/// Lässt ein Jelly aufleuchten. Den Lichtkegel zeichnet die Bühne, sobald das Ereignis ankommt.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `highlight_cooldown`.
#[tauri::command]
pub async fn highlight_player(
    app: AppHandle,
    state: State<'_, GameState>,
    player_id: i64,
) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = session.api.highlight(player_id).await?;
    session.set_me(me);
    Ok(session.game())
}

/// Fehlercode, wenn ein Stapel weiter weg steht als `near_distance`.
const TOO_FAR: &str = "too_far";

/// Macht aus `too_far` ein `None`. Die Oberfläche bekommt Fehler nur als Text und könnte ihn sonst
/// nicht erkennen. Die Karte lässt das Jelly dann erst hinlaufen und versucht es bei der Ankunft
/// noch einmal.
///
/// # Fehler
///
/// Jeder andere Fehler aus `result`.
fn unless_too_far<T>(result: Result<T>) -> Result<Option<T>> {
    match result {
        Ok(value) => Ok(Some(value)),
        Err(Error::Server { code, .. }) if code == TOO_FAR => Ok(None),
        Err(error) => Err(error),
    }
}

/// Beginnt einen Stapel, wo das Jelly steht. Es steht unten, Ausflug und Folgen enden.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler.
#[tauri::command]
pub async fn start_stack(app: AppHandle, state: State<'_, GameState>) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let answer = session.api.start_stack().await?;
    session.set_me(answer.me);
    Ok(session.game())
}

/// Lässt das Jelly oben auf einen Stapel klettern. `None`, solange es dafür zu weit weg steht.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `stack_full` oder `stack_not_found`, nicht aber
/// `too_far`.
#[tauri::command]
pub async fn join_stack(
    app: AppHandle,
    state: State<'_, GameState>,
    stack_id: i64,
) -> Result<Option<Game>> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let Some(answer) = unless_too_far(session.api.join_stack(stack_id).await)? else {
        return Ok(None);
    };
    session.set_me(answer.me);
    Ok(Some(session.game()))
}

/// Lässt das Jelly vom Stapel steigen. Ohne Stapel ändert sich nichts.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler.
#[tauri::command]
pub async fn leave_stack(app: AppHandle, state: State<'_, GameState>) -> Result<Game> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let me = session.api.leave_stack().await?;
    session.set_me(me);
    Ok(session.game())
}

/// Liest, was die Karte zeigt. Öffnet keine Sitzung, das Laden gehört dem Pet-Fenster.
///
/// # Fehler
///
/// [`Error::NotRegistered`] ohne geladene Sitzung oder Konto, sonst Netzwerk- oder Serverfehler.
#[tauri::command]
pub async fn get_map_state(app: AppHandle, state: State<'_, GameState>) -> Result<MapState> {
    let (api, own_id, trip, near_distance) = {
        let mut slot = state.0.lock().await;
        let session = slot.as_mut().ok_or(Error::NotRegistered)?;
        // Über `refresh`, damit der neue Stream beim frischen Stand beginnt und das Pet nichts
        // zweimal hört, was es schon gehört hat.
        if !session.stream.is_running() {
            session.refresh(&app).await?;
        }
        let me = session.registered()?;
        (
            session.api.clone(),
            me.id,
            me.trip.clone(),
            session.lan.rules.near_distance,
        )
    };
    let stage = api.stage().await?;
    Ok(MapState {
        own_id,
        near_distance,
        trip,
        stage,
    })
}

/// Öffnet die Karte oder holt sie nach vorn.
///
/// Asynchron, denn ein Fenster aus einem synchronen Befehl blockiert unter Windows die App.
///
/// # Fehler
///
/// [`Error::Window`], wenn sich das Fenster nicht öffnen lässt.
#[tauri::command]
pub async fn open_map(app: AppHandle) -> Result<()> {
    popout::open(&app, popout::MAP)
}

/// Öffnet den Shop oder holt ihn nach vorn. Asynchron aus demselben Grund wie [`open_map`].
///
/// # Fehler
///
/// [`Error::Window`], wenn sich das Fenster nicht öffnen lässt.
#[tauri::command]
pub async fn open_shop(app: AppHandle) -> Result<()> {
    popout::open(&app, popout::SHOP)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Ein Fehler des Servers mit `code`.
    fn refused(code: &str) -> Result<()> {
        Err(Error::Server {
            code: code.into(),
            message: "Nein.".into(),
        })
    }

    #[test]
    fn only_too_far_turns_into_none() {
        assert!(matches!(unless_too_far(refused(TOO_FAR)), Ok(None)));
        assert!(matches!(unless_too_far(Ok(())), Ok(Some(()))));
        assert!(matches!(
            unless_too_far(refused("stack_full")),
            Err(Error::Server { code, .. }) if code == "stack_full"
        ));
        assert!(matches!(
            unless_too_far::<()>(Err(Error::NotRegistered)),
            Err(Error::NotRegistered)
        ));
    }
}
