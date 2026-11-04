/**
 * Ein Blob des Studios: die Vorlage für den Tropfen und der Knopf darauf.
 *
 * @module
 */

import type { Ref } from "react";

import type { StudioRegion } from "../pet";

import { Icon } from "../ui";
import { cx } from "../ui/cx";

/** Die unsichtbare Vorlage für den Tropfen unter dem Knopf, siehe `scene/LiquidGlass.tsx`. */
export function BlobShape({ region, open }: { region: StudioRegion; open: boolean }) {
  return (
    <span className={cx(`blob-shape at-${region.id}`, open ? "active" : undefined)} data-liquid />
  );
}

/**
 * Der Knopf einer Region.
 *
 * @param worn - Ob in dieser Region gerade etwas angelegt ist. Dann trägt er einen Punkt.
 */
export default function Blob({
  region,
  open,
  worn,
  onToggle,
  ref,
}: {
  region: StudioRegion;
  open: boolean;
  worn: boolean;
  onToggle: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx(`blob at-${region.id}`, worn ? "worn" : undefined)}
      aria-label={region.label}
      aria-expanded={open}
      aria-controls={open ? "studio-pop" : undefined}
      data-tip={region.label}
      onClick={onToggle}
    >
      <Icon name={region.icon} />
    </button>
  );
}
