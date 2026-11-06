/**
 * XP-Reiter „Übersicht“: Levelbalken, Stupser-Hinweis und Selbstmeldungen.
 *
 * @module
 */

import { useEffect, useState } from "react";

import {
  levelProgress,
  nextLevelCosmetic,
  pokeWaitMinutes,
  REPORTS,
  reportStatus,
  unlockLabel,
  type Catalog,
  type Me,
  type Report,
  type Rules,
} from "../pet";
import { ReportButton, XpProgress } from "../ui";

/** Wie oft die Abklingzeiten neu berechnet werden, in Millisekunden. */
const TICK_MS = 15_000;

/**
 * Uhrzeit des Servers, die alle {@link TICK_MS} weiterläuft und bei jedem neuen Stand sofort
 * nachzieht.
 */
function useServerNow(offset: number, me: Me) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const timer = window.setInterval(() => setNow(Date.now() + offset), TICK_MS);
    return () => window.clearInterval(timer);
  }, [offset, me]);
  return now;
}

/** Wann ein Stupser wieder XP gibt. */
function pokeHint(me: Me, now: number) {
  const wait = pokeWaitMinutes(me.next_poke_at, now);
  if (wait === null) return "Gerade läuft keine LAN.";
  if (wait === 0) return "Stups mich an, das gibt XP!";
  return `Nächste Stupser-XP in ${wait} min.`;
}

/** Ein Knopf je Selbstmeldung, gesperrt während der Abklingzeit oder wenn das Kontingent leer ist. */
function ReportSection({
  me,
  now,
  disabled,
  onReport,
}: {
  me: Me;
  now: number;
  disabled: boolean;
  onReport: (action: Report) => void;
}) {
  const left = reportStatus(me.reports, "food", now).left;
  return (
    <section className="xp-section" aria-labelledby="xp-report">
      <div className="xp-section-head">
        <h3 id="xp-report">Selbst melden</h3>
        <span>Noch {left} frei</span>
      </div>
      <div className="report-grid">
        {REPORTS.map((item) => {
          const wait = reportStatus(me.reports, item.action, now).waitMinutes;
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
  me,
  catalog,
  rules,
  offset,
  disabled,
  onReport,
}: {
  me: Me;
  catalog: Catalog;
  /** Die Regeln der LAN, für den Fortschritt zum nächsten Level. */
  rules: Rules;
  /** Abstand zur Uhr des Servers, siehe `useGameState`. */
  offset: number;
  /** Knöpfe sperren, etwa während ein Aufruf läuft oder in der Browser-Vorschau. */
  disabled: boolean;
  onReport: (action: Report) => void;
}) {
  const now = useServerNow(offset, me);
  const next = nextLevelCosmetic(levelProgress(me.xp, rules.xp_per_level).level, catalog);
  const locked = disabled || !me.lan?.active;
  return (
    <div className="xp-sections">
      <XpProgress
        name={me.name}
        xp={me.xp}
        xpPerLevel={rules.xp_per_level}
        next={next ? `Bei ${unlockLabel(next.id, catalog)}: ${next.name}` : undefined}
      />
      <p className="panel-hint">
        {pokeHint(me, now)} Insgesamt {me.total_xp} XP auf {me.lans_attended}{" "}
        {me.lans_attended === 1 ? "LAN" : "LANs"}. Deine Nummer bei der Orga: {me.id}.
      </p>
      <ReportSection me={me} now={now} disabled={locked} onReport={onReport} />
    </div>
  );
}
