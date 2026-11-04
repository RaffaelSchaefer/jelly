//! Laden und Speichern des Spielstands als `pet.json`.
//!
//! Der [`Store`] hält den zuletzt gespeicherten [`Pet`] im Speicher. Jede Änderung entsteht an
//! einer Kopie, wird geprüft und gespeichert, und erst dann übernommen ([`Store::commit`]).
//! Scheitert das Speichern, bleibt der alte Stand sowohl im Speicher als auch auf der Platte.

use std::{
    fs,
    io::{self, ErrorKind, Write},
    path::PathBuf,
    time::{Duration, Instant},
};

use crate::{
    error::{Error, Result},
    pet::{is_label, Action, Appearance, Pet, MAX_EVENT_ID_LEN},
};

/// Mindestabstand zwischen zwei Stupsern, die XP geben.
const POKE_INTERVAL: Duration = Duration::from_secs(1);

/// Der Spielstand im Speicher plus der Ort, an dem er gespeichert wird.
pub struct Store {
    /// Der zuletzt erfolgreich gespeicherte Stand.
    pub pet: Pet,
    /// Pfad zu `pet.json`.
    path: PathBuf,
    /// Wann der letzte Stupser XP gab. Nur im Speicher, nach einem Neustart zählt der erste sofort.
    last_poke: Option<Instant>,
}

impl Store {
    /// Öffnet den Spielstand unter `path`. Fehlt die Datei, startet ein neues Pet.
    ///
    /// # Fehler
    ///
    /// [`Error::Open`], wenn die Datei nicht lesbar ist, [`Error::Corrupt`], wenn sie kein
    /// gültiges JSON ist, oder ein Fehler aus [`Pet::validate`]. In allen Fällen bleibt die Datei
    /// unangetastet, damit kein Fortschritt still verloren geht.
    pub fn open(path: PathBuf) -> Result<Self> {
        let pet = match fs::read(&path) {
            Ok(contents) => serde_json::from_slice::<Pet>(&contents).map_err(Error::Corrupt)?,
            Err(error) if error.kind() == ErrorKind::NotFound => Pet::default(),
            Err(error) => return Err(Error::Open(error)),
        };
        pet.validate()?;
        Ok(Self {
            pet,
            path,
            last_poke: None,
        })
    }

    /// Wendet eine Aktion an und gibt den neuen Stand zurück.
    ///
    /// `now` taktet die Stupser (monotone Uhr), `unix` (Sekunden) stempelt den Verlauf und taktet
    /// die Selbstmeldungen. Ein Stupser innerhalb von [`POKE_INTERVAL`] ist kein Fehler, er gibt
    /// nur keine XP.
    ///
    /// # Fehler
    ///
    /// [`Error::EventNeedsId`] für [`Action::Event`], [`Error::Cooldown`] oder
    /// [`Error::DailyLimit`] für Selbstmeldungen, [`Error::Save`], wenn das Speichern scheitert.
    pub fn interact_at(&mut self, action: Action, now: Instant, unix: u64) -> Result<Pet> {
        match action {
            Action::Event => Err(Error::EventNeedsId),
            Action::Activity => self.poke(now),
            Action::Food | Action::Drink => self.report(action, unix),
        }
    }

    /// Ein Event, an dem das Pet teilgenommen hat. Ohne Abklingzeit und Tageslimit.
    ///
    /// Dieselbe ID zählt nur einmal. Meldet ein System erneut (Wiederholung, Neustart), gibt es
    /// keine zusätzlichen XP, und der unveränderte Stand kommt zurück.
    ///
    /// # Fehler
    ///
    /// [`Error::InvalidEventId`] für leere, zu lange oder steuerzeichenhaltige IDs,
    /// [`Error::Save`], wenn das Speichern scheitert.
    pub fn record_event(&mut self, id: String, unix: u64) -> Result<Pet> {
        let id = id.trim().to_owned();
        if !is_label(&id, MAX_EVENT_ID_LEN) {
            return Err(Error::InvalidEventId);
        }
        if self
            .pet
            .log
            .iter()
            .any(|entry| entry.event.as_ref() == Some(&id))
        {
            return Ok(self.pet.clone());
        }
        let mut next = self.pet.clone();
        next.record(Action::Event, unix, Some(id));
        self.commit(next)
    }

    /// Übernimmt Name, Farbe, Bewegung und Größe.
    ///
    /// # Fehler
    ///
    /// Wie [`Pet::validate`], dazu [`Error::Save`].
    pub fn customize(&mut self, appearance: Appearance) -> Result<Pet> {
        let mut next = self.pet.clone();
        next.customize(appearance)?;
        self.commit(next)
    }

    /// Legt ein Cosmetic an (`Some(id)`) oder ab (`None`).
    ///
    /// # Fehler
    ///
    /// [`Error::UnknownCosmetic`] bei ungültiger ID, [`Error::Save`], wenn das Speichern scheitert.
    pub fn equip(&mut self, cosmetic: Option<String>) -> Result<Pet> {
        let next = Pet {
            cosmetic,
            ..self.pet.clone()
        };
        next.validate()?;
        self.commit(next)
    }

    /// Stupser: +1 XP, höchstens einmal pro [`POKE_INTERVAL`], ohne Eintrag im Verlauf.
    fn poke(&mut self, now: Instant) -> Result<Pet> {
        let too_soon = self
            .last_poke
            .is_some_and(|last| now.saturating_duration_since(last) < POKE_INTERVAL);
        if too_soon {
            return Ok(self.pet.clone());
        }
        let mut next = self.pet.clone();
        next.apply(Action::Activity);
        let pet = self.commit(next)?;
        self.last_poke = Some(now);
        Ok(pet)
    }

    /// Selbstmeldung (Essen, Getränk): erst Abklingzeit und Tageslimit prüfen, dann loggen.
    fn report(&mut self, action: Action, unix: u64) -> Result<Pet> {
        self.pet.check_report(action, unix)?;
        let mut next = self.pet.clone();
        next.record(action, unix, None);
        self.commit(next)
    }

    /// Speichert `next` und übernimmt ihn erst danach. Gibt eine Kopie für die Oberfläche zurück.
    fn commit(&mut self, next: Pet) -> Result<Pet> {
        self.write(&next).map_err(Error::Save)?;
        self.pet = next;
        Ok(self.pet.clone())
    }

    /// Schreibt atomar: erst in `pet.tmp`, auf die Platte synchronisieren, dann umbenennen.
    /// Ein Absturz mittendrin hinterlässt also nie eine halbe `pet.json`.
    fn write(&self, pet: &Pet) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let temporary = self.path.with_extension("tmp");
        let bytes = serde_json::to_vec_pretty(pet)?;
        {
            // Eigener Block, damit die Datei vor dem Umbenennen geschlossen ist (nötig unter Windows).
            let mut file = fs::File::create(&temporary)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        }
        fs::rename(&temporary, &self.path)
    }
}

#[cfg(test)]
mod tests;
