/**
 * Das Pet-Studio: Name, Farbe und Cosmetics direkt am Jelly.
 *
 * Die Tropfen selbst zeichnet ein Shader in der Canvas (`scene/LiquidGlass.tsx`). Er liest ihre
 * Form von den unsichtbaren `data-liquid`-Elementen hier ab. Knöpfe und Symbole liegen in `.ink`
 * darüber. Wo die Blobs sitzen, schreibt `scene/StudioAnchors.tsx` als CSS-Variablen auf die
 * Bühne.
 *
 * @module
 */

import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";

import "./studio.css";
import {
  REGIONS,
  regionItems,
  wornRegions,
  type Catalog,
  type CosmeticSlot,
  type Me,
  type PetColor,
  type StudioRegionId,
} from "./pet";
import Blob, { BlobShape } from "./studio/Blob";
import NameTag from "./studio/NameTag";
import RegionPopover, { PopoverShape } from "./studio/RegionPopover";

/** Eigenschaften von {@link Studio}. */
export interface StudioProps {
  me: Me;
  catalog: Catalog;
  /** Es läuft gerade ein Aufruf, eine Wahl hätte keine Wirkung. */
  busy: boolean;
  /** Die offene Region. Sie liegt außerhalb, weil auch die Kamera ihr folgt. */
  region: StudioRegionId | null;
  onRegion: (region: StudioRegionId | null) => void;
  /** Bekommt den Platz und die ID zum Anlegen oder `null` zum Ablegen. */
  onEquip: (slot: CosmeticSlot, id: string | null) => void;
  onColor: (color: PetColor) => void;
  /** Liefert `false`, wenn der Name abgelehnt wurde. */
  onName: (name: string) => Promise<boolean>;
  onClose: () => void;
}

/** Holt den Fokus beim Öffnen auf das Element mit dem Ref und gibt ihn beim Schließen zurück. */
function useFocusWhileOpen() {
  const element = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const before = document.activeElement;
    element.current?.focus({ preventScroll: true });
    return () => {
      if (before instanceof HTMLElement) before.focus({ preventScroll: true });
    };
  }, []);
  return element;
}

/** Schließt das Studio und klingt dabei wie ein Panel, das zugeht. */
function DoneButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="studio-done" data-liquid data-sound="close" onClick={onClose}>
      Fertig
    </button>
  );
}

/** Das Overlay über dem Jelly. */
export default function Studio(props: StudioProps) {
  const { me, catalog, busy, region, onRegion, onEquip, onColor, onName, onClose } = props;
  const firstBlob = useFocusWhileOpen();

  const open = REGIONS.find((item) => item.id === region);
  const items = open ? regionItems(open, me, catalog) : [];
  const worn = wornRegions(me);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !region) return;
    // Esc schließt erst die Region. Erst das nächste läuft bis `App.tsx` und schließt das Studio.
    event.stopPropagation();
    // Der Fokus kann im Popover liegen, das gleich verschwindet.
    event.currentTarget.querySelector<HTMLElement>(".blob[aria-expanded='true']")?.focus();
    onRegion(null);
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    // WebKit fokussiert Knöpfe beim Klick nicht. Ohne Fokus im Studio käme Esc nirgends an.
    target.closest("button")?.focus();
    if (target !== event.currentTarget) return;
    event.currentTarget.focus();
    onRegion(null);
  }

  function pick(id: string | null) {
    if (open?.slot) onEquip(open.slot, id);
    else onColor(id as PetColor);
  }

  return (
    <div
      className="studio"
      tabIndex={-1}
      data-open={region ?? undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="ink">
        {REGIONS.map((item, index) => (
          <Blob
            key={item.id}
            ref={index === 0 ? firstBlob : undefined}
            region={item}
            open={item.id === region}
            worn={worn.includes(item.id)}
            onToggle={() => onRegion(item.id === region ? null : item.id)}
          />
        ))}
        {open ? (
          <RegionPopover key={open.id} {...{ items, busy }} region={open} onPick={pick} />
        ) : null}
        <NameTag name={me.name} busy={busy} onSave={onName} />
        <DoneButton onClose={onClose} />
      </div>
      {/* Nach `.ink`: Der Shader nimmt sie der Reihe nach, und das Popover kommt und geht als letztes. */}
      <div className="studio-shapes" aria-hidden="true">
        {REGIONS.map((item) => (
          <BlobShape key={item.id} region={item} open={item.id === region} />
        ))}
        {open ? <PopoverShape key={open.id} region={open} count={items.length} /> : null}
      </div>
    </div>
  );
}
