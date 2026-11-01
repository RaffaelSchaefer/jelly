/**
 * XP-Reiter „Übersicht“: Levelbalken, heute gesammelte XP und die Knöpfe für Selbstmeldungen.
 *
 * @module
 */

import { useEffect, useState } from "react";

import {
  levelProgress,
  nextLevelCosmetic,
  REPORTS,
  reportStatus,
  todaysEntries,
  unlockLabel,
  type Entry,
  type Pet,
  type Report,
} from "../pet";
import { ReportButton, XpEntry, XpProgress } from "../ui";

/** Wie oft die Abklingzeiten neu berechnet werden, in Millisekunden. */
const TICK_MS = 15_000;

/** Aktuelle Unix-Zeit in Sekunden. */
const unixNow = () => Math.floor(Date.now() / 1000);

/** Uhrzeit als „14:05“. */
const time = (at: number) =>
  new Date(at * 1000).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * Aktuelle Unix-Zeit, die alle {@link TICK_MS} weiterläuft und bei jeder Änderung von `pet` sofort
 * nachzieht. So zählt eine eben gemeldete Abklingzeit von der richtigen Zeit aus herunter.
 */
function useUnixNow(pet: Pet) {
  const [now, setNow] = useState(unixNow);
  useEffect(() => {
    setNow(unixNow());
    const timer = window.setInterval(() => setNow(unixNow()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [pet]);
  return now;
}

/** Die letzten drei Einträge von heute, oder ein Hinweis, wenn es noch keine gibt. */
function TodaySection({ today }: { today: Entry[] }) {
  return (
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
  );
}

/** Ein Knopf je Selbstmeldung, gesperrt während der Abklingzeit oder wenn das Tageslimit voll ist. */
function ReportSection({
  log,
  now,
  disabled,
  onReport,
}: {
  log: Entry[];
  now: number;
  disabled: boolean;
  onReport: (action: Report) => void;
}) {
  const left = reportStatus(log, "food", now).left;
  return (
    <section className="xp-section" aria-labelledby="xp-report">
      <div className="xp-section-head">
        <h3 id="xp-report">Selbst melden</h3>
        <span>Noch {left} frei</span>
      </div>
      <div className="report-grid">
        {REPORTS.map((item) => {
          const wait = reportStatus(log, item.action, now).waitMinutes;
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
  );
}

/** Der Reiter „Übersicht“. */
export default function OverviewTab({
  pet,
  disabled,
  onReport,
}: {
  pet: Pet;
  /** Meldeknöpfe sperren, etwa während ein Aufruf läuft oder in der Browser-Vorschau. */
  disabled: boolean;
  onReport: (action: Report) => void;
}) {
  const now = useUnixNow(pet);
  const next = nextLevelCosmetic(levelProgress(pet.xp).level);
  return (
    <div className="xp-sections">
      <XpProgress
        name={pet.name}
        xp={pet.xp}
        next={next ? `Bei ${unlockLabel(next)}: ${next.name}` : undefined}
      />
      <TodaySection today={todaysEntries(pet.log, now)} />
      <ReportSection log={pet.log} now={now} disabled={disabled} onReport={onReport} />
    </div>
  );
}
