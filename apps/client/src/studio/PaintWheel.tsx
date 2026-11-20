/**
 * Das Farbrad: die Farben des Servers für ein angelegtes Cosmetic oder die Körperfarben, als
 * Tropfen im Kreis. Beim Cosmetic steht „Original“ in der Mitte. Darunter geht es zurück. Es nimmt
 * den Platz des Popovers ein, mit derselben Vorlage für den Tropfen aus Glas.
 *
 * @module
 */

import type { CSSProperties } from "react";

import type { StudioItem, StudioRegion } from "../pet";

import { Icon } from "../ui";

/** Lage und Richtung wie beim Popover. Über dem Kopf fehlt der Platz, dort öffnet es nach unten. */
const placement = (region: StudioRegion) =>
  `pop wheel at-${region.id} opens-${region.opens === "up" ? "down" : region.opens}`;

/** Die unsichtbare Vorlage für das Glas unter dem Rad. */
export function PaintWheelShape({ region }: { region: StudioRegion }) {
  return <span className={`${placement(region)} pop-shape`} data-liquid />;
}

/**
 * Ein Tropfen mit der Spitze nach oben, gefüllt mit `currentColor`. Im Rad dreht `rotate` in
 * `studio.css` sie zur Mitte.
 */
export function PaintDrop() {
  return (
    <svg viewBox="0 0 22 30" aria-hidden="true">
      <path d="M11 1C11 1 21 13.2 21 19a10 10 0 0 1-20 0C1 13.2 11 1 11 1Z" />
    </svg>
  );
}

/** Eigenschaften von {@link PaintWheel}. */
interface PaintWheelProps {
  region: StudioRegion;
  /** Die Farben. Beim Cosmetic zuerst „Original“ (`paint: null`), wie `paintItems` es liefert. */
  items: StudioItem[];
  /** Es läuft gerade ein Aufruf, die Wahl hätte keine Wirkung. */
  busy: boolean;
  onPick: (item: StudioItem) => void;
  onBack: () => void;
}

/** Ein Knopf des Rads. Gewählt wird nur, was noch nicht angelegt ist. */
function choice(item: StudioItem, busy: boolean, onPick: (item: StudioItem) => void) {
  return {
    type: "button" as const,
    "aria-label": item.name,
    "aria-pressed": item.state === "equipped",
    "aria-disabled": busy,
    "data-sound": item.state === "equipped" ? "none" : "select",
    onClick: () => {
      if (!busy && item.state === "unlocked") onPick(item);
    },
  };
}

/** Das Farbrad. Die Tropfen stehen in der Reihenfolge der Farben im Uhrzeigersinn, oben beginnend. */
export default function PaintWheel({ region, items, busy, onPick, onBack }: PaintWheelProps) {
  const original = items[0]?.paint === null ? items[0] : null;
  const paints = original ? items.slice(1) : items;
  return (
    <div
      id="studio-pop"
      className={placement(region)}
      style={{ "--n": paints.length } as CSSProperties}
      role="group"
      aria-label="Farbe"
    >
      {paints.map((item, index) => (
        <button
          key={item.id}
          className="petal"
          style={{ "--i": index, color: item.paint ?? undefined } as CSSProperties}
          {...choice(item, busy, onPick)}
        >
          <PaintDrop />
        </button>
      ))}
      {original?.icon ? (
        <button
          className="wheel-original"
          data-tip={original.name}
          {...choice(original, busy, onPick)}
        >
          <Icon name={original.icon} />
        </button>
      ) : null}
      <button
        type="button"
        className="wheel-back"
        aria-label="Zurück"
        data-tip="Zurück"
        onClick={onBack}
      >
        <Icon name="back" />
      </button>
    </div>
  );
}
