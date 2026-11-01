//! Desktop-Einstieg. Bleibt bewusst leer: Die App steckt in [`jelly_lib::run`].

// Release-Builds unter Windows ohne zusätzliches Konsolenfenster starten.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    jelly_lib::run();
}
