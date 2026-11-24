/**
 * Schilder vor der Szene: „Geschlossen“ oben links, solange keine LAN läuft, das Schildchen „Zur
 * Probe“ unten rechts, solange das Jelly etwas zur Anprobe trägt (ohne Modell „Ohne Abbild“), das
 * Schildchen „Hut verliehen“ (`HatSign.tsx`), solange ein Jelly Funkelbarts Hut trägt, und die
 * unsichtbaren Flächen über dem Zauberer: eine stupst ihn an, die über Hut und Bart nerven ihn.
 *
 * Stupsen und Nerven hört `shop/useWizardSenses.ts` über `[data-wizard-poke]` und
 * `[data-wizard-tease]`, darum haben die Knöpfe hier keinen eigenen Handler. Mit `data-gaze` schaut
 * er auf, sobald der Zeiger über Hut oder Bart liegt.
 *
 * @module
 */

import { COSMETIC_MODEL_KEYS } from "@jelly/scene/cosmetic-keys";
import { memo, useState, type CSSProperties } from "react";

import type { Equipped, Me } from "../pet";

import {
  cssPercent,
  STAGE_ZONES,
  TEASE_SPOTS,
  tryOnLabel,
  wizardRectStyle,
} from "../pet/shopStage";
import HatSign from "./HatSign";

/** Wo man den Zauberer anstupst. */
const POKE_STYLE: CSSProperties = {
  left: cssPercent(STAGE_ZONES.poke.left),
  top: cssPercent(STAGE_ZONES.poke.top),
  width: cssPercent(STAGE_ZONES.poke.right - STAGE_ZONES.poke.left),
  height: cssPercent(STAGE_ZONES.poke.bottom - STAGE_ZONES.poke.top),
};

/** Wo man nach seinem Hut greift und an seinem Bart zieht. Sie liegen über der Stupsfläche. */
const TEASE_BUTTONS = (
  <>
    <button
      type="button"
      className="stage-wizard-poke stage-wizard-tease"
      style={wizardRectStyle(TEASE_SPOTS.hat)}
      data-wizard-tease="hat"
      data-gaze="wizard"
      data-sound="none"
      aria-label="Hut des Zauberers klauen"
    />
    <button
      type="button"
      className="stage-wizard-poke stage-wizard-tease"
      style={wizardRectStyle(TEASE_SPOTS.beard)}
      data-wizard-tease="beard"
      data-gaze="wizard"
      data-sound="none"
      aria-label="Am Bart des Zauberers ziehen"
    />
  </>
);

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
  /** Der Stand: was das Jelly wirklich trägt und wer den Hut des Zauberers hat. */
  me: Me;
  /** `server_time - Date.now()` aus `useGameState`. */
  offset: number;
}

/** Schilder, Stupsfläche und die Flächen über Hut und Bart. */
function StageSigns({ open, shown, me, offset }: StageSignsProps) {
  const label = tryOnLabel(shown, me.equipped, COSMETIC_MODEL_KEYS);
  const text = useTagText(label);
  return (
    <div className="stage-signs">
      {open ? null : CLOSED_SIGN}
      <HatSign me={me} offset={offset} />
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
      {TEASE_BUTTONS}
    </div>
  );
}

export default memo(StageSigns);
