// The XP panel's three tabs and the level-up card. App.tsx owns the state and the backend calls.
import { useState } from "react";

import {
  ACHIEVEMENTS,
  achievementProgress,
  COSMETICS,
  isUnlocked,
  levelProgress,
  nextLevelCosmetic,
  reportStatus,
  todaysEntries,
  unlockLabel,
  type Pet,
  type Report,
} from "./pet";
import {
  AchievementRow,
  CosmeticTile,
  Icon,
  PrimaryButton,
  ReportButton,
  XpEntry,
  XpProgress,
} from "./ui";

export type XpTab = "overview" | "cosmetics" | "achievements";
export const XP_TABS: { id: XpTab; label: string; title: string }[] = [
  { id: "overview", label: "Übersicht", title: "Ein Stück LAN für dein Pet." },
  { id: "cosmetics", label: "Cosmetics", title: "Schick machen." },
  { id: "achievements", label: "Erfolge", title: "Was ihr schon geschafft habt." },
];

export const REPORTS = [
  {
    action: "food",
    icon: "food",
    title: "Essen",
    logTitle: "Essen geholt",
    xp: 15,
    message: "Snack gesichert. Weiter geht’s!",
  },
  {
    action: "drink",
    icon: "drink",
    title: "Getränk",
    logTitle: "Getränk geholt",
    xp: 10,
    message: "Auf die nächste Runde!",
  },
] as const;

