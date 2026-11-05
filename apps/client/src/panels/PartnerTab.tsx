/**
 * Reiter „Partner-Emote“ im Panel „Dabei“: Geste wählen, ein Jelly auffordern und auf seine Antwort
 * warten.
 *
 * @module
 */

import { useEffect, useState } from "react";

import type { SentInvite } from "../usePartnerEmote";

import {
  filterStagePlayers,
  partnerClock,
  stagePlayerHex,
  type CatalogEntry,
  type StagePlayer,
} from "../pet";
import PlayerSearch, { usePlayerSearch } from "./PlayerSearch";

/**
 * Verbleibende Millisekunden bis `expiresAt`, jede Sekunde neu. `offset` ist der Abstand zur
 * Server-Uhr.
 */
function useRemainingMs(expiresAt: number, offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return expiresAt - (now + offset);
}

/** Wo der Seitenknopf der Stoppuhr sitzt, in Grad ab zwölf Uhr. */
const CLOCK_PUSHER_ANGLE = 42;

/**
 * Das Zifferblatt der Stoppuhr im 200er-Raster. Der Zeiger läuft im Uhrzeigersinn und nimmt den
 * Ring hinter sich weg. Weich wird das über CSS-Übergänge, denn `left` ändert sich nur einmal je
 * Sekunde.
 */
function ClockFace({ left }: { left: number }) {
  const elapsedAngle = (1 - left) * 360;
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <rect className="partner-clock-crown" x="88" y="-4" width="24" height="9" rx="3" />
      <rect className="partner-clock-crown" x="96" y="5" width="8" height="9" />
      <rect
        className="partner-clock-crown"
        x="94"
        y="4"
        width="12"
        height="8"
        rx="2"
        transform={`rotate(${CLOCK_PUSHER_ANGLE} 100 100)`}
        data-passed={elapsedAngle > CLOCK_PUSHER_ANGLE || undefined}
      />
      <circle className="partner-clock-track" cx="100" cy="100" r="84" />
      <g transform="rotate(-90 100 100)">
        <circle
          className="partner-clock-ticks"
          cx="100"
          cy="100"
          r="70"
          pathLength="60"
          strokeDasharray="0.14 0.86"
          strokeDashoffset="0.07"
        />
        <circle
          className="partner-clock-left"
          cx="100"
          cy="100"
          r="84"
          pathLength="1"
          strokeDasharray="1 1"
          strokeDashoffset={left - 1}
        />
      </g>
      <g className="partner-clock-hand" style={{ transform: `rotate(${elapsedAngle}deg)` }}>
        <circle cx="100" cy="16" r="7" />
      </g>
    </svg>
  );
}

/** Die laufende Aufforderung in der Mitte einer Stoppuhr, die leer läuft. */
function SentClock({
  sent,
  entries,
  offset,
  onCancel,
}: {
  sent: SentInvite;
  entries: CatalogEntry[];
  offset: number;
  onCancel: () => void;
}) {
  const remaining = useRemainingMs(sent.invite.expires_at, offset);
  const { left, urgent } = partnerClock(remaining, sent.durationMs);
  return (
    <div className="partner-offer">
      <div className="partner-clock" role="timer" data-urgent={urgent || undefined}>
        <ClockFace left={left} />
        <small>Warte auf</small>
        <strong className="partner-waiting">{sent.partnerName}</strong>
        <small>{entries.find((item) => item.key === sent.invite.key)?.label}</small>
        <span className="sr-only">Noch {Math.ceil(remaining / 1000)} Sekunden.</span>
      </div>
      <button type="button" className="partner-back" onClick={onCancel}>
        Abbrechen
      </button>
    </div>
  );
}

/** Was anstelle der Liste steht, sonst `null`. */
function pickNote(players: StagePlayer[] | null, shown: number) {
  if (!players) return "Noch keine Liste von der Bühne.";
  if (players.length === 0) return "Niemand sonst auf der Bühne.";
  return shown === 0 ? "Kein Jelly heißt so." : null;
}

/** Die Jellies zum Auffordern. Wer zu weit weg steht, erfährt es vom Server. */
function PartnerPicker({
  players,
  disabled,
  onLoad,
  onPick,
  onBack,
}: {
  players: StagePlayer[] | null;
  disabled: boolean;
  onLoad: () => Promise<void>;
  onPick: (player: StagePlayer) => void;
  onBack: () => void;
}) {
  useEffect(() => void onLoad(), [onLoad]);
  const search = usePlayerSearch();
  const shown = filterStagePlayers(players ?? [], search.query);
  const note = pickNote(players, shown.length);
  return (
    <>
      {players?.length ? <PlayerSearch search={search} /> : null}
      {note ? (
        <p className="panel-note">{note}</p>
      ) : (
        <div className="action-list follow-list">
          {shown.map((player) => (
            <button
              key={player.id}
              type="button"
              className="action-button"
              aria-disabled={disabled}
              onClick={() => {
                if (!disabled) onPick(player);
              }}
            >
              <span
                className="follow-dot"
                style={{ background: stagePlayerHex(player.color) }}
                aria-hidden="true"
              />
              <strong>{player.name}</strong>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="partner-back" onClick={onBack}>
        Andere Geste
      </button>
    </>
  );
}

/** Die Gesten zur Wahl. */
function GesturePicker({
  entries,
  onPick,
}: {
  entries: CatalogEntry[];
  onPick: (key: string) => void;
}) {
  return (
    <>
      <div className="action-list partner-list">
        {entries.map(({ key, label }) => (
          <button key={key} type="button" className="action-button" onClick={() => onPick(key)}>
            <strong>{label}</strong>
          </button>
        ))}
      </div>
      <p className="panel-note">Danach wählst du ein Jelly in deiner Nähe.</p>
    </>
  );
}

/** Der Reiter: erst die Geste, dann das Jelly, dann die Uhr, solange die Aufforderung läuft. */
export default function PartnerTab({
  entries,
  sent,
  players,
  offset,
  allowed,
  disabled,
  onLoad,
  onInvite,
  onCancel,
}: {
  entries: CatalogEntry[];
  /** Die eigene, noch offene Aufforderung. */
  sent: SentInvite | null;
  /** `null`, solange die Bühne noch keine Liste geliefert hat. */
  players: StagePlayer[] | null;
  /** Abstand zur Server-Uhr, für die Restzeit der Aufforderung. */
  offset: number;
  /** Läuft eine LAN, an der das Jelly teilnimmt? */
  allowed: boolean;
  disabled: boolean;
  onLoad: () => Promise<void>;
  onInvite: (key: string, player: StagePlayer) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [gesture, setGesture] = useState<string | null>(null);
  if (!allowed) return <p className="panel-note">Nur während einer LAN</p>;
  if (sent) return <SentClock {...{ sent, entries, offset, onCancel }} />;
  if (!gesture) return <GesturePicker entries={entries} onPick={setGesture} />;
  return (
    <PartnerPicker
      {...{ players, disabled, onLoad }}
      onPick={(player) => void onInvite(gesture, player)}
      onBack={() => setGesture(null)}
    />
  );
}
