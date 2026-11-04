//! Die Tauri-Befehle, die die Oberfläche über `invoke()` aufruft.
//!
//! Jeder Befehl holt sich den [`Store`] über [`with_store`], ändert ihn und gibt den neuen Stand
//! zurück. Die Oberfläche schickt nur, *was* passieren soll (eine Aktion, eine Event-ID, ein
//! Aussehen), nie XP-Werte oder Dateipfade.
//!
//! Gegenstück im Frontend: `src/backend.ts`. Neue Befehle zusätzlich in [`crate::run`] bei
//! `generate_handler!` eintragen, sonst findet die Oberfläche sie nicht.

use std::{
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager, State};

use crate::{
    error::{Error, Result},
    pet::{Action, Appearance, Pet},
    store::Store,
};

/// Der Spielstand als Tauri-State.
///
/// Wird erst beim ersten Befehl geöffnet, weil das App-Datenverzeichnis erst zur Laufzeit bekannt
/// ist. Der Mutex sorgt dafür, dass gleichzeitige Befehle nacheinander laufen und sich beim
/// Speichern nicht überholen.
#[derive(Default)]
pub struct PetState(Mutex<Option<Store>>);

/// Führt `operation` mit dem (bei Bedarf frisch geöffneten) Store aus.
fn with_store(
    app: &AppHandle,
    state: &PetState,
    operation: impl FnOnce(&mut Store) -> Result<Pet>,
) -> Result<Pet> {
    let mut guard = state.0.lock().map_err(|_| Error::Unavailable)?;
    let store = match &mut *guard {
        Some(store) => store,
        empty => {
            let directory = app.path().app_data_dir().map_err(Error::DataDir)?;
            empty.insert(Store::open(directory.join("pet.json"))?)
        }
    };
    operation(store)
}

/// Aktuelle Unix-Zeit in Sekunden.
fn unix_now() -> Result<u64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(Error::Clock)?
        .as_secs())
}

/// Liefert den aktuellen Spielstand.
#[tauri::command]
pub fn get_pet(app: AppHandle, state: State<'_, PetState>) -> Result<Pet> {
    with_store(&app, &state, |store| Ok(store.pet.clone()))
}

/// Stupser oder Selbstmeldung (Essen, Getränk), siehe [`Store::interact_at`].
#[tauri::command]
pub fn interact(app: AppHandle, state: State<'_, PetState>, action: Action) -> Result<Pet> {
    with_store(&app, &state, |store| {
        store.interact_at(action, Instant::now(), unix_now()?)
    })
}

/// Für das Event-System der Orga (noch nicht angebunden): ein Aufruf pro Event, an dem man
/// teilgenommen hat. Siehe [`Store::record_event`].
#[tauri::command]
pub fn record_event(app: AppHandle, state: State<'_, PetState>, event_id: String) -> Result<Pet> {
    with_store(&app, &state, |store| {
        store.record_event(event_id, unix_now()?)
    })
}

/// Legt ein Cosmetic an oder ab, siehe [`Store::equip`].
#[tauri::command]
pub fn equip_cosmetic(
    app: AppHandle,
    state: State<'_, PetState>,
    cosmetic: Option<String>,
) -> Result<Pet> {
    with_store(&app, &state, |store| store.equip(cosmetic))
}

/// Übernimmt Name, Farbe, Bewegung und Größe, siehe [`Store::customize`].
#[tauri::command]
pub fn customize_pet(
    app: AppHandle,
    state: State<'_, PetState>,
    appearance: Appearance,
) -> Result<Pet> {
    with_store(&app, &state, |store| store.customize(appearance))
}
