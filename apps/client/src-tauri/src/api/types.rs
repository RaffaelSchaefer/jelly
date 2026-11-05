//! Typen aus dem Server-Vertrag, unverändert in snake_case und offen für neue Felder.

use std::collections::BTreeMap;

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

/// Die Regeln der LAN, soweit die App sie anzeigt (`PublicRules`). Entscheiden tut der Server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rules {
    /// Bis zu diesem Abstand in Jelly-Einheiten stehen zwei Jellies nebeneinander.
    pub near_distance: f64,
    /// XP je Level, linear.
    pub xp_per_level: i64,
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
    /// Regeln der laufenden LAN, sonst der nächsten, sonst die Standardwerte. Nach `rules.changed`
    /// neu lesen.
    pub rules: Rules,
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

/// Was ein Jelly auf einem Platz trägt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EquippedCosmetic {
    /// Schlüssel aus dem Katalog.
    pub key: String,
    /// Farbe als Hex-Wert, bei einfärbbaren Cosmetics.
    #[serde(default)]
    pub color: Option<String>,
}

/// Was ein Jelly trägt, je Platz (`head`, `hands`, `body`, `face`, `aura`).
pub type Equipped = BTreeMap<String, EquippedCosmetic>;

/// Ein Ausflug zu einem Punkt und zurück.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Trip {
    /// Ziel von links, in Prozent der Bühne.
    pub x: f64,
    /// Ziel von hinten, in Prozent der Bühne.
    pub y: f64,
    /// Wann das Jelly zurückläuft, als Server-Zeit.
    pub ends_at: i64,
}

/// Wem ein Jelly nachläuft und wann das von selbst endet.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Follow {
    /// Das Jelly, dem es nachläuft.
    pub player_id: i64,
    /// Wann das Folgen von selbst endet, als Server-Zeit. `follow.changed` meldet auch das.
    pub ends_at: i64,
}

/// Stand eines Spielers (`PlayerState`), wie `GET /v1/players/me` und die meisten Aktionen ihn
/// liefern.
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
    /// Was das Jelly trägt, je Platz.
    pub equipped: Equipped,
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
    /// Wem das Jelly gerade nachläuft.
    #[serde(default)]
    pub follow: Option<Follow>,
    /// Laufender Ausflug.
    #[serde(default)]
    pub trip: Option<Trip>,
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

/// Antwort von `POST /v1/pokes` und `POST /v1/reports`.
#[derive(Debug, Clone, Deserialize)]
pub struct ActionAnswer {
    /// Gewonnene XP, bei einem zu frühen Stupser 0.
    pub xp_gained: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Antwort von `POST /v1/event-codes/redemptions`.
#[derive(Debug, Clone, Deserialize)]
pub struct Redeemed {
    /// Titel des Events.
    pub title: String,
    /// Gewonnene XP.
    pub xp_gained: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Eine Aufforderung zu einem Partner-Emote. Dieselbe Form trägt `partner_emote.updated`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartnerInvite {
    /// ID, mit der man antwortet.
    pub id: i64,
    /// Gewähltes Partner-Emote.
    pub key: String,
    /// Wer auffordert.
    pub from_id: i64,
    /// Wer aufgefordert wird.
    pub partner_id: i64,
    /// `pending`, `accepted`, `declined` oder `cancelled`.
    pub state: String,
    /// Ablauf als Server-Zeit. Dazu kommt kein Ereignis.
    pub expires_at: i64,
}

/// Antwort von `POST` und `PATCH /v1/partner-emotes`.
#[derive(Debug, Clone, Deserialize)]
pub struct PartnerInviteResult {
    /// Die Aufforderung nach der Änderung.
    pub partner_emote: PartnerInvite,
    /// Gewonnene XP, 0 ab dem zweiten Mal mit demselben Partner.
    pub xp_gained: i64,
    /// Neuer Stand.
    pub me: Me,
}

/// Ein Ereignis aus `GET /v1/stage/events`.
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

/// Antwort von `POST /v1/auth/redeem`.
#[derive(Debug, Clone, Deserialize)]
pub struct Access {
    /// Secret des Kontos: neu für ein neues Konto, sonst das mitgeschickte.
    pub secret: String,
    /// Ob das Konto den Sitz des Codes bekommen hat. `false` beim LAN-Code, bei einem belegten Sitz
    /// oder wenn das Konto schon einen hat: Dann weist die Orga den Platz von Hand zu.
    pub seat_assigned: bool,
    /// Stand des Kontos.
    pub me: Me,
}

/// Antwort von `POST /v1/auth/recover`.
#[derive(Debug, Clone, Deserialize)]
pub struct Recovered {
    /// Neues Secret des Kontos, das alte gilt ab jetzt nicht mehr.
    pub secret: String,
    /// Stand des Kontos.
    pub me: Me,
}

/// Körper von `POST /v1/auth/redeem`. Name und Farbe zählen nur, wenn der Code ein Konto anlegt.
#[derive(Debug, Clone, Serialize)]
pub struct AccessBody<'a> {
    /// Sitzplatz-Code oder gemeinsamer Code der LAN.
    pub code: &'a str,
    /// Name eines neuen Kontos.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<&'a str>,
    /// Farbe eines neuen Kontos.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Color>,
}

/// Körper von `PATCH /v1/players/me`. Fehlende Felder bleiben unverändert.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Profile {
    /// Neuer Name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Neue Farbe.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<Color>,
}

/// Körper von `PUT /v1/cosmetics/equipped`. Ohne `key` wird der Platz leer.
#[derive(Debug, Clone, Serialize)]
pub struct EquipBody {
    /// Der Platz, zum Beispiel `head`.
    pub slot: String,
    /// Das Cosmetic aus dem Katalog.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    /// Farbe aus `cosmetic_colors`, nur bei einfärbbaren Cosmetics.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}
