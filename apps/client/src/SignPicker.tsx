/**
 * Das Schild am Jelly: ein Glas-Tropfen links unten am Jelly und eine Säule aus Kapseln darüber.
 *
 * Alles Glas zeichnet `scene/LiquidGlass.tsx`. Es liest die Lage der `data-liquid`-Elemente je Bild
 * ab und lässt Tropfen, Kapseln und die unsichtbare Füllung ineinanderfließen. Die Bewegung der
 * Kapseln, ihr Wölben unter dem Zeiger und ihr Rückzug liegen deshalb ganz in `signs.css`.
 *
 * @module
 */

import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";

import { shortSignLabel, signIcon, signLabel, type Catalog, type CatalogEntry } from "./pet";
import { Icon } from "./ui";
import { cx } from "./ui/cx";
import { useStagePopover } from "./useStagePopover";
import "./signs.css";

/** So lange bleibt die Säule beim Schließen im DOM. Muss zu `sign-pill-out` in `signs.css` passen. */
const EXIT_MS = 220;

/** Eigenschaften der Schild-Auswahl. */
interface SignPickerProps {
  catalog: Catalog;
  /** Das Schild, das gerade oben ist. */
  current: string | null;
  open: boolean;
  /** Läuft eine LAN, an der das Jelly teilnimmt? Sonst gibt es nichts zu wählen. */
  allowed: boolean;
  disabled: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Hebt ein Schild oder senkt es mit `null`. `true`, wenn es geklappt hat. */
  onPick: (key: string | null) => Promise<boolean>;
  /** Was das Jelly zur Probe zeigt. `null` heißt: das, was wirklich oben ist. */
  onPreview: (key: string | null) => void;
}

/** Ob die Säule im DOM ist: solange sie offen ist und kurz danach, für ihren Rückzug. */
function useLingering(open: boolean) {
  const [lingering, setLingering] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setLingering(!open);
  }
  useEffect(() => {
    if (!lingering) return;
    const timer = window.setTimeout(() => setLingering(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [lingering]);
  return open || lingering;
}

/** Eigenschaften von {@link SignPill}. */
interface SignPillProps {
  entry: CatalogEntry;
  /** Platz in der Säule von oben. */
  index: number;
  count: number;
  selected: boolean;
  /** Bekommt beim Öffnen den Fokus. */
  first: boolean;
  disabled: boolean;
  onPick: (key: string | null) => void;
  onPreview: (key: string | null) => void;
}

/**
 * Eine Kapsel. Die gewählte trägt einen schillernden Ring und ein ×, ein Klick senkt das Schild.
 *
 * Gesperrt wird wie im Studio mit `aria-disabled`, damit die Kapsel während des Aufrufs den Fokus
 * behält.
 */
function SignPill({
  entry,
  index,
  count,
  selected,
  first,
  disabled,
  onPick,
  onPreview,
}: SignPillProps) {
  const { key, label } = entry;
  const stagger = { "--rise": count - 1 - index, "--sink": index } as CSSProperties;
  return (
    <button
      type="button"
      className="sign-pill"
      style={stagger}
      data-liquid
      data-key={key}
      data-first={first || undefined}
      aria-label={selected ? `${label}, Schild senken` : label}
      aria-pressed={selected}
      aria-disabled={disabled}
      data-sound={selected ? "close" : "select"}
      onPointerEnter={() => onPreview(selected ? null : key)}
      onClick={() => onPick(selected ? null : key)}
    >
      <Icon name={signIcon(key)} />
      <span>{shortSignLabel(label)}</span>
      {selected ? (
        <span className="sign-lower">
          <Icon name="close" />
        </span>
      ) : null}
    </button>
  );
}

/** Pfeiltasten wandern durch die Säule, an den Enden geht es auf der anderen Seite weiter. */
function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const pills = [...event.currentTarget.querySelectorAll<HTMLElement>(".sign-pill")];
  const position = pills.indexOf(event.target as HTMLElement);
  pills[(position + step + pills.length) % pills.length]?.focus();
}

/** Eigenschaften von {@link SignColumn}. */
type SignColumnProps = Omit<SignPickerProps, "onToggle" | "onClose" | "onPick"> & {
  onPick: (key: string | null) => void;
};

/** Die Säule: Überschrift und Kapseln, ohne laufende LAN nur ein Hinweis. */
function SignColumn(props: SignColumnProps) {
  const { catalog, current, open, allowed, disabled, onPick, onPreview } = props;
  const entries = catalog.signs;
  const known = signLabel(current, catalog) !== null;
  // Die Vorschau hängt nicht am Fokus: WebKit meldet `:focus-visible` auch nach einem Mausklick.
  function previewFocused(event: KeyboardEvent<HTMLDivElement>) {
    const key = (event.target as HTMLElement).dataset.key;
    if (key && event.key !== "Enter" && event.key !== " ") {
      onPreview(key === current ? null : key);
    }
  }
  return (
    <div
      id="sign-pop"
      className="sign-pop"
      role="group"
      aria-label="Schild auswählen"
      data-open={open || undefined}
      onPointerLeave={() => onPreview(null)}
      onKeyDown={moveFocus}
      onKeyUp={previewFocused}
    >
      {allowed && entries.length > 0 ? (
        <>
          <span className="sign-fill" data-liquid />
          <p className="sign-caption" aria-hidden="true">
            Ich suche …
          </p>
          {entries.map((entry, index) => (
            <SignPill
              key={entry.key}
              entry={entry}
              index={index}
              count={entries.length}
              selected={entry.key === current}
              first={known ? entry.key === current : index === 0}
              {...{ disabled, onPick, onPreview }}
            />
          ))}
        </>
      ) : (
        <p className="sign-note" data-liquid>
          {allowed ? "Keine Schilder verfügbar" : "Nur während einer LAN"}
        </p>
      )}
    </div>
  );
}

/** Der Tropfen und, solange offen, die Säule darüber. */
export default function SignPicker(props: SignPickerProps) {
  const { catalog, current, open, disabled, onToggle, onClose, onPick } = props;
  const { container, trigger, close } = useStagePopover(open, onClose, ".sign-pop [data-first]");
  const rendered = useLingering(open);
  const label = signLabel(current, catalog);
  const name = label ? `Schild: ${label}` : "Schild";
  function pick(key: string | null) {
    if (disabled) return;
    void onPick(key).then((changed) => {
      if (changed) close();
    });
  }
  return (
    <div className="sign-controls" ref={container}>
      <button
        ref={trigger}
        type="button"
        className={cx("sign-trigger", label ? "raised" : undefined)}
        data-liquid="calm"
        data-tip={open ? undefined : name}
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? "sign-pop" : undefined}
        onClick={open ? close : onToggle}
      >
        <Icon name="sign" />
      </button>
      {rendered ? <SignColumn {...props} onPick={pick} /> : null}
    </div>
  );
}
