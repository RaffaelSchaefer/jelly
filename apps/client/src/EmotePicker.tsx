/**
 * Emotes direkt am Jelly: ein Glas-Tropfen und eine nach innen geöffnete Auswahl.
 *
 * @module
 */

import { EMOTE_GLYPHS, isEmoteKey } from "@jelly/scene/emotes";

import type { CatalogEntry } from "./pet";

import { useStagePopover } from "./useStagePopover";
import "./emotes.css";

/** Eigenschaften der Emote-Auswahl. */
interface EmotePickerProps {
  entries: CatalogEntry[];
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (key: string) => Promise<boolean>;
}

/**
 * Der Auslöser und seine sechs Gesten; die Glasflächen liest `LiquidGlass` direkt ab. Die Auswahl
 * bleibt auch geschlossen im DOM: So behält das Glas des Schilds seinen Platz im Shader.
 */
export default function EmotePicker({
  entries,
  open,
  disabled,
  onToggle,
  onClose,
  onPick,
}: EmotePickerProps) {
  const { container, trigger, close } = useStagePopover(open, onClose, ".emote-pop button");
  async function pick(key: string) {
    if (!disabled && (await onPick(key))) close();
  }
  return (
    <div className="emote-controls" ref={container}>
      <button
        ref={trigger}
        type="button"
        className="emote-trigger"
        data-liquid
        data-tip="Emotes"
        aria-label="Emotes"
        aria-expanded={open}
        aria-controls={open ? "emote-pop" : undefined}
        onClick={open ? close : onToggle}
      >
        <span aria-hidden="true">☺</span>
      </button>
      <div
        id="emote-pop"
        className="emote-pop"
        role="group"
        aria-label="Emote auswählen"
        data-liquid
        hidden={!open}
      >
        {entries.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-disabled={disabled}
            data-tip={label}
            onClick={() => void pick(key)}
          >
            {isEmoteKey(key) ? <span aria-hidden="true">{EMOTE_GLYPHS[key]}</span> : label}
          </button>
        ))}
        {entries.length === 0 ? <span>Keine Emotes verfügbar.</span> : null}
      </div>
    </div>
  );
}
