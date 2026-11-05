//! Typen der Bühne aus dem Server-Vertrag: Raumkarte, Jellies, ihre Wege und Stapel.

use serde::{Deserialize, Serialize};

use super::{Equipped, Trip};

/// Ein Bereich der Raumkarte aus `GET /v1/stage`, in Prozent der Bühne.
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
    /// Was der Bereich ist, zum Beispiel `seats`. Ein neuerer Server darf Arten ergänzen.
    pub kind: String,
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
    pub follow_player_id: Option<i64>,
    /// Wann das Folgen von selbst endet, als Server-Zeit.
    #[serde(default)]
    pub follow_until: Option<i64>,
    /// Letztes Lebenszeichen.
    pub last_seen_at: i64,
    /// Bereich des Jellys, `None` ohne eigenen Bereich und ohne Zone für Besucher.
    pub area_id: Option<i64>,
    /// Ein Jelly ohne eigenen Bereich wandert als Besucher.
    #[serde(default)]
    pub is_visitor: bool,
    /// Laufender Ausflug.
    #[serde(default)]
    pub trip: Option<Trip>,
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
    /// Wie viele Jellies am Ende des Wegs darunter stehen.
    #[serde(default)]
    pub level: i64,
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
}
