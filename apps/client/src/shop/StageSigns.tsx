/**
 * Schilder vor der Szene: „Geschlossen“ oben links, solange keine LAN läuft, das Schildchen „Zur
 * Probe“ unten rechts, solange das Jelly etwas zur Anprobe trägt (ohne Modell „Ohne Abbild“), und
 * die unsichtbare Fläche über dem Zauberer, die ihn anstupst.
 *
 * Das Anstupsen hört `shop/useWizardSenses.ts` über `[data-wizard-poke]`, darum hat der Knopf hier
 * keinen eigenen Handler.
 *
 * @module
 */

import { COSMETIC_MODEL_KEYS } from "@jelly/scene/cosmetic-keys";
import { memo, useState, type CSSProperties } from "react";

import type { Equipped } from "../pet";

import { cssPercent, STAGE_ZONES, tryOnLabel } from "../pet/shopStage";

/** Wo man den Zauberer anstupst. */
const POKE_STYLE: CSSProperties = {
  left: cssPercent(STAGE_ZONES.poke.left),
  top: cssPercent(STAGE_ZONES.poke.top),
  width: cssPercent(STAGE_ZONES.poke.right - STAGE_ZONES.poke.left),
  height: cssPercent(STAGE_ZONES.poke.bottom - STAGE_ZONES.poke.top),
};

/** Das Schild an zwei Schnüren: Anprobieren geht auch ohne LAN, kaufen nicht. */
const CLOSED_SIGN = (
  <div className="stage-sign" aria-hidden="true">
    <span className="sign-board">
      <strong>Geschlossen</strong>
      <em>Anprobe erlaubt</em>
    </span>
  </div>
);

/**
 * Was das Schildchen zur Probe sagt. Beim Ausblenden bleibt der letzte Text stehen, sonst wäre es
 * leer, während es verblasst.
 */
function useTagText(label: string | null) {
  const [last, setLast] = useState(label);
  if (label !== null && label !== last) setLast(label);
  return label ?? last;
}

/** Eigenschaften von {@link StageSigns}. */
export interface StageSignsProps {
  /** Ob eine LAN läuft. Ohne sie hängt das Schild „Geschlossen“. */
  open: boolean;
  /** Was das Jelly zeigt, samt dem Teil zur Probe. */
  shown: Equipped;
  /** Was es wirklich trägt. */
  worn: Equipped;
}

/** Schilder und Stupsfläche. */
function StageSigns({ open, shown, worn }: StageSignsProps) {
  const label = tryOnLabel(shown, worn, COSMETIC_MODEL_KEYS);
  const text = useTagText(label);
  return (
    <div className="stage-signs">
      {open ? null : CLOSED_SIGN}
      <p className="stage-tag" aria-hidden="true" data-on={label ? "" : undefined}>
        <span className="tag-card">{text}</span>
      </p>
      <button
        type="button"
        className="stage-wizard-poke"
        style={POKE_STYLE}
        data-wizard-poke=""
        data-sound="none"
        aria-label="Zauberer anstupsen"
      />
    </div>
  );
}

export default memo(StageSigns);
