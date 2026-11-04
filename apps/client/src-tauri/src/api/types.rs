//! Typen aus dem Server-Vertrag, unverändert in snake_case und offen für neue Felder.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::pet::Color;

/// Die LAN, an der ein Konto zuletzt teilgenommen hat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanInfo {
    /// Kurzname, zum Beispiel `ucb-2026`.
    pub slug: String,
    /// Anzeigename.
    pub name: String,
    /// Ob sie gerade läuft.
    pub active: bool,
}

/// Zeitraum einer LAN, Zeiten in Unix-Millisekunden.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanPeriod {
    /// Kurzname.
    pub slug: String,
    /// Anzeigename.
    pub name: String,
    /// Beginn.
    pub starts_at: i64,
    /// Ende.
    pub ends_at: i64,
}

/// Antwort von `GET /v1/lans/current`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanStatus {
    /// Uhrzeit des Servers in Unix-Millisekunden.
    pub server_time: i64,
    /// Die laufende LAN.
    pub current: Option<LanPeriod>,
    /// Die nächste LAN.
    pub next: Option<LanPeriod>,
    /// Ob dieses Konto an der laufenden LAN teilnimmt. `None` ohne Token oder ohne LAN.
    pub joined: Option<bool>,
}

/// Abklingzeiten und Kontingent der Selbstmeldungen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reports {
    /// Ab wann Essen wieder zählt, 0 heißt sofort.
    pub food_ready_at: i64,
    /// Ab wann ein Getränk wieder zählt, 0 heißt sofort.
    pub drink_ready_at: i64,
    /// Wie viele Meldungen im laufenden Fenster noch frei sind.
    pub reports_left: i64,
}

/// Ein verdienter Erfolg.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarnedAchievement {
    /// Stabiler Schlüssel, passend zum Katalog.
    pub key: String,
    /// Titel auf Deutsch.
    pub title: String,
    /// Bei LAN-Erfolgen die LAN, sonst `None`.
    pub lan_slug: Option<String>,
    /// Wann er verdient wurde.
    pub earned_at: i64,
    /// Bei Rekord-Erfolgen der beste Wert.
    #[serde(default)]
    pub best: Option<i64>,
    /// Einheit zu [`EarnedAchievement::best`].
    #[serde(default)]
    pub record_unit: Option<String>,
}

/// Abzeichen für eine besuchte LAN.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Badge {
    /// Kurzname der LAN.
    pub slug: String,
    /// Anzeigename der LAN.
    pub name: String,
}

/// Auszeichnung von der Orga.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Award {
    /// Freitext der Orga.
    pub title: String,
    /// Cosmetic, das dazu freigeschaltet wurde.
    pub cosmetic_key: Option<String>,
    /// Wann sie vergeben wurde.
    pub given_at: i64,
}

/// Stand eines Spielers (`PlayerState`), wie `GET /v1/me` und die meisten Aktionen ihn liefern.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Me {
    /// Uhrzeit des Servers. Countdowns rechnen damit statt mit der Uhr des Geräts.
    pub server_time: i64,
    /// Ab hier öffnet die App den Ereignis-Stream.
    pub last_event_id: i64,
    /// Spieler-ID, auch `player_id` in Ereignissen.
    pub id: i64,
    /// Anzeigename.
    pub name: String,
    /// Farbe als Schlüssel aus dem Katalog.
    pub color: String,
    /// Angelegtes Cosmetic.
    pub cosmetic: Option<String>,
    /// Von der Orga ausgeblendet.
    pub hidden: bool,
    /// Jüngste LAN des Kontos.
    pub lan: Option<LanInfo>,
    /// XP in dieser LAN.
    pub xp: i64,
    /// Level in dieser LAN.
    pub level: i64,
    /// XP über alle LANs.
    pub total_xp: i64,
    /// Ab wann ein Stupser wieder XP gibt. `None` außerhalb einer laufenden LAN.
    pub next_poke_at: Option<i64>,
    /// Stand der Selbstmeldungen. `None` außerhalb einer laufenden LAN.
    pub reports: Option<Reports>,
    /// Hochgehaltenes Schild.
    pub sign: Option<String>,
    /// Bei wem das Jelly gerade steht.
    pub follow_player_id: Option<i64>,
    /// Anzahl besuchter LANs.
    pub lans_attended: i64,
    /// Ein Abzeichen je besuchter LAN.
    pub badges: Vec<Badge>,
    /// Cosmetics, die der Spieler tragen darf.
    pub cosmetics: Vec<String>,
    /// Verdiente Erfolge.
    pub achievements: Vec<EarnedAchievement>,
    /// Auszeichnungen der Orga.
    pub awards: Vec<Award>,
}

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
    /// Spieler-ID, auch Ziel von `PUT /v1/follow`.
    pub id: i64,
    /// Anzeigename.
    pub name: String,
    /// Farbe als Schlüssel aus dem Katalog.
    pub color: String,
    /// Angelegtes Cosmetic.
    pub cosmetic: Option<String>,
    /// Level in dieser LAN.
    pub level: i64,
    /// Hochgehaltenes Schild.
    pub sign: Option<String>,
    /// Bei wem das Jelly gerade steht.
    pub follow_player_id: Option<i64>,
    /// Letztes Lebenszeichen.
    pub last_seen_at: i64,
    /// Bereich des Jellys, `None` ohne Bereich und ohne Lounge.
    pub area_id: Option<i64>,
    /// Heimplatz von links, in Prozent der Bühne.
    pub home_x: f64,
    /// Heimplatz von hinten, in Prozent der Bühne.
    pub home_y: f64,
}

