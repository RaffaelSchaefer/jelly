/**
 * Hinweis auf eine neue Version der App: Karte über dem Dock. Oben randlos das Raketen-Bild,
 * darunter „alt → neu“, was seit der installierten Version dazukam, und „Später“ neben
 * „Aktualisieren“. Beim Laden wird der Knopf zur Fortschritts-Kapsel.
 *
 * Verlangt der Server eine neuere App, kommt nur der Knopf in die Fehlermeldung ({@link
 * UpdateButton}).
 *
 * @module
 */

import { useState, type CSSProperties } from "react";

import type { AppUpdate } from "./useUpdate";

import { changelogSince, type ChangeEntry, type ChangeKind } from "./pet";
import { Icon } from "./ui";
import UpdateBanner from "./UpdateBanner";
import "./update.css";

/** So viele Einträge zeigt der Changelog zugeklappt. Mehr passt nicht ohne Scrollen in die Karte. */
const LOG_PREVIEW = 3;

/** Art eines Eintrags für Screenreader. Sichtbar steht nur ein Zeichen davor (`update.css`). */
const KIND_LABEL: Record<ChangeKind, string> = { neu: "Neu", besser: "Besser", weg: "Weg" };

/** Was die Kapsel beim Laden sagt. 100 heißt: geladen, wird eingespielt. */
function progressLabel(progress: number | null) {
  if (progress === 100) return "Spielt ein …";
  return progress === null ? "Lädt …" : `Lädt … ${progress} %`;
}

/** Füllt sich beim Laden. Ohne bekannte Größe und beim Einspielen läuft ein Schimmer durch. */
function UpdateProgress({ progress }: { progress: number | null }) {
  const label = progressLabel(progress);
  return (
    <div
      className="update-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress ?? undefined}
      aria-valuetext={label}
      data-label={label}
      data-waiting={progress === null || progress === 100 ? "" : undefined}
      style={{ "--update-progress": `${progress ?? 100}%` } as CSSProperties}
    >
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

/** Knopf „Aktualisieren“, beim Laden die Kapsel, darunter der Fehler des letzten Versuchs. */
export function UpdateButton({ update }: { update: AppUpdate }) {
  if (update.installing) return <UpdateProgress progress={update.progress} />;
  return (
    <>
      <button className="update-install" data-sound="success" onClick={update.install}>
        <Icon name="rocket" />
        Auf {update.available?.version} aktualisieren
      </button>
      {update.error ? <span className="update-error">{update.error}</span> : null}
    </>
  );
}

/** Was seit der installierten Version dazukam, als Abschnitt „Was ist neu“. Ohne Einträge nichts. */
function UpdateLog({ entries }: { entries: ChangeEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  const more = entries.length - LOG_PREVIEW;
  return (
    <section className="update-log" aria-labelledby="update-log-title">
      <h3 id="update-log-title">Was ist neu</h3>
      <ul data-open={open ? "" : undefined}>
        {(open ? entries : entries.slice(0, LOG_PREVIEW)).map((entry, index) => (
          <li key={index} data-kind={entry.kind ?? undefined}>
            {entry.kind ? <span className="sr-only">{KIND_LABEL[entry.kind]}: </span> : null}
            {entry.text}
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <button className="update-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Weniger anzeigen" : `${more} weitere anzeigen`}
        </button>
      ) : null}
    </section>
  );
}

/** Die Karte über dem Dock. Ohne neue Version zeigt sie nichts. */
export default function UpdateNotice({ update }: { update: AppUpdate }) {
  const { available } = update;
  if (!available) return null;
  return (
    <section
      className="panel update-card"
      aria-labelledby="update-title"
      aria-busy={update.installing}
    >
      <UpdateBanner />
      <div className="update-body">
        <div className="update-heading" role="status">
          <h2 id="update-title">Update bereit</h2>
          <p className="update-versions">
            <span>{available.current}</span>
            <span aria-hidden="true">→</span>
            <span className="sr-only">auf</span>
            <strong>{available.version}</strong>
          </p>
          <p className="update-hint">Dauert nur einen Moment.</p>
        </div>
        <UpdateLog entries={changelogSince(available.notes, available.current)} />
        <div className="update-actions">
          {/* Beim Laden nimmt die Kapsel die ganze Zeile, die Karte bleibt gleich hoch. */}
          {update.installing ? null : (
            <button className="secondary-button" data-sound="close" onClick={update.dismiss}>
              Später
            </button>
          )}
          <UpdateButton update={update} />
        </div>
      </div>
    </section>
  );
}
