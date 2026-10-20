pub mod pet;

use pet::{Action, Color, Pet, Store};
use std::{
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
struct PetState(Mutex<Option<Store>>);

fn with_store(
    app: &AppHandle,
    state: &PetState,
    operation: impl FnOnce(&mut Store) -> Result<Pet, String>,
) -> Result<Pet, String> {
    let mut guard = state.0.lock().map_err(|_| {
        "Der Spielstand ist gerade nicht verfügbar. Bitte die App neu starten.".to_owned()
    })?;
    if guard.is_none() {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("App-Datenverzeichnis nicht verfügbar: {error}"))?;
        *guard = Some(Store::open(directory.join("pet.json"))?);
    }
    operation(guard.as_mut().ok_or("Spielstand nicht verfügbar")?)
}

#[tauri::command]
fn get_pet(app: AppHandle, state: State<'_, PetState>) -> Result<Pet, String> {
    with_store(&app, &state, |store| Ok(store.pet.clone()))
}

#[tauri::command]
fn interact(app: AppHandle, state: State<'_, PetState>, action: Action) -> Result<Pet, String> {
    with_store(&app, &state, |store| {
        let unix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("Die Systemuhr steht vor 1970: {error}"))?
            .as_secs();
        store.interact_at(action, Instant::now(), unix)
    })
}

#[tauri::command]
fn equip_cosmetic(
    app: AppHandle,
    state: State<'_, PetState>,
    cosmetic: Option<String>,
) -> Result<Pet, String> {
    with_store(&app, &state, |store| store.equip(cosmetic))
}

#[tauri::command]
fn customize_pet(
    app: AppHandle,
    state: State<'_, PetState>,
    name: String,
    color: Color,
    reduced_motion: bool,
    size: u8,
) -> Result<Pet, String> {
    with_store(&app, &state, |store| {
        store.customize(name, color, reduced_motion, size)
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = window
                    .unminimize()
                    .and_then(|_| window.show())
                    .and_then(|_| window.set_focus())
                {
                    eprintln!("Das vorhandene Pet-Fenster konnte nicht aktiviert werden: {error}");
                }
            }
        }))
        .manage(PetState::default())
        .invoke_handler(tauri::generate_handler![get_pet, interact, customize_pet, equip_cosmetic])
        .run(tauri::generate_context!())
        .expect("LAN Desk Pet konnte nicht gestartet werden");
}
