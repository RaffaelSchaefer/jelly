/**
 * Bausteine rund um XP: Levelbalken, Verlaufszeilen, Meldeknöpfe, Erfolge.
 *
 * Teil des Design-Systems (siehe `controls.tsx`). Hier also nur Komponenten exportieren.
 *
 * @module
 */

import type { ComponentProps } from "react";

import { levelProgress } from "../pet";
import { cx } from "./cx";
import Icon, { type IconName } from "./Icon";

/** Eigenschaften von {@link ActionButton}. */
export interface ActionButtonProps extends ComponentProps<"button"> {
  icon: IconName;
  title: string;
  detail: string;
  /** XP, die die Aktion bringt. */
  xp: number;
}

/** Großer Aktionsknopf mit Icon, Titel, Erklärung und XP-Wert. */
export function ActionButton({ icon, title, detail, xp, ...rest }: ActionButtonProps) {
  return (
    <button className="action-button" {...rest}>
      <span className="action-icon">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="action-xp">+{xp} XP</span>
    </button>
  );
}

/** Levelbalken. `next` nennt die nächste Belohnung („Bei Level 5: Pixel-Brille“). */
export function XpProgress({
  name,
  xp,
  xpPerLevel,
  next,
}: {
  name: string;
  xp: number;
  /** Die Regel `xp_per_level` der LAN. */
  xpPerLevel: number;
  next?: string;
}) {
  const progress = levelProgress(xp, xpPerLevel);
  return (
    <div className="level-summary">
      <div className="xp-row">
        <span>
          <Icon name="spark" />
          <strong>
            {name} · Level {progress.level}
          </strong>
        </span>
        <span>
          {progress.current} / {xpPerLevel} XP
        </span>
      </div>
      <progress
        value={progress.current}
        max={xpPerLevel}
        aria-label={`Fortschritt zu Level ${progress.level + 1}`}
      />
      <div className="xp-row xp-next">
        {next ? (
          <span>
            <Icon name="lock" />
            {next}
          </span>
        ) : (
          <span />
        )}
        <span>Noch {progress.remaining} XP</span>
      </div>
    </div>
  );
}

/** Eine Zeile im XP-Verlauf. `live` markiert eine Quelle, die gerade zählt. */
export function XpEntry({
  icon,
  title,
  detail,
  xp,
  tag,
  live,
}: {
  icon: IconName;
  title: string;
  detail: string;
  xp: number;
  /** Kurzes Etikett rechts, zum Beispiel „Gemeldet“. */
  tag: string;
  live?: boolean;
}) {
  return (
    <div className={cx("xp-entry", live ? "live" : undefined)}>
      <span className="action-icon">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="xp-entry-end">
        <span className="action-xp">+{xp} XP</span>
        <small>
          {live ? <span className="status-dot" /> : null}
          {tag}
        </small>
      </span>
    </div>
  );
}

/** Eigenschaften von {@link ReportButton}. */
export interface ReportButtonProps extends ComponentProps<"button"> {
  icon: IconName;
  title: string;
  xp: number;
  /** Minuten bis zur nächsten Meldung. Über 0 zeigt der Knopf die Wartezeit statt der XP. */
  wait: number;
}

/** Knopf für eine Selbstmeldung (Essen, Getränk). */
export function ReportButton({ icon, title, xp, wait, ...rest }: ReportButtonProps) {
  return (
    <button className="report-button" {...rest}>
      <span className="action-icon">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        {wait > 0 ? (
          <small>Wieder in {wait} min</small>
        ) : (
          <span className="action-xp">+{xp} XP</span>
        )}
      </span>
    </button>
  );
}

/** Ein Erfolg mit Fortschrittsbalken oder Ziel, wenn geschafft mit Haken. */
export function AchievementRow({
  icon,
  title,
  detail,
  value,
  goal,
  unit = "",
  done,
}: {
  icon: IconName;
  title: string;
  detail: string;
  /** Aktueller Fortschritt. Ohne Wert steht dort nur das Ziel. */
  value?: number;
  /** Zielwert. */
  goal: number;
  /** Einheit hinter dem Fortschritt, zum Beispiel `"h"`. */
  unit?: string;
  done: boolean;
}) {
  return (
    <div className={cx("achievement", done ? "done" : undefined)}>
      <span className="achievement-badge">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="achievement-end">
        {done ? (
          <span className="achievement-done">
            <Icon name="check" />
            Geschafft
          </span>
        ) : value === undefined ? (
          <small>
            Ziel {goal}
            {unit ? ` ${unit}` : ""}
          </small>
        ) : (
          <>
            <small>
              {value} / {goal}
              {unit ? ` ${unit}` : ""}
            </small>
            <progress value={value} max={goal} aria-label={`Fortschritt ${title}`} />
          </>
        )}
      </span>
    </div>
  );
}
