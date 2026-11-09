/**
 * Das Popover einer Region: die Vorlage für den Tropfen und die Einträge darauf.
 *
 * @module
 */

import type { CSSProperties } from "react";

import type { StudioItem, StudioRegion } from "../pet";

import { Icon } from "../ui";
import { cx } from "../ui/cx";
import JellySwatch from "./JellySwatch";

/** Gemeinsame Klassen beider Ebenen, damit Tropfen und Einträge genau übereinander liegen. */
const placement = (region: StudioRegion) => `at-${region.id} opens-${region.opens}`;

/** Länge des Popovers für `count` Einträge, siehe `.pop` in `studio.css`. */
const countStyle = (count: number) => ({ "--count": count }) as CSSProperties;

/** Die unsichtbare Vorlage für den Tropfen unter den Einträgen. Sie wächst aus dem Blob heraus. */
export function PopoverShape({ region, count }: { region: StudioRegion; count: number }) {
  return (
    <span
      className={cx("pop pop-shape", placement(region))}
      style={countStyle(count)}
      data-liquid
    />
  );
}

/** Was ein Eintrag zeigt: kleines Jelly oder Symbol, gesperrte mit Schloss. */
function ItemFace({ item }: { item: StudioItem }) {
  if (item.swatch) return <JellySwatch id={item.id ?? ""} palette={item.swatch} />;
  return (
    <>
      {item.icon ? <Icon name={item.icon} /> : null}
      {item.state === "locked" ? (
        <span className="pop-lock">
          <Icon name="lock" />
        </span>
      ) : null}
    </>
  );
}

/**
 * Die Einträge einer Region. Es wirkt nur, was frei und noch nicht angelegt ist.
 *
 * Gesperrt wird mit `aria-disabled` statt `disabled`: Jede Wahl sperrt kurz, solange der Aufruf
 * läuft, und `disabled` würde dem Knopf dabei den Fokus nehmen.
 *
 * @param busy - Es läuft gerade ein Aufruf, die Wahl hätte keine Wirkung.
 * @param onPick - Bekommt die ID des Eintrags.
 */
export default function RegionPopover({
  region,
  items,
  busy,
  onPick,
}: {
  region: StudioRegion;
  items: StudioItem[];
  busy: boolean;
  onPick: (id: string | null) => void;
}) {
  return (
    <div
      id="studio-pop"
      className={cx("pop", placement(region))}
      role="group"
      aria-label={region.label}
      style={countStyle(items.length)}
    >
      {items.map((item) => {
        const locked = item.state === "locked";
        const label = item.note ? `${item.name} · ${item.note}` : item.name;
        return (
          <button
            key={item.id ?? "nichts"}
            type="button"
            className={locked ? "locked" : undefined}
            aria-label={locked ? `${item.name}, gesperrt: ${item.note}` : item.name}
            aria-pressed={item.state === "equipped"}
            aria-disabled={busy || locked}
            data-tip={label}
            data-sound={item.state === "equipped" ? "none" : "select"}
            onClick={() => {
              if (!busy && item.state === "unlocked") onPick(item.id);
            }}
          >
            <ItemFace item={item} />
          </button>
        );
      })}
    </div>
  );
}
