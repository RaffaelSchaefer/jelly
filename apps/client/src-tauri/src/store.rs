//! Laden und Speichern des lokalen Stands als `jelly.json`.
//!
//! Der [`Store`] hält den zuletzt gespeicherten [`Local`] im Speicher. Jede Änderung entsteht an
//! einer Kopie, wird geprüft und gespeichert, und erst dann übernommen ([`Store::commit`]).
//! Scheitert das Speichern, bleibt der alte Stand sowohl im Speicher als auch auf der Platte.

use std::{
    fs,
    io::{self, ErrorKind, Write},
    path::PathBuf,
};

use crate::{
    error::{Error, Result},
    pet::{Local, Settings},
};

/// Der lokale Stand im Speicher plus der Ort, an dem er gespeichert wird.
pub struct Store {
    /// Der zuletzt erfolgreich gespeicherte Stand.
    pub local: Local,
    /// Pfad zu `jelly.json`.
    path: PathBuf,
}

impl Store {
    /// Öffnet den Stand unter `path`. Fehlt die Datei, beginnt ein leerer Stand ohne Token.
    ///
    /// # Fehler
    ///
    /// [`Error::Open`], wenn die Datei nicht lesbar ist, [`Error::Corrupt`], wenn sie kein
    /// gültiges JSON ist, oder ein Fehler aus [`Local::validate`]. In allen Fällen bleibt die Datei
    /// unangetastet, damit das Token nicht still verloren geht.
    pub fn open(path: PathBuf) -> Result<Self> {
        let local = match fs::read(&path) {
            Ok(contents) => serde_json::from_slice::<Local>(&contents).map_err(Error::Corrupt)?,
            Err(error) if error.kind() == ErrorKind::NotFound => Local::new(),
            Err(error) => return Err(Error::Open(error)),
        };
        local.validate()?;
        Ok(Self { local, path })
    }

    /// Merkt sich ein neues Token, etwa nach der Registrierung.
    ///
    /// # Fehler
    ///
    /// [`Error::Save`], wenn das Speichern scheitert.
    pub fn set_token(&mut self, token: String) -> Result<()> {
        self.commit(Local {
            token: Some(token),
            ..self.local.clone()
        })
    }

    /// Übernimmt die Geräte-Einstellungen.
    ///
    /// # Fehler
    ///
    /// [`Error::InvalidSize`], [`Error::InvalidVolume`], dazu [`Error::Save`].
    pub fn set_settings(&mut self, settings: Settings) -> Result<()> {
        self.commit(Local {
            settings,
            ..self.local.clone()
        })
    }

    /// Prüft und speichert `next` und übernimmt ihn erst danach.
    fn commit(&mut self, next: Local) -> Result<()> {
        next.validate()?;
        self.write(&next).map_err(Error::Save)?;
        self.local = next;
        Ok(())
    }

    /// Schreibt atomar: erst in `jelly.tmp`, auf die Platte synchronisieren, dann umbenennen.
    /// Ein Absturz mittendrin hinterlässt also nie eine halbe `jelly.json`.
    fn write(&self, local: &Local) -> io::Result<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)?;
        }
        let temporary = self.path.with_extension("tmp");
        let bytes = serde_json::to_vec_pretty(local)?;
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
