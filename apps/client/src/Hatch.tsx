/**
 * Der Einstieg als Moment auf der Bühne statt als Formular: Das Jelly sitzt in einem Ei aus
 * flüssigem Glas, fragt selbst nach Name, Farbe und Code und schlüpft, sobald der Code gilt.
 *
 * Das Ei zeichnet der Glas-Shader wie die übrigen Tropfen, hier steht nur seine Vorlage. Was das
 * Jelly sagt, steht in `pet/hatch.ts`. Licht und Spritzer teilt es sich mit dem Aufstieg
 * (`LevelUp.tsx`).
 *
 * @module
 */

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";

import type { ActiveEmote } from "./useEmotes";
import type { PetGame } from "./usePet";

import { BoomBehind, BoomFront, BOOM_STYLE, CAPSULE_READY_MS } from "./LevelUp";
import {
  hatchBack,
  hatchesNew,
  hatchLine,
  hatchStep,
  NAME_MAX_LENGTH,
  PET_COLORS,
  type HatchStep,
  type PetColor,
} from "./pet";
import JellySwatch from "./studio/JellySwatch";
import { Icon, PrimaryButton } from "./ui";
import "./hatch.css";

/** Die Farben in der Reihenfolge der Auswahl. */
const COLORS = Object.keys(PET_COLORS) as PetColor[];

/**
 * Das Jelly winkt, sobald der Einstieg beginnt. Läuft am Spielstand vorbei wie der Jubel beim
 * Aufstieg: So bleibt die Sprechblase bei ihrer Frage.
 */
export function useHatchWave(joining: boolean) {
  const [wave, setWave] = useState<ActiveEmote | null>(null);
  if (joining !== (wave !== null)) {
    setWave(joining ? { key: "wave", label: "Winken", startedAt: performance.now() } : null);
  }
  return wave;
}

/** Eigenschaften von {@link Hatch}. */
export interface HatchProps {
  game: PetGame;
  /** Die Farbe im Entwurf. Sie liegt in `App.tsx`, denn auch Szene und Theme folgen ihr. */
  color: PetColor;
  onColor: (color: PetColor) => void;
}

/** Schritt, Entwürfe und was das Jelly dazu sagt. */
function useHatchFlow({ game, color, onColor }: HatchProps) {
  const [wanted, setWanted] = useState<HatchStep>("name");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [picked, setPicked] = useState<PetColor | null>(null);
  const [accepted, setAccepted] = useState(false);
  const step = hatchStep(wanted, game.game);
  const trimmed = name.trim();
  const line = hatchLine({
    step,
    game: game.game,
    name: trimmed,
    picked,
    error: game.error,
    accepted,
  });

  const { busy, error, hatching, hopAndSay, setMessage } = game;
  // Vor dem Zeichnen, sonst stünde für ein Bild der alte Satz in der Blase. Während eines Aufrufs bleibt
  // der letzte Satz stehen, den ersten nach dem Schlüpfen sagt `usePet.ts`. Nur Fehler sagt es im Stehen.
  useLayoutEffect(() => {
    if (busy || hatching) return;
    if (error) setMessage(line);
    else hopAndSay(line);
  }, [line, busy, error, hatching, hopAndSay, setMessage]);

  function go(next: HatchStep) {
    game.clearError();
    // Der Code der LAN gehört nicht ins Feld für den Wiederherstellungs-Code, und umgekehrt.
    if (next === "recover" || step === "recover") setCode("");
    setWanted(next);
  }

  /** Ein gültiger Code ist verbraucht, auch wenn die LAN danach noch einen eigenen verlangt. */
  async function settle(valid: Promise<boolean>) {
    if (!(await valid)) return;
    setCode("");
    setWanted("name");
    setAccepted(true);
  }

  function pick(next: PetColor) {
    setPicked(next);
    onColor(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step === "name") go("color");
    else if (step === "color") go("code");
    else if (step === "recover") void settle(game.recoverAccess(code.trim()));
    else if (hatchesNew(game.game)) void settle(game.redeemAccess(code.trim(), trimmed, color));
    else void settle(game.redeemAccess(code.trim()));
  }

  return { step, name, setName, code, setCode, picked, trimmed, go, pick, submit };
}

