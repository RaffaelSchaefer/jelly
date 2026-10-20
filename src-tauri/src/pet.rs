use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{ErrorKind, Write},
    path::PathBuf,
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Color {
    Mint,
    Lilac,
    Peach,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Activity,
    Food,
    Drink,
    Event,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pet {
    pub schema_version: u8,
    pub name: String,
    pub xp: u32,
    pub color: Color,
    pub reduced_motion: bool,
    /// Pet size in percent. Older save files without it load at the default size.
    #[serde(default = "default_size")]
    pub size: u8,
}

pub const MIN_SIZE: u8 = 70;
pub const MAX_SIZE: u8 = 150;
pub const DEFAULT_SIZE: u8 = 100;

fn default_size() -> u8 {
    DEFAULT_SIZE
}

impl Default for Pet {
    fn default() -> Self {
        Self {
            schema_version: 1,
            name: "Pixel".into(),
            xp: 0,
            color: Color::Mint,
            reduced_motion: false,
            size: DEFAULT_SIZE,
        }
    }
}

impl Pet {
    pub fn level(&self) -> u32 {
        self.xp / 100 + 1
    }

    fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("Dieser Spielstand stammt aus einer anderen App-Version. Die Datei bleibt unverändert.".into());
        }
        if self.name.trim().is_empty()
            || self.name.chars().count() > 24
            || self.name.chars().any(char::is_control)
        {
            return Err("Der Name muss 1–24 Zeichen enthalten, ohne Steuerzeichen.".into());
        }
        if !(MIN_SIZE..=MAX_SIZE).contains(&self.size) {
            return Err(format!("Die Größe muss zwischen {MIN_SIZE} und {MAX_SIZE} % liegen."));
        }
        Ok(())
    }

    fn apply(&mut self, action: Action) {
        let xp = match action {
            Action::Activity => 1,
            Action::Food => 15,
            Action::Drink => 10,
            Action::Event => 30,
        };
        self.xp = self.xp.saturating_add(xp);
    }

    fn customize(
        &mut self,
        name: String,
        color: Color,
        reduced_motion: bool,
        size: u8,
    ) -> Result<(), String> {
        let next = Self {
            name: name.trim().into(),
            color,
            reduced_motion,
            size,
            ..self.clone()
        };
        next.validate()?;
        *self = next;
        Ok(())
    }
}

pub struct Store {
    pub pet: Pet,
    path: PathBuf,
    last_activity: Option<Instant>,
}

impl Store {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        let pet: Pet = match fs::read(&path) {
            Ok(contents) => serde_json::from_slice(&contents).map_err(|error| {
                format!("Spielstand konnte nicht gelesen werden: {error}. Die Datei bleibt unverändert.")
            })?,
            Err(error) if error.kind() == ErrorKind::NotFound => Pet::default(),
            Err(error) => return Err(format!("Spielstand konnte nicht geöffnet werden: {error}")),
        };
        pet.validate()?;
        Ok(Self {
            pet,
            path,
            last_activity: None,
        })
    }

    pub fn interact_at(&mut self, action: Action, now: Instant) -> Result<Pet, String> {
        if action == Action::Activity
            && self
                .last_activity
                .is_some_and(|last| now.saturating_duration_since(last) < Duration::from_secs(1))
        {
            return Ok(self.pet.clone());
        }
        let mut next = self.pet.clone();
        next.apply(action);
        self.save(&next)?;
        self.pet = next;
        if action == Action::Activity {
            self.last_activity = Some(now);
        }
        Ok(self.pet.clone())
    }

    pub fn customize(
        &mut self,
        name: String,
        color: Color,
        reduced_motion: bool,
        size: u8,
    ) -> Result<Pet, String> {
        let mut next = self.pet.clone();
        next.customize(name, color, reduced_motion, size)?;
        self.save(&next)?;
        self.pet = next;
        Ok(self.pet.clone())
    }

    fn save(&self, pet: &Pet) -> Result<(), String> {
        let write = || -> Result<(), Box<dyn std::error::Error>> {
            if let Some(parent) = self.path.parent() {
                fs::create_dir_all(parent)?;
            }
            let temporary = self.path.with_extension("tmp");
            let bytes = serde_json::to_vec_pretty(pet)?;
            {
                let mut file = fs::File::create(&temporary)?;
                file.write_all(&bytes)?;
                file.sync_all()?;
            }
            // Replace only after a complete write; a failed save keeps the previous state.
            fs::rename(&temporary, &self.path)?;
            Ok(())
        };
        write().map_err(|error| {
            format!("Speichern fehlgeschlagen: {error}. Die Änderung wurde nicht übernommen.")
        })
    }
}

#[cfg(test)]
mod tests;
