/**
 * Karte und Shop am Jelly: zwei Glas-Tropfen rechts unten, das Gegenstück zum Schild-Tropfen links.
 * Sie öffnen ihr eigenes Fenster, eine Auswahl wie beim Schild gibt es deshalb nicht.
 *
 * Lage und Schweben teilen sie sich mit dem Schild (`signs.css`), das Glas zeichnet
 * `scene/LiquidGlass.tsx`.
 *
 * @module
 */

import type { Popout } from "./useGame";

import { coinLabel } from "./pet";
import { Icon, type IconName } from "./ui";
import "./signs.css";

/** Ein Tropfen, der ein Fenster öffnet. `detail` steht im Tooltip hinter dem Namen. */
function PopoutDrop({
  className,
  icon,
  label,
  detail,
  disabled,
  onOpen,
}: {
  className: string;
  icon: IconName;
  label: string;
  detail?: string;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`sign-trigger ${className}`}
      data-liquid="calm"
      data-tip={detail ? `${label} · ${detail}` : label}
      aria-label={detail ? `${label}, ${detail}` : label}
      data-sound="window"
      disabled={disabled}
      onClick={onOpen}
    >
      <Icon name={icon} />
    </button>
  );
}

/**
 * Die beiden Tropfen. `disabled`, bis die Sitzung geladen ist: Vorher hätten Karte und Shop keine
 * Daten.
 *
 * @param coins - Münzen für den Shop, sein Tooltip nennt sie.
 */
export default function PopoutDrops({
  coins,
  disabled,
  onOpen,
}: {
  coins: number;
  disabled: boolean;
  onOpen: (popout: Popout) => void;
}) {
  return (
    <div className="sign-controls">
      <PopoutDrop
        className="map-trigger"
        icon="map"
        label="Karte"
        disabled={disabled}
        onOpen={() => onOpen("map")}
      />
      <PopoutDrop
        className="map-trigger shop-trigger"
        icon="shop"
        label="Shop"
        detail={coinLabel(coins)}
        disabled={disabled}
        onOpen={() => onOpen("shop")}
      />
    </div>
  );
}
