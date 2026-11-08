/**
 * Die Karte am Jelly: ein Glas-Tropfen rechts unten, das Gegenstück zum Schild-Tropfen links. Er
 * öffnet die Karte in ihrem eigenen Fenster, eine Auswahl wie beim Schild gibt es deshalb nicht.
 *
 * Lage und Schweben teilt er sich mit dem Schild (`signs.css`), das Glas zeichnet
 * `scene/LiquidGlass.tsx`.
 *
 * @module
 */

import { Icon } from "./ui";
import "./signs.css";

/** Der Tropfen. `disabled`, bis die Sitzung geladen ist: Vorher hätte die Karte keine Daten. */
export default function MapDrop({ disabled, onOpen }: { disabled: boolean; onOpen: () => void }) {
  return (
    <div className="sign-controls">
      <button
        type="button"
        className="sign-trigger map-trigger"
        data-liquid="calm"
        data-tip="Karte"
        aria-label="Karte"
        data-sound="window"
        disabled={disabled}
        onClick={onOpen}
      >
        <Icon name="map" />
      </button>
    </div>
  );
}
