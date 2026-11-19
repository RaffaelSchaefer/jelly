/**
 * Das Farbrad eines angelegten Cosmetics: die Farben des Servers als Tropfen im Kreis, in der Mitte
 * „Original“, darunter zurück zu den Einträgen. Es nimmt den Platz des Popovers ein, mit derselben
 * Vorlage für den Tropfen aus Glas.
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

/** Ein Tropfen mit der Spitze nach oben. `rotate` in `studio.css` dreht sie zur Mitte. */
function Drop() {
  return (
    <svg viewBox="0 0 22 30" aria-hidden="true">
      <path d="M11 1C11 1 21 13.2 21 19a10 10 0 0 1-20 0C1 13.2 11 1 11 1Z" />
    </svg>
  );
}

/** Eigenschaften von {@link PaintWheel}. */
interface PaintWheelProps {
  region: StudioRegion;
  /** „Original“ zuerst, dann die Farben, wie `paintItems` sie liefert. */
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
  const [original, ...paints] = items;
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
          <Drop />
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
