//! Leitet Ereignisse aus `GET /v1/events/stream` an die Oberfläche weiter.
//!
//! Der Stream ist für alle Spieler gleich. Hier gehen nur Ereignisse zum eigenen Jelly durch, als
//! Tauri-Ereignis [`EVENT_NAME`]. Die Oberfläche lädt danach den Stand neu, denn Ereignisse tragen
//! keine Namen und keinen vollständigen Stand. Nach `player.removed` lehnt der Server das Token dabei
//! ab, und die Oberfläche bietet ein neues Konto an.

use futures_util::StreamExt;
use reqwest::StatusCode;
use reqwest_eventsource::{Error as StreamError, Event, EventSource};
use serde_json::Value;
use tauri::{async_runtime::JoinHandle, AppHandle, Emitter};

use crate::api::{Api, Me, ServerEvent};

/// Name des Tauri-Ereignisses, auf das `src/backend.ts` hört.
pub const EVENT_NAME: &str = "server-event";

/// Ereignisarten zum eigenen Jelly, die die Oberfläche bekommt.
/// Emotes starten lokal aus der Befehlsantwort, damit der Stream sie nicht doppelt abspielt.
/// `sign.changed` bleibt draußen: Nur die eigene App ändert das Schild, ihre Antwort trägt den Stand.
/// `follow.changed` kommt durch: Der Server darf das Dazustellen von sich aus beenden.
/// ponytail: partner.emote und stage.changed kommen mit ihrer UI.
const OWN_EVENTS: [&str; 7] = [
    "xp.gained",
    "level.up",
    "achievement.earned",
    "award.given",
    "player.updated",
    "player.hidden",
    "follow.changed",
];

/// Ereignis, wenn ein Konto gelöscht wurde. Es trägt den Spieler in `payload`, nicht in `player_id`.
const PLAYER_REMOVED: &str = "player.removed";

/// Ob `event` das Jelly von `player_id` betrifft und an die Oberfläche soll.
fn is_own_event(event: &ServerEvent, player_id: i64) -> bool {
    if event.kind == PLAYER_REMOVED {
        return event.payload.get("player_id").and_then(Value::as_i64) == Some(player_id);
    }
    event.player_id == Some(player_id) && OWN_EVENTS.contains(&event.kind.as_str())
}

/// Die laufende Weiterleitung, höchstens eine je App.
#[derive(Default)]
pub struct EventStream {
    /// Task, der den Stream liest.
    task: Option<JoinHandle<()>>,
}

impl EventStream {
    /// Startet die Weiterleitung für `me`, falls sie nicht schon läuft.
    ///
    /// Beginnt bei `me.last_event_id`, damit zwischen `GET /me` und dem Stream nichts verloren
    /// geht. Nach einem Abbruch verbindet `EventSource` selbst neu, mit Pause und `Last-Event-ID`.
    pub fn ensure(&mut self, app: &AppHandle, api: &Api, me: &Me) {
        if self
            .task
            .as_ref()
            .is_some_and(|task| !task.inner().is_finished())
        {
            return;
        }
        let source = match api.stream(me.last_event_id) {
            Ok(source) => source,
            Err(error) => {
                eprintln!("Ereignis-Stream konnte nicht starten: {error}");
                return;
            }
        };
        let task = tauri::async_runtime::spawn(forward(app.clone(), source, me.id));
        self.task = Some(task);
    }

    /// Beendet die Weiterleitung, etwa vor einem Wechsel des Tokens.
    pub fn stop(&mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

/// Liest den Stream, bis der Server das Token ablehnt, und meldet eigene Ereignisse weiter.
async fn forward(app: AppHandle, mut source: EventSource, player_id: i64) {
    while let Some(item) = source.next().await {
        match item {
            Ok(Event::Open) => {}
            Ok(Event::Message(message)) => {
                let Ok(event) = serde_json::from_str::<ServerEvent>(&message.data) else {
                    continue;
                };
                if is_own_event(&event, player_id) {
                    if let Err(error) = app.emit(EVENT_NAME, &event) {
                        eprintln!("Ereignis konnte nicht weitergegeben werden: {error}");
                    }
                }
            }
            // Nach `401` hilft kein neuer Versuch. Die nächste Aktion zeigt den Fehler an.
            Err(StreamError::InvalidStatusCode(StatusCode::UNAUTHORIZED, _)) => source.close(),
            // Alles andere: `EventSource` versucht es mit Pause selbst erneut.
            Err(_) => {}
        }
    }
}

#[cfg(test)]
mod tests;
