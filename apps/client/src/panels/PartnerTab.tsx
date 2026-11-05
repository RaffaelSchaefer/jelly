/**
 * Reiter „Partner-Emote“ im Panel „Dabei“: ein Partner-Emote starten und den Code weitersagen, oder
 * mit einem fremden Code beitreten.
 *
 * @module
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { PartnerOffer } from "../usePartnerEmote";

import {
  emptyPartnerCode,
  enterPartnerDigits,
  erasePreviousDigit,
  partnerClock,
  typedDigit,
  type CatalogEntry,
  type CodeEntry,
} from "../pet";

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

/** Der laufende Code in der Mitte einer Stoppuhr, die leer läuft. */
function OfferClock({
  offer,
  entries,
  offset,
  onBack,
}: {
  offer: PartnerOffer;
  entries: CatalogEntry[];
  offset: number;
  onBack: () => void;
}) {
  const remaining = useRemainingMs(offer.expiresAt, offset);
  const { left, urgent } = partnerClock(remaining, offer.durationMs);
  return (
    <div className="partner-offer">
      <div className="partner-clock" role="timer" data-urgent={urgent || undefined}>
        <ClockFace left={left} />
        <strong className="partner-code">{offer.code}</strong>
        <small>{entries.find((item) => item.key === offer.key)?.label}</small>
        <span className="sr-only">Der Code gilt noch {Math.ceil(remaining / 1000)} Sekunden.</span>
      </div>
      <button type="button" className="partner-back" onClick={onBack}>
        Zurück
      </button>
    </div>
  );
}

/**
 * Je Ziffer ein Feld, die letzte Ziffer schickt den Code ab. Der Fokus wandert mit der Eingabe,
 * Pfeiltasten wechseln das Feld.
 *
 * Nach einem Fehlschlag sind die Felder wieder leer: Versuche sind begrenzt, und das Ändern einer
 * einzelnen Ziffer wäre sonst schon der nächste.
 */
function JoinCode({
  disabled,
  onJoin,
}: {
  disabled: boolean;
  onJoin: (code: string) => Promise<boolean>;
}) {
  const [digits, setDigits] = useState(emptyPartnerCode);
  const fields = useRef<(HTMLInputElement | null)[]>([]);
  async function join(code: string) {
    const joined = await onJoin(code);
    setDigits(emptyPartnerCode());
    if (!joined) fields.current[0]?.focus();
  }
  function apply(entry: CodeEntry) {
    // Während eines Aufrufs zählt keine Eingabe, sonst ginge eine fertige Ziffernfolge verloren.
    if (disabled) return;
    setDigits(entry.digits);
    fields.current[entry.focus]?.focus();
    if (entry.digits.every(Boolean)) void join(entry.digits.join(""));
  }
  function onKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === "Backspace" && !digits[index]) apply(erasePreviousDigit(digits, index));
    else if (event.key === "ArrowLeft") fields.current[index - 1]?.focus();
    else if (event.key === "ArrowRight") fields.current[index + 1]?.focus();
    else return;
    event.preventDefault();
  }
  return (
    <div className="redeem-form partner-join" role="group" aria-label="Code des Partners">
      {digits.map((digit, index) => (
        <input
          // Die Felder bleiben fest an ihrem Platz, die Stelle ist ihre Identität.
          key={index}
          ref={(field) => {
            fields.current[index] = field;
          }}
          aria-label={`Ziffer ${index + 1} von ${digits.length}`}
          inputMode="numeric"
          autoComplete="off"
          value={digit}
          onFocus={(event) => event.target.select()}
          onChange={(event) =>
            apply(enterPartnerDigits(digits, index, typedDigit(digit, event.target.value)))
          }
          onKeyDown={(event) => onKeyDown(event, index)}
          onPaste={(event) => {
            event.preventDefault();
            apply(enterPartnerDigits(digits, index, event.clipboardData.getData("text")));
          }}
        />
      ))}
    </div>
  );
}

/**
 * Der Reiter: die Gesten zum Starten und der Beitritt, oder die Uhr, solange ein eigener Code
 * läuft.
 */
export default function PartnerTab({
  entries,
  offer,
  offset,
  allowed,
  disabled,
  onStart,
  onJoin,
  onBack,
}: {
  entries: CatalogEntry[];
  /** Der eigene, noch gültige Code. */
  offer: PartnerOffer | null;
  /** Abstand zur Server-Uhr, für die Restzeit des Codes. */
  offset: number;
  /** Läuft eine LAN, an der das Jelly teilnimmt? */
  allowed: boolean;
  disabled: boolean;
  onStart: (key: string) => Promise<boolean>;
  onJoin: (code: string) => Promise<boolean>;
  onBack: () => void;
}) {
  if (!allowed) return <p className="panel-note">Nur während einer LAN</p>;
  if (offer) return <OfferClock {...{ offer, entries, offset, onBack }} />;
  return (
    <>
      <div className="action-list partner-list">
        {entries.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className="action-button"
            aria-disabled={disabled}
            onClick={() => {
              if (!disabled) void onStart(key);
            }}
          >
            <strong>{label}</strong>
          </button>
        ))}
      </div>
      <p className="panel-note">Oder du hast einen Code bekommen:</p>
      <JoinCode disabled={disabled} onJoin={onJoin} />
    </>
  );
}
