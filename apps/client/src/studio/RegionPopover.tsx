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

/** Spalten des Popovers für `count` Einträge. Fehlt Platz, kürzt `.pop` in `studio.css` sie. */
const countStyle = (count: number) => ({ "--cols": count }) as CSSProperties;

/**
 * Die unsichtbare Vorlage für den Tropfen unter den Einträgen. Sie wächst aus dem Blob heraus. Ihre
 * leeren Plätze brechen um wie die Einträge, so hat sie dieselbe Höhe.
 */
export function PopoverShape({ region, count }: { region: StudioRegion; count: number }) {
  return (
    <span className={cx("pop pop-shape", placement(region))} style={countStyle(count)} data-liquid>
      {Array.from({ length: count }, (_, index) => (
        <i key={index} />
      ))}
    </span>
  );
}

/** Was ein Eintrag zeigt: kleines Jelly oder Symbol. */
function ItemFace({ item }: { item: StudioItem }) {
  if (item.swatch) return <JellySwatch id={item.id ?? ""} palette={item.swatch} />;
  return item.icon ? <Icon name={item.icon} /> : null;
}

/**
 * Die Einträge einer Region. Es wirkt nur, was noch nicht angelegt ist, und das angelegte, wenn es
 * sich färben lässt: Es öffnet das Farbrad.
 *
 * Gesperrt wird mit `aria-disabled` statt `disabled`: Jede Wahl sperrt kurz, solange der Aufruf
 * läuft, und `disabled` würde dem Knopf dabei den Fokus nehmen.
 *
 * @param busy - Es läuft gerade ein Aufruf, die Wahl hätte keine Wirkung.
 * @param onPick - Bekommt den gewählten Eintrag.
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
  onPick: (item: StudioItem) => void;
}) {
  return (
    <div
      id="studio-pop"
      className={cx("pop", placement(region))}
      role="group"
      aria-label={region.label}
      style={countStyle(items.length)}
    >
      {items.map((item) => (
        <button
          key={item.id ?? "nichts"}
          type="button"
          className={item.paintable ? "paintable" : undefined}
          aria-label={item.paintable ? `${item.name} färben` : item.name}
          aria-pressed={item.state === "equipped"}
          aria-haspopup={item.paintable || undefined}
          aria-disabled={busy}
          data-tip={item.paintable ? `${item.name} · färben` : item.name}
          data-sound={item.state === "equipped" && !item.paintable ? "none" : "select"}
          onClick={() => {
            if (!busy && (item.state === "unlocked" || item.paintable)) onPick(item);
          }}
        >
          <ItemFace item={item} />
          {item.paintable ? <i className="paint-hint" /> : null}
        </button>
      ))}
    </div>
  );
}