const time = (at: number) =>
  new Date(at * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export function Overview({
  pet,
  now,
  disabled,
  onReport,
}: {
  pet: Pet;
  now: number;
  disabled: boolean;
  onReport: (action: Report) => void;
}) {
  const next = nextLevelCosmetic(levelProgress(pet.xp).level);
  const today = todaysEntries(pet.log, now);
  const left = reportStatus(pet.log, "food", now).left;
  return (
    <div className="xp-sections">
      <XpProgress
        name={pet.name}
        xp={pet.xp}
        next={next ? `Bei ${unlockLabel(next)}: ${next.name}` : undefined}
      />
      <section className="xp-section" aria-labelledby="xp-today">
        <div className="xp-section-head">
          <h3 id="xp-today">Heute gesammelt</h3>
          <span className="action-xp">+{today.reduce((sum, entry) => sum + entry.xp, 0)} XP</span>
        </div>
        {today.length ? (
          today.slice(0, 3).map((entry) => {
            const report = REPORTS.find((item) => item.action === entry.action);
            return (
              <XpEntry
                key={entry.at + entry.action}
                icon={report?.icon ?? "event"}
                title={report?.logTitle ?? "Event mitgemacht"}
                detail={`${report ? "Selbst gemeldet" : "Event"} · ${time(entry.at)}`}
                xp={entry.xp}
                tag={report ? "Gemeldet" : "Event"}
              />
            );
          })
        ) : (
          <p className="panel-hint">
            Heute noch nichts. Bald zählen auch Zocken über Steam und Events von selbst.
          </p>
        )}
      </section>
      <section className="xp-section" aria-labelledby="xp-report">
        <div className="xp-section-head">
          <h3 id="xp-report">Selbst melden</h3>
          <span>Noch {left} frei</span>
        </div>
        <div className="report-grid">
          {REPORTS.map((item) => {
            const wait = reportStatus(pet.log, item.action, now).waitMinutes;
            return (
              <ReportButton
                key={item.action}
                icon={item.icon}
                title={item.title}
                xp={item.xp}
                wait={wait}
                disabled={disabled || wait > 0 || left === 0}
                onClick={() => onReport(item.action)}
              />
            );
          })}
        </div>
        <p className="panel-hint">Du sagst, was passiert ist. Wir vertrauen dir.</p>
      </section>
    </div>
  );
}

export function Cosmetics({
  pet,
  disabled,
  onEquip,
}: {
  pet: Pet;
  disabled: boolean;
  onEquip: (id: string | null) => void;
}) {
  const [slot, setSlot] = useState<string>("Alle");
  const [selectedId, setSelectedId] = useState(
    pet.cosmetic ?? COSMETICS.find((item) => isUnlocked(item, pet))?.id ?? COSMETICS[0].id,
  );
  const selected = COSMETICS.find((item) => item.id === selectedId) ?? COSMETICS[0];
  const unlocked = COSMETICS.filter((item) => isUnlocked(item, pet)).length;
  const progress = levelProgress(pet.xp);
  return (
    <div className="xp-sections">
      <div className="xp-section-head">
        <strong>
          {unlocked} von {COSMETICS.length} freigeschaltet
        </strong>
        <span>
          Level {progress.level} · {pet.xp} XP
        </span>
      </div>
      <div className="chips" role="group" aria-label="Kategorie">
        {["Alle", "Kopf", "Gesicht", "Effekte"].map((item) => (
          <button key={item} aria-pressed={slot === item} onClick={() => setSlot(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="cosmetic-grid">
        {COSMETICS.filter((item) => slot === "Alle" || item.slot === slot).map((item) => {
          const state =
            pet.cosmetic === item.id ? "equipped" : isUnlocked(item, pet) ? "unlocked" : "locked";
          return (
            <CosmeticTile
              key={item.id}
              icon={item.icon}
              name={item.name}
              state={state}
              note={
                state === "equipped"
                  ? "Angelegt"
                  : state === "unlocked"
                    ? "Freigeschaltet"
                    : unlockLabel(item)
              }
              selected={item.id === selected.id}
              onClick={() => setSelectedId(item.id)}
            />
          );
        })}
      </div>
      <div className="cosmetic-detail">
        <span className="cosmetic-preview">
          <Icon name={selected.icon} />
        </span>
        <span>
          <strong>{selected.name}</strong>
          <small>
            {isUnlocked(selected, pet)
              ? `Freigeschaltet · ${unlockLabel(selected)}.`
              : `Gesperrt · ${unlockLabel(selected)}.`}
          </small>
        </span>
        {isUnlocked(selected, pet) ? (
          <PrimaryButton
            disabled={disabled}
            onClick={() => onEquip(pet.cosmetic === selected.id ? null : selected.id)}
          >
            {pet.cosmetic === selected.id ? "Ablegen" : "Anlegen"}
          </PrimaryButton>
        ) : null}
      </div>
      <p className="panel-hint">Neue Teile gibt’s mit jedem Level, für Erfolge und bei Events.</p>
    </div>
  );
}

export function Achievements({ pet }: { pet: Pet }) {
  const progress = achievementProgress(pet.log);
  const done = ACHIEVEMENTS.filter((item) => progress[item.id] >= item.goal);
  // The open achievement closest to done gets the spotlight.
  const featured = ACHIEVEMENTS.filter(
    (item) => !item.secret && progress[item.id] > 0 && progress[item.id] < item.goal,
  ).sort((a, b) => progress[b.id] / b.goal - progress[a.id] / a.goal)[0];
  return (
    <div className="xp-sections">
      <div className="xp-section-head">
        <strong>
          {done.length} von {ACHIEVEMENTS.length} Erfolgen
        </strong>
      </div>
      {featured ? (
        <div className="achievement-featured">
          <AchievementRow
            icon={featured.icon}
            title={featured.title}
            detail={featured.detail}
            value={progress[featured.id]}
            goal={featured.goal}
            unit={featured.unit}
            done={false}
          />
        </div>
      ) : null}
      <section className="xp-section" aria-labelledby="xp-achievements">
        <h3 id="xp-achievements">Alle Erfolge</h3>
        {ACHIEVEMENTS.filter((item) => item !== featured).map((item) => {
          const finished = progress[item.id] >= item.goal;
          const hidden = item.secret && !finished;
          return (
            <AchievementRow
              key={item.id}
              icon={hidden ? "moon" : item.icon}
              title={hidden ? "Geheimer Erfolg" : item.title}
              detail={hidden ? "Bleib lange genug wach …" : item.detail}
              value={progress[item.id]}
              goal={item.goal}
              unit={item.unit}
              done={finished}
            />
          );
        })}
      </section>
    </div>
  );
}

/**
 * Shown in the panel right after a level-up.
 */
export function LevelUp({
  pet,
  disabled,
  onEquip,
  onClose,
}: {
  pet: Pet;
  disabled: boolean;
  onEquip: (id: string) => void;
  onClose: () => void;
}) {
  const { level } = levelProgress(pet.xp);
  const unlocked = COSMETICS.find((item) => "level" in item.unlock && item.unlock.level === level);
  const next = nextLevelCosmetic(level);
  return (
    <div className="xp-sections">
      <span className="levelup-step">
        <Icon name="spark" />
        Level {level - 1} → Level {level}
      </span>
      <XpProgress name={pet.name} xp={pet.xp} />
      {unlocked ? (
        <section className="xp-section" aria-labelledby="xp-unlocked">
          <h3 id="xp-unlocked">Neu freigeschaltet</h3>
          <div className="cosmetic-detail featured">
            <span className="cosmetic-preview">
              <Icon name={unlocked.icon} />
            </span>
            <span>
              <strong>{unlocked.name}</strong>
              <small>
                {unlocked.slot} · gehört jetzt {pet.name}.
              </small>
            </span>
          </div>
        </section>
      ) : null}
      {next ? (
        <p className="xp-row xp-next">
          <span>
            <Icon name="lock" />
            Als Nächstes bei {unlockLabel(next)}: {next.name}
          </span>
        </p>
      ) : null}
      <div className="report-grid">
        <button className="secondary-button" onClick={onClose}>
          {unlocked ? "Später" : "Weiter"}
        </button>
        {unlocked ? (
          <PrimaryButton disabled={disabled} onClick={() => onEquip(unlocked.id)}>
            Anlegen
          </PrimaryButton>
        ) : null}
      </div>
    </div>
  );
}