/// Antwort von `GET /v1/stage`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stage {
    /// Neuestes Ereignis beim Lesen.
    pub last_event_id: i64,
    /// Uhrzeit des Servers.
    pub server_time: i64,
    /// Die Raumkarte.
    pub areas: Vec<StageArea>,
    /// Anwesende und nicht ausgeblendete Jellies, das eigene eingeschlossen.
    pub players: Vec<StagePlayer>,
}

/// Antwort von `POST /v1/actions`.
#[derive(Debug, Clone, Deserialize)]
pub struct ActionAnswer {
    /// Gewonnene XP, bei einem zu frühen Stupser 0.
    pub xp_gained: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Antwort von `POST /v1/event-codes/redeem`.
#[derive(Debug, Clone, Deserialize)]
pub struct Redeemed {
    /// Titel des Events.
    pub title: String,
    /// Gewonnene XP.
    pub xp_gained: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Antwort von `POST /v1/partner-emote`: der Code, den man dem Partner nennt.
#[derive(Debug, Clone, Deserialize)]
pub struct PartnerOffer {
    /// Vier Ziffern, gilt bis `expires_at`.
    pub code: String,
    /// Gewähltes Partner-Emote.
    pub key: String,
    /// Ablauf des Codes als Server-Zeit.
    pub expires_at: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Antwort von `POST /v1/partner-emote/join`.
#[derive(Debug, Clone, Deserialize)]
pub struct PartnerResult {
    /// Partner-Emote, das der Partner gewählt hat.
    pub key: String,
    /// Wer den Code erzeugt hat.
    pub partner_id: i64,
    /// Gewonnene XP, 0 ab dem zweiten Mal mit demselben Partner.
    pub xp_gained: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Ein Ereignis aus `GET /v1/events/stream`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerEvent {
    /// Fortlaufende ID, auch `Last-Event-ID` beim Wiederverbinden.
    pub id: i64,
    /// Art, zum Beispiel `xp.gained`.
    #[serde(rename = "type")]
    pub kind: String,
    /// Betroffener Spieler, bei Bühnen-Ereignissen `None`.
    pub player_id: Option<i64>,
    /// Inhalt je nach Art.
    pub payload: Value,
    /// Zeitpunkt in Unix-Millisekunden.
    pub created_at: i64,
}

/// Antwort von `GET /version`.
#[derive(Debug, Clone, Deserialize)]
pub struct Version {
    /// Version des Vertrags.
    pub api_version: String,
    /// Älteste App, die noch passt. Leer heißt keine Vorgabe.
    pub min_client_version: String,
}

/// Antwort von `POST /v1/register`.
#[derive(Debug, Clone, Deserialize)]
pub struct Registered {
    /// Token, das es nur dieses eine Mal gibt.
    pub token: String,
    /// Stand des neuen Kontos.
    pub me: Me,
}

/// Körper von `PATCH /v1/me`. Fehlende Felder bleiben unverändert, `cosmetic: ""` legt ab.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Profile {
    /// Neuer Name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Neue Farbe.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Color>,
    /// Neues Cosmetic, leer zum Ablegen.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cosmetic: Option<String>,
}