/** Was {@link useHatchFlow} liefert. */
type HatchFlow = ReturnType<typeof useHatchFlow>;

/** Ob es im Schritt schon weitergehen kann. */
function canGoOn({ step, code, trimmed }: HatchFlow, game: PetGame) {
  if (step === "color") return true;
  if (step === "name") return trimmed !== "";
  if (!code.trim() || game.busy) return false;
  return step === "recover" || !hatchesNew(game.game) || trimmed !== "";
}

/** Wie der runde Knopf im Schritt heißt. */
function nextLabel(step: HatchStep, isNew: boolean) {
  if (step === "name" || step === "color") return "Weiter";
  if (step === "recover") return "Konto zurückholen";
  return isNew ? "Schlüpfen" : "Einlösen";
}

/**
 * Holt beim Wechsel des Schritts und nach einem Fehler den Fokus in die Kapsel: Wer den Knopf
 * benutzt hat, verliert ihn sonst, sobald der Knopf während des Aufrufs gesperrt ist.
 */
function useStepFocus(step: HatchStep, error: string) {
  const capsule = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const form = capsule.current;
    const field =
      form?.querySelector<HTMLInputElement>("input:checked") ?? form?.querySelector("input");
    field?.focus({ preventScroll: true });
  }, [step, error]);
  return capsule;
}

