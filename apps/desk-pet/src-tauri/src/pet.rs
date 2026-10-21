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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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
    /// Every XP gain except pet pokes, oldest first. Feeds "today", cooldowns and achievements.
    // ponytail: grows without limit; a LAN weekend is a few hundred entries, trim if it ever matters.
    #[serde(default)]
    pub log: Vec<Entry>,
    /// The equipped cosmetic's id; the UI decides what is unlocked.
    #[serde(default)]
    pub cosmetic: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub action: Action,
    pub xp: u32,
    /// Unix time in seconds.
    pub at: u64,
    /// For events: the id the organisers' system gave it, so a repeated report counts once.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
}

/// Self-reported actions (food, drink): each kind once per cooldown, and only so many in a rolling day.
/// Events come confirmed from outside and are limited only by their id.
pub const REPORT_COOLDOWN: u64 = 30 * 60;
pub const REPORT_WINDOW: u64 = 24 * 60 * 60;
pub const REPORTS_PER_WINDOW: usize = 8;

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
            log: Vec::new(),
            cosmetic: None,
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
        if self.cosmetic.as_ref().is_some_and(|id| {
            id.is_empty()
                || id.len() > 32
                || !id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        }) {
            return Err("Unbekanntes Cosmetic.".into());
        }
        Ok(())
    }

    fn apply(&mut self, action: Action) -> u32 {
        let xp = match action {
            Action::Activity => 1,
            Action::Food => 15,
            Action::Drink => 10,
            Action::Event => 30,
        };
        self.xp = self.xp.saturating_add(xp);
        xp
    }

    /// Why a self-reported action is not allowed right now, if it is not.
    fn report_blocked(&self, action: Action, now: u64) -> Option<String> {
        let recent = |window: u64| {
            self.log
                .iter()
                .filter(move |entry| now.saturating_sub(entry.at) < window)
        };
        if let Some(last) = recent(REPORT_COOLDOWN)
            .filter(|entry| entry.action == action)
            .last()
        {
            let minutes = (REPORT_COOLDOWN - now.saturating_sub(last.at)).div_ceil(60);
            return Some(format!("Das geht wieder in {minutes} min."));
        }
        (recent(REPORT_WINDOW)
            .filter(|entry| entry.action != Action::Event)
            .count()
            >= REPORTS_PER_WINDOW)
            .then(|| "Für heute ist genug gemeldet. Morgen geht’s weiter.".into())
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

    /// `now` paces pokes; `unix` (seconds) stamps the log and paces self-reports.
    pub fn interact_at(&mut self, action: Action, now: Instant, unix: u64) -> Result<Pet, String> {
        if action == Action::Event {
            return Err("Events werden mit ihrer Event-ID gemeldet.".into());
        }
        if action == Action::Activity
            && self
                .last_activity
                .is_some_and(|last| now.saturating_duration_since(last) < Duration::from_secs(1))
        {
            return Ok(self.pet.clone());
        }
        if action != Action::Activity {
            if let Some(reason) = self.pet.report_blocked(action, unix) {
                return Err(reason);
            }
        }
        let mut next = self.pet.clone();
        let xp = next.apply(action);
        if action != Action::Activity {
            next.log.push(Entry {
                action,
                xp,
                at: unix,
                event: None,
            });
        }
        self.save(&next)?;
        self.pet = next;
        if action == Action::Activity {
            self.last_activity = Some(now);
        }
        Ok(self.pet.clone())
    }

    /// An event the pet took part in. No cooldown or daily limit; the same id counts only once,
    /// so a system that reports again (a retry, a restart) gives no extra XP.
    pub fn record_event(&mut self, id: String, unix: u64) -> Result<Pet, String> {
        let id = id.trim().to_owned();
        if id.is_empty() || id.chars().count() > 64 || id.chars().any(char::is_control) {
            return Err("Die Event-ID muss 1–64 Zeichen enthalten, ohne Steuerzeichen.".into());
        }
        if self.pet.log.iter().any(|entry| entry.event.as_ref() == Some(&id)) {
            return Ok(self.pet.clone());
        }
        let mut next = self.pet.clone();
        let xp = next.apply(Action::Event);
        next.log.push(Entry {
            action: Action::Event,
            xp,
            at: unix,
            event: Some(id),
        });
        self.save(&next)?;
        self.pet = next;
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

    pub fn equip(&mut self, cosmetic: Option<String>) -> Result<Pet, String> {
        let next = Pet {
            cosmetic,
            ..self.pet.clone()
        };
        next.validate()?;
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
