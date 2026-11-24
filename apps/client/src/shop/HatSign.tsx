/**
 * Das Schildchen, wo sonst Funkelbarts Hut sitzt, solange ihn laut Server ein Jelly trägt: bei wem
 * er ist und wie lange noch. Es steht still und zählt nur seinen Text im Sekundentakt herunter, so
 * sieht es in jeder Fassung gleich aus, auch ruhig und optimiert.
 *
 * @module
 */

import { useEffect, useState, type CSSProperties } from "react";

import type { Me } from "../pet";

import { cssPercent, TEASE_SPOTS, wizardRectStyle } from "../pet/shopStage";
import { hatSignText, serverHat } from "../pet/wizardHat";

/** Wo es hängt: unter der Spitze des Huts, der dort fehlt, schmal genug für die Blase daneben. */
const SIGN_STYLE: CSSProperties = (() => {
  const { left, right, top, bottom } = TEASE_SPOTS.hat;
  const spot = wizardRectStyle({ ...TEASE_SPOTS.hat, top: (top + bottom) / 2 + 0.25 });
  const middle = wizardRectStyle({ ...TEASE_SPOTS.hat, left: (left + right) / 2 });
  return { left: middle.left, top: spot.top, maxWidth: cssPercent(22) };
})();

/** Die Uhr des Geräts, im Sekundentakt, solange `ticking` gilt. */
function useSecondClock(ticking: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  return now;
}

/** Eigenschaften von {@link HatSign}. */
export interface HatSignProps {
  me: Me;
  /** `server_time - Date.now()` aus `useGameState`. */
  offset: number;
}

/** Bei wem der Hut ist und wie lange noch, sonst nichts. */
export default function HatSign({ me, offset }: HatSignProps) {
  const now = useSecondClock(me.wizard_hat !== null);
  const hat = serverHat(me, now + offset);
  if (!hat) return null;
  return (
    <div className="stage-hat-sign" style={SIGN_STYLE}>
      <span className="sign-board">
        <strong>Hut verliehen</strong>
        <em>{hatSignText(hat)}</em>
      </span>
    </div>
  );
}
