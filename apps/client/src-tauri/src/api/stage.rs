//! Typen der Bühne aus dem Server-Vertrag: Raumkarte, Jellies, ihre Wege und Stapel.

use serde::{Deserialize, Serialize};

use super::{Equipped, Follow};

/// Ein Bereich der Raumkarte aus `GET /v1/stage`, in Prozent der Bühne. `x`, `y`, `width` und
/// `height` sagen, wo er ohne Drehung stünde.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageArea {
    /// Bereichs-ID.
    pub id: i64,
    /// Linke Kante.
    pub x: f64,
    /// Hintere Kante.
    pub y: f64,
    /// Breite.
    pub width: f64,
    /// Tiefe.
    pub height: f64,
    /// Grad im Uhrzeigersinn von oben gesehen, um die Mitte des Bereichs.
    #[serde(default)]
    pub rotation: f64,
    /// Wie Jellies den Bereich nutzen, zum Beispiel `seats`. Ein neuerer Server darf Arten ergänzen.
    pub kind: String,
    /// Ob Jellies außen herum laufen.
    #[serde(default)]
    pub blocks: bool,
    /// Das Modell, das dort steht, leer für blanken Boden.
    #[serde(default)]
    pub prop: String,
    /// Nur ein Bereich der Art `public` hat einen Namen.
    #[serde(default)]
    pub name: Option<String>,
}

/// Was alle Jellies gerade tun: Essens-Event oder Siegerehrung.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gathering {
    /// `food` oder `ceremony`. Neue Werte zeigt die Bühne nicht besonders.
    pub kind: String,
    /// Der Sieger einer Siegerehrung.
    pub winner_id: Option<i64>,
    /// Wann es endet und die Jellies zurücklaufen.
    pub ends_at: i64,
}

/// Ein Jelly aus `GET /v1/stage`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StagePlayer {
    /// Spieler-ID, auch Ziel von `POST /v1/trips/follow`.
    pub id: i64,
    /// Anzeigename.
    pub name: String,
    /// Farbe als Schlüssel aus dem Katalog.
    pub color: String,
    /// Was das Jelly trägt, je Platz.
    pub equipped: Equipped,
    /// Level in dieser LAN.
    pub level: i64,
    /// Hochgehaltenes Schild.
    pub sign: Option<String>,
    /// Wem das Jelly gerade nachläuft.
    #[serde(default)]
    pub follow: Option<Follow>,
    /// Bereich des Jellys, `None` ohne eigenen Bereich und ohne Zone für Besucher.
    pub area_id: Option<i64>,
    /// Ein Jelly ohne eigenen Bereich wandert als Besucher.
    #[serde(default)]
    pub is_visitor: bool,
    /// Heimplatz von links, in Prozent der Bühne.
    pub home_x: f64,
    /// Heimplatz von hinten, in Prozent der Bühne.
    pub home_y: f64,
}

/// Größe der Bühne in der Einheit aller Positionen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    /// Breite.
    pub width: f64,
    /// Tiefe.
    pub height: f64,
    /// Einheit, zum Beispiel `percent`.
    pub unit: String,
}

/// Ein Punkt eines Wegs, in Prozent der Bühne.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Waypoint {
    /// Von links.
    pub x: f64,
    /// Von hinten.
    pub y: f64,
    /// Millisekunden ab dem Start des Wegs.
    pub t: i64,
}

/// Ein Weg eines Jellys, aus `GET /v1/stage` und als Nachricht `move` im Stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Move {
    /// Wer läuft.
    pub player_id: i64,
    /// Warum, zum Beispiel `wander` oder `snack`. Neue Werte sind wie `wander` zu behandeln.
    pub kind: String,
    /// Start als Server-Zeit.
    pub start_at: i64,
    /// Der Weg. Ein einzelner Punkt heißt: Das Jelly steht.
    pub points: Vec<Waypoint>,
    /// Wie viele Jellies am Ende des Wegs darunter stehen. Nicht das XP-Level.
    #[serde(default)]
    pub stack_level: i64,
}

/// Ein laufender Stapel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stack {
    /// Stapel-ID.
    pub id: i64,
    /// Ort von links, in Prozent der Bühne.
    pub x: f64,
    /// Ort von hinten, in Prozent der Bühne.
    pub y: f64,
    /// Wann er auseinanderfällt, als Server-Zeit.
    pub ends_at: i64,
    /// Die Jellies von unten nach oben.
    pub member_ids: Vec<i64>,
}

/// Antwort von `GET /v1/stage`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stage {
    /// Neuestes Ereignis beim Lesen.
    pub last_event_id: i64,
    /// Uhrzeit des Servers.
    pub server_time: i64,
    /// Größe der Bühne.
    pub room: Room,
    /// Die Raumkarte.
    pub areas: Vec<StageArea>,
    /// Anwesende und nicht ausgeblendete Jellies, das eigene eingeschlossen.
    pub players: Vec<StagePlayer>,
    /// Der aktuelle Weg je Jelly.
    pub moves: Vec<Move>,
    /// Laufende Stapel.
    pub stacks: Vec<Stack>,
    /// Essens-Event oder Siegerehrung, sonst `None`.
    #[serde(default)]
    pub gathering: Option<Gathering>,
}