/** Die drei Farben als kleine Jellies. Jede Wahl färbt sofort das echte Jelly und die Oberfläche. */
function ColorPicker({ color, onPick }: { color: PetColor; onPick: (color: PetColor) => void }) {
  return (
    <fieldset className="hatch-colors">
      <legend className="sr-only">Lieblingsfarbe</legend>
      {COLORS.map((key) => (
        <label key={key} className="hatch-color" title={PET_COLORS[key].label}>
          <input
            className="sr-only"
            type="radio"
            name="hatch-color"
            value={key}
            checked={color === key}
            onChange={() => onPick(key)}
          />
          <JellySwatch id={`hatch-${key}`} palette={PET_COLORS[key]} />
          <span className="sr-only">{PET_COLORS[key].label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Ein Textfeld der Kapsel. Die sichtbare Frage stellt das Jelly. */
function HatchField({
  label,
  placeholder = label,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  maxLength?: number;
  onChange: (value: string) => void;
}) {
  return (
    <input
      className="hatch-input"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Der Inhalt der Kapsel im jeweiligen Schritt. */
function StepField({ flow, game, color }: { flow: HatchFlow; game: PetGame; color: PetColor }) {
  const { step, name, setName, code, setCode, pick } = flow;
  if (step === "name") {
    return (
      <HatchField
        label="Wie heißt dein Begleiter?"
        placeholder="Name eingeben"
        value={name}
        maxLength={NAME_MAX_LENGTH}
        onChange={setName}
      />
    );
  }
  if (step === "color") return <ColorPicker color={color} onPick={pick} />;
  const lanName = game.game.lan.current?.name;
  const label = lanName ? `Code für ${lanName}` : "Dein Code";
  return (
    <>
      <span className="hatch-ticket">
        <Icon name="ticket" />
      </span>
      <HatchField
        label={step === "code" ? label : "Wiederherstellungs-Code"}
        value={code}
        onChange={setCode}
      />
    </>
  );
}

/**
 * Die eine Kapsel an der Stelle des Docks. Sie bleibt dieselbe Fläche und fließt von Schritt zu
 * Schritt.
 */
function HatchCapsule({ flow, game, color }: { flow: HatchFlow; game: PetGame; color: PetColor }) {
  const { step, go, submit } = flow;
  const capsule = useStepFocus(step, game.error);
  const back = hatchBack(step, game.game);
  const label = nextLabel(step, hatchesNew(game.game));
  return (
    <form
      ref={capsule}
      className="hatch-capsule"
      data-liquid="calm"
      data-step={step}
      data-back={back ? "" : undefined}
      data-error={game.error ? "" : undefined}
      aria-busy={game.busy}
      onSubmit={submit}
    >
      {back ? (
        <button
          className="hatch-back"
          type="button"
          aria-label="Zurück"
          title="Zurück"
          onClick={() => go(back)}
        >
          <Icon name="back" />
        </button>
      ) : null}
      <StepField flow={flow} game={game} color={color} />
      <button
        className="hatch-next"
        type="submit"
        aria-label={label}
        title={label}
        disabled={!canGoOn(flow, game)}
      >
        <Icon name="next" />
      </button>
    </form>
  );
}

/** Die Glas-Kapsel nach dem Schlüpfen: Sie begrüßt das Jelly und gibt die Bühne frei. */
function HatchWelcome({ game }: { game: PetGame }) {
  const go = useRef<HTMLButtonElement>(null);
  // Erst, wenn er zu sehen ist: Wer noch einmal Enter drückt, überspränge sonst das ganze Schlüpfen.
  useEffect(() => {
    const timer = window.setTimeout(
      () => go.current?.focus({ preventScroll: true }),
      CAPSULE_READY_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);
  const { me, lan } = game.game;
  return (
    <div className="levelup-capsule" data-liquid="calm">
      <span className="levelup-seal">
        <Icon name="spark" />
      </span>
      <span className="levelup-reward">
        <strong>Willkommen, {me?.name ?? "Jelly"}!</strong>
        <small>{lan.current?.name ?? "Bis zur nächsten LAN"}</small>
      </span>
      <PrimaryButton ref={go} className="levelup-go" data-sound="success" onClick={game.endHatch}>
        Los geht’s
      </PrimaryButton>
    </div>
  );
}

/** Der ganze Einstieg, von der ersten Frage bis zum Schlüpfen. */
export default function Hatch(props: HatchProps) {
  const { game, color } = props;
  const { hatching } = game;
  const flow = useHatchFlow(props);
  // Einmal neu, bleibt es bis zum Schlüpfen im Ei: Mit dem letzten Code gibt es schon ein Konto, und
  // ein zurückgeholtes Konto braucht oft noch den Code der LAN. Das Ei soll trotzdem erst dann platzen.
  const isNew = hatchesNew(game.game);
  const [inEgg, setInEgg] = useState(isNew);
  if (isNew && !inEgg) setInEgg(true);
  return (
    <section
      className="levelup hatch"
      style={BOOM_STYLE}
      aria-labelledby="hatch-title"
      data-hatching={hatching ? "" : undefined}
      data-busy={game.busy ? "" : undefined}
    >
      <h2 id="hatch-title" className="sr-only">
        Willkommen auf der LAN.
      </h2>
      <div className="levelup-back">
        <span className="levelup-bed" />
        {/* Der Schlüssel startet die Welle je Farbe neu, ohne Wahl gibt es noch keine. */}
        {flow.picked ? <span key={flow.picked} className="levelup-wave hatch-ripple" /> : null}
        {hatching ? <BoomBehind /> : null}
      </div>
      <div className="levelup-front">
        {/* Immer im DOM, auch ohne Fläche: Die ersten beiden Plätze im Shader bleiben für sich. */}
        <span className="hatch-egg" data-liquid="thin" hidden={!inEgg} />
        {hatching ? (
          <HatchWelcome game={game} />
        ) : (
          <HatchCapsule flow={flow} game={game} color={color} />
        )}
        {hatching || flow.step !== "name" ? null : (
          <button
            type="button"
            className="text-button hatch-lost"
            onClick={() => flow.go("recover")}
          >
            Konto verloren?
          </button>
        )}
        {hatching ? <BoomFront /> : null}
      </div>
    </section>
  );
}
