/**
 * XP-Reiter „Einlösen“: großes Ticket im Textring, darunter das Feld für den Event-Code.
 *
 * @module
 */

import { useState, type FormEvent } from "react";

import type { Me } from "../pet";

import { desktop } from "../backend";
import { Icon, IconButton } from "../ui";

/**
 * Text im Ring. Geschützte Leerzeichen, weil SVG normale am Ende verschluckt und die Naht sichtbar
 * wäre.
 */
const RING_TEXT = "EVENT-CODE EINLÖSEN ✦ ".repeat(3);

/** Umfang des Rings im 200er-Raster: 2π · 86. Der Text verteilt sich genau darauf. */
const RING_LENGTH = 540;

/** Warum gerade nichts einzulösen geht, sonst `null`. Steht als Platzhalter im Feld. */
function blockedReason(me: Me) {
  if (!desktop) return "Geht nur in der Desktop-App";
  return me.lan?.active ? null : "Gerade läuft keine LAN";
}

/** Das Ticket im Ring. Der Ring dreht sich beim Darüberfahren, siehe `.redeem-ring` in `styles.css`. */
function Seal({ stamps }: { stamps: number }) {
  return (
    <div className="redeem-seal" aria-hidden="true">
      <svg className="redeem-ring" viewBox="0 0 200 200">
        <defs>
          <path id="redeem-ring-path" d="M100 14a86 86 0 1 1 0 172 86 86 0 1 1 0-172" />
        </defs>
        <text>
          <textPath href="#redeem-ring-path" textLength={RING_LENGTH}>
            {RING_TEXT}
          </textPath>
        </text>
      </svg>
      {/* Neuer `key` je Treffer: So startet die Stempel-Animation jedes Mal von vorn, ganz ohne Timer. */}
      <span key={stamps} className={stamps > 0 ? "redeem-ticket stamped" : "redeem-ticket"}>
        <Icon name="ticket" />
      </span>
      <span className="redeem-shimmer" />
    </div>
  );
}

/** Der Reiter „Einlösen“. Das Ergebnis meldet das Pet in seiner Sprechblase. */
export default function RedeemTab({
  me,
  disabled,
  onRedeem,
}: {
  me: Me;
  /** Knopf sperren, solange ein Aufruf läuft. */
  disabled: boolean;
  onRedeem: (code: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [stamps, setStamps] = useState(0);
  const blocked = blockedReason(me);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!(await onRedeem(code))) return;
    setCode("");
    setStamps((value) => value + 1);
  }
  return (
    <div className="redeem">
      <Seal stamps={stamps} />
      <form className="redeem-form" onSubmit={(event) => void submit(event)}>
        <input
          aria-label="Event-Code"
          placeholder={blocked ?? "Code eingeben"}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={blocked !== null}
        />
        <IconButton
          icon="send"
          label="Einlösen"
          className="redeem-send"
          type="submit"
          disabled={disabled || blocked !== null || !code.trim()}
        />
      </form>
    </div>
  );
}
