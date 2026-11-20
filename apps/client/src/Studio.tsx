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

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import "./studio.css";
import {
  paintItems,
  REGIONS,
  regionItems,
  wornRegions,
  type Catalog,
  type CosmeticSlot,
  type Me,
  type PetColor,
  type StudioItem,
  type StudioRegion,
  type StudioRegionId,
} from "./pet";
import Blob, { BlobShape } from "./studio/Blob";
import NameTag from "./studio/NameTag";
import PaintWheel, { PaintWheelShape } from "./studio/PaintWheel";
import RegionPopover, { PopoverShape } from "./studio/RegionPopover";

/** Eigenschaften von {@link Studio}. */
export interface StudioProps {
  me: Me;
  /** Sagt, was sich einfärben lässt und in welchen Farben. */
  catalog: Catalog;
  /** Es läuft gerade ein Aufruf, eine Wahl hätte keine Wirkung. */
  busy: boolean;
  /** Die offene Region. Sie liegt außerhalb, weil auch die Kamera ihr folgt. */
  region: StudioRegionId | null;
  onRegion: (region: StudioRegionId | null) => void;
  /**
   * Bekommt den Platz und die ID zum Anlegen oder `null` zum Ablegen. Zum Umfärben kommt dasselbe
   * Cosmetic mit Farbe, ohne Farbe sieht es aus wie modelliert.
   */
  onEquip: (slot: CosmeticSlot, id: string | null, color?: string) => void;
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

/** Was die offene Region zeigt: ihre Einträge oder das Farbrad des angelegten Cosmetics. */
interface Choice {
  region: StudioRegion;
  items: StudioItem[];
  wheel: boolean;
}

/**
 * Holt den Fokus nach dem nächsten Render auf `selector` im Popover: Beim Wechsel zwischen Popover
 * und Farbrad verschwindet der Knopf, der ihn hatte.
 */
function focusSoon(selector: string) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`#studio-pop ${selector}`)?.focus({ preventScroll: true }),
  );
}

/**
 * Die offene Region und was dort gewählt wird. Ein Klick auf das angelegte, färbbare Cosmetic macht
 * das Popover zum Farbrad, jede andere Region, „zurück“ und ein anderes Cosmetic wieder zum
 * Popover. Die Region „Farbe“ zeigt gleich das Rad der Körperfarben.
 */
function useChoice({ me, catalog, region, onRegion, onEquip, onColor }: StudioProps) {
  // Das Cosmetic, dessen Farbrad offen ist. Liegt dort etwas anderes, gilt es nicht mehr.
  const [painting, setPainting] = useState<string | null>(null);
  const open = REGIONS.find((item) => item.id === region);
  const worn = open?.slot && me.equipped[open.slot]?.key;
  const paints = open?.slot && worn === painting ? paintItems(open.slot, me, catalog) : [];
  // Die Körperfarben stehen gleich im Rad, die Cosmetics erst nach einem Klick aufs angelegte.
  const choice: Choice | null = open
    ? {
        region: open,
        items: paints.length > 0 ? paints : regionItems(open, me, catalog),
        wheel: paints.length > 0 || !open.slot,
      }
    : null;

  function changeRegion(next: StudioRegionId | null) {
    setPainting(null);
    onRegion(next);
  }

  function pick(item: StudioItem) {
    const slot = open?.slot;
    if (item.paintable) {
      setPainting(item.id);
      focusSoon(".wheel-original");
    } else if (!slot) onColor(item.id as PetColor);
    else if (item.paint === undefined) onEquip(slot, item.id);
    else if (worn) onEquip(slot, worn, item.paint ?? undefined);
  }

  /** Vom Farbrad eines Cosmetics zurück zu seinen Einträgen, beim Rad der Körperfarben ganz zu. */
  function back() {
    if (!open?.slot) {
      document.querySelector<HTMLElement>(".blob[aria-expanded='true']")?.focus();
      return changeRegion(null);
    }
    setPainting(null);
    focusSoon(".paintable");
  }

  return { choice, pick, changeRegion, back };
}

/** Das Popover oder das Farbrad der offenen Region. */
function ChoiceInk({ choice, busy, onPick, onBack }: ChoiceInkProps) {
  const { region, items } = choice;
  if (choice.wheel)
    return <PaintWheel key={`${region.id}-rad`} {...{ region, items, busy, onPick, onBack }} />;
  return <RegionPopover key={region.id} {...{ region, items, busy, onPick }} />;
}

/** Eigenschaften von {@link ChoiceInk}. */
interface ChoiceInkProps {
  choice: Choice;
  busy: boolean;
  onPick: (item: StudioItem) => void;
  onBack: () => void;
}

/** Die Vorlage für das Glas unter Popover oder Farbrad. */
function ChoiceShape({ choice }: { choice: Choice }) {
  if (choice.wheel)
    return <PaintWheelShape key={`${choice.region.id}-rad`} region={choice.region} />;
  return <PopoverShape key={choice.region.id} region={choice.region} count={choice.items.length} />;
}

/** Das Overlay über dem Jelly. */
export default function Studio(props: StudioProps) {
  const { me, busy, region, onName, onClose } = props;
  const firstBlob = useFocusWhileOpen();
  const { choice, pick, changeRegion, back } = useChoice(props);
  const worn = wornRegions(me);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || !region) return;
    // Esc schließt erst das Farbrad, dann die Region. Erst das nächste läuft bis `App.tsx` und
    // schließt das Studio.
    event.stopPropagation();
    if (choice?.wheel) return back();
    // Der Fokus kann im Popover liegen, das gleich verschwindet.
    event.currentTarget.querySelector<HTMLElement>(".blob[aria-expanded='true']")?.focus();
    changeRegion(null);
  }

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    // WebKit fokussiert Knöpfe beim Klick nicht. Ohne Fokus im Studio käme Esc nirgends an.
    target.closest("button")?.focus();
    if (target !== event.currentTarget) return;
    event.currentTarget.focus();
    changeRegion(null);
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
            onToggle={() => changeRegion(item.id === region ? null : item.id)}
          />
        ))}
        {choice ? <ChoiceInk {...{ choice, busy }} onPick={pick} onBack={back} /> : null}
        <NameTag name={me.name} busy={busy} onSave={onName} />
        <DoneButton onClose={onClose} />
      </div>
      {/* Nach `.ink`: Der Shader nimmt sie der Reihe nach, und das Popover kommt und geht als letztes. */}
      <div className="studio-shapes" aria-hidden="true">
        {REGIONS.map((item) => (
          <BlobShape key={item.id} region={item} open={item.id === region} />
        ))}
        {choice ? <ChoiceShape choice={choice} /> : null}
      </div>
    </div>
  );
}
