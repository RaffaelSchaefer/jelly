/**
 * Die Lederbörse im Kopf des Zauberladens: die Münzen des Jellys als geprägte Zahl, die beim Kaufen
 * Münze für Münze herunterzählt. Ohne laufende LAN ist sie verschlossen.
 *
 * Screenreader hören nur die Zahl, bei der sie stehen bleibt, nicht jeden Schritt.
 *
 * @module
 */

import { useState } from "react";

import { coinLabel } from "../pet";
import { Icon } from "../ui";
import { usePurseCount } from "./usePurseCount";

/** Eigenschaften von {@link ShopPurse}. */
export interface PurseProps {
  /** Die Münzen des Jellys, wie der Server sie kennt. */
  coins: number;
  /** Münzen je Level-Aufstieg. */
  perLevel: number;
  /** Ob gerade eine LAN läuft. Ohne sie ist die Börse zu. */
  open: boolean;
  /**
   * Was die Börse stattdessen zeigt, etwa die Münzen vor dem Kauf, bis die Münzen in der Schale des
   * Zauberers landen. `null` zeigt `coins`.
   */
  hold?: number | null;
}

/** Was die Börse beim Überfahren erklärt. */
function purseTitle(open: boolean, perLevel: number) {
  if (!open) return "Münzen und Käufe gibt es nur während einer LAN.";
  return perLevel > 0 ? `Jeder Level-Aufstieg bringt ${coinLabel(perLevel)}.` : "Deine Münzen";
}

/** Die Börse. `#shop-purse-coin` ist der Ort, von dem beim Kauf die Münzen losfliegen. */
export default function ShopPurse({ coins, perLevel, open, hold = null }: PurseProps) {
  const { shown, trend, delta } = usePurseCount(hold ?? coins);
  // Erst wenn sie steht, bekommt die Meldung die neue Zahl: Sie soll nur einmal klingen.
  const [announced, setAnnounced] = useState(coins);
  if (hold === null && shown === coins && announced !== coins) setAnnounced(coins);
  return (
    <p
      className="shop-purse"
      data-trend={trend ?? undefined}
      data-open={open}
      data-hover-sound="coin"
      data-gaze="purse"
      title={purseTitle(open, perLevel)}
    >
      <span id="shop-purse-coin" className="purse-coin" data-coin-source="">
        <span key={shown} className="purse-flip">
          <Icon name={open ? "coin" : "lock"} />
        </span>
      </span>
      <span key={`zahl-${shown}`} className="purse-count" aria-hidden="true">
        {shown}
      </span>
      <span className="purse-label" aria-hidden="true">
        {open ? "Münzen" : "Geschlossen"}
      </span>
      {trend === "up" && delta > 0 ? (
        <span key={`plus-${shown}`} className="purse-plus" aria-hidden="true">
          +{delta}
        </span>
      ) : null}
      <span className="sr-only" role="status">
        {open ? coinLabel(announced) : `Laden zu, ${coinLabel(announced)}`}
      </span>
    </p>
  );
}
