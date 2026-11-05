//! Die Befehle zu Partner-Emotes: ein Jelly auffordern und auf eine Aufforderung antworten.

use serde::Serialize;
use tauri::{AppHandle, State};

use super::{
    session::{session, Session},
    Game, GameState,
};
use crate::{
    api::{PartnerInvite, PartnerInviteResult},
    error::Result,
    pet::InviteState,
};

/// Ergebnis von [`invite_partner`] und [`answer_partner`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartnerOutcome {
    /// Die Aufforderung nach der Änderung.
    invite: PartnerInvite,
    /// Gewonnene XP, 0 ab dem zweiten Mal mit demselben Partner.
    xp_gained: i64,
    /// Neuer Stand.
    game: Game,
}

/// Übernimmt die Antwort des Servers in die Sitzung.
fn outcome_of(session: &mut Session, result: PartnerInviteResult) -> PartnerOutcome {
    session.set_me(result.me);
    PartnerOutcome {
        invite: result.partner_emote,
        xp_gained: result.xp_gained,
        game: session.game(),
    }
}

/// Fordert ein Jelly in der Nähe zu einem Partner-Emote auf.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `too_far` oder `partner_emote_open`.
#[tauri::command]
pub async fn invite_partner(
    app: AppHandle,
    state: State<'_, GameState>,
    key: String,
    partner_id: i64,
) -> Result<PartnerOutcome> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let result = session.api.invite_partner(&key, partner_id).await?;
    Ok(outcome_of(session, result))
}

/// Nimmt eine Aufforderung an, lehnt sie ab oder zieht die eigene zurück.
///
/// # Fehler
///
/// Sitzungs-, Netzwerk- oder Serverfehler, etwa `too_far` oder `partner_emote_closed`.
#[tauri::command]
pub async fn answer_partner(
    app: AppHandle,
    state: State<'_, GameState>,
    id: i64,
    answer: InviteState,
) -> Result<PartnerOutcome> {
    let mut slot = state.0.lock().await;
    let session = session(&app, &mut slot).await?;
    session.registered()?;
    let result = session.api.answer_partner(id, answer).await?;
    Ok(outcome_of(session, result))
}
