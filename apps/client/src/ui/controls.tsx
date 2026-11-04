/**
 * Allgemeine Bedienelemente: Knöpfe, Dock, Panel, Tabs und Formularfelder.
 *
 * Teil des Design-Systems. `scripts/ds-bundle.mjs` liefert jede exportierte Funktion aus
 * `src/ui/*.tsx` als Komponente aus. Hier also nur Komponenten exportieren.
 *
 * @module
 */

import { useState, type ComponentProps, type ReactNode } from "react";

import { PET_COLORS, speechSyllables, type PetColor } from "../pet";
import { cx } from "./cx";
import Icon, { type IconName } from "./Icon";

/** Eigenschaften von {@link IconButton}. */
export interface IconButtonProps extends ComponentProps<"button"> {
  icon: IconName;
  /** Zugänglicher Name, da der Knopf nur ein Icon zeigt. */
  label: string;
}

/** Runder Knopf nur mit Icon, zum Beispiel Schließen oder Verschieben. */
export function IconButton({ icon, label, className, ...rest }: IconButtonProps) {
  return (
    <button className={cx("icon-button", className)} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/** Die Glas-Leiste unter dem Pet. `label` benennt die Navigation für Screenreader. */
export function Dock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dock">
      <nav aria-label={label}>{children}</nav>
    </div>
  );
}

/** Eigenschaften von {@link DockButton}. */
export interface DockButtonProps extends ComponentProps<"button"> {
  icon: IconName;
  label: string;
  /** Ob das zugehörige Panel gerade offen ist. */
  expanded: boolean;
}

/** Knopf im {@link Dock}, öffnet und schließt ein Panel. */
export function DockButton({ icon, label, expanded, ...rest }: DockButtonProps) {
  return (
    <button aria-label={label} aria-expanded={expanded} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/**
 * Die sichtbare Blase. Das Glas zeichnet `scene/LiquidGlass.tsx` aus ihrer Lage und der ihres
 * Schwanzes, ohne WebGL bleibt ein fester Hintergrund.
 */
function SpeechDrop({ text, saidAt }: { text: string; saidAt?: number }) {
  // Einmal je Text: Spätere Renderdurchläufe dürfen das laufende Aufdecken nicht verschieben. Wer erst
  // nach dem Sprechen auftaucht, etwa hinter einem Panel hervor, zeigt den Text gleich ganz.
  const [parts] = useState(() => {
    const elapsed = saidAt === undefined ? Infinity : (performance.now() - saidAt) / 1000;
    return speechSyllables(text).map(({ text: part, at }) => ({
      part,
      delay: Math.max(0, at - elapsed),
    }));
  });
  return (
    <p className="speech" aria-hidden="true" data-liquid="calm">
      {parts.map(({ part, delay }, index) => (
        <span key={index} className="speech-part" style={{ animationDelay: `${delay}s` }}>
          {part}
        </span>
      ))}
      <span className="speech-tail" data-liquid />
    </p>
  );
}

/**
 * Sprechblase über dem Pet. Screenreader lesen Änderungen vor (`role="status"`), auch wenn die
 * Blase gerade nicht zu sehen ist.
 *
 * @param saidAt - Seit wann das Pet den Text spricht, auf der Uhr von `performance.now()`. Solange
 *   erscheint er Silbe für Silbe. Ohne Wert steht er gleich da.
 * @param hidden - Nur die Meldung für Screenreader, keine Blase.
 */
export function SpeechBubble({
  text,
  saidAt,
  hidden = false,
}: {
  text: string;
  saidAt?: number;
  hidden?: boolean;
}) {
  return (
    <>
      <p className="sr-only" role="status">
        {text}
      </p>
      {hidden ? null : <SpeechDrop key={text} text={text} saidAt={saidAt} />}
    </>
  );
}

/** Glas-Panel über dem Dock, mit Überschrift und, wenn `onClose` da ist, Schließen-Knopf. */
export function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="panel" aria-labelledby="panel-title">
      <div className="panel-heading">
        <h2 id="panel-title">{title}</h2>
        {onClose ? <IconButton icon="close" label="Panel schließen" onClick={onClose} /> : null}
      </div>
      {children}
    </section>
  );
}

/** Reiterleiste. `T` ist die Vereinigung der Reiter-IDs, damit `onChange` getypt bleibt. */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Hauptaktion eines Panels in Akzentfarbe. */
export function PrimaryButton({ className, ...rest }: ComponentProps<"button">) {
  return <button className={cx("primary-button", className)} {...rest} />;
}

/** Fehlermeldung unter dem Pet. Mit `onRetry` gibt es einen Knopf zum erneuten Versuchen. */
export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error" role="alert">
      <strong>Das hat nicht geklappt.</strong>
      <span>{message}</span>
      {onRetry ? <button onClick={onRetry}>Erneut versuchen</button> : null}
    </div>
  );
}

/** Eigenschaften von {@link TextField}. */
export interface TextFieldProps extends ComponentProps<"input"> {
  /** Verknüpft Beschriftung und Eingabe. */
  id: string;
  label: string;
}

/** Beschriftetes Textfeld. */
export function TextField({ id, label, ...rest }: TextFieldProps) {
  return (
    <>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} {...rest} />
    </>
  );
}

/** Auswahl der Farbvariante als Radio-Gruppe mit Farbfeldern. */
export function ColorChoice({
  value,
  onChange,
  legend = "Lieblingsfarbe",
}: {
  value: PetColor;
  onChange: (color: PetColor) => void;
  legend?: string;
}) {
  return (
    <fieldset className="colors">
      <legend>{legend}</legend>
      {(Object.entries(PET_COLORS) as [PetColor, (typeof PET_COLORS)[PetColor]][]).map(
        ([key, color]) => (
          <label
            key={key}
            className="color-choice"
            style={{ "--swatch-fill": color.hex } as React.CSSProperties}
          >
            <input
              type="radio"
              name="color"
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
            />
            <span className="swatch" />
            <span>{color.label}</span>
          </label>
        ),
      )}
    </fieldset>
  );
}

/** Eigenschaften von {@link PercentSlider}. */
export interface PercentSliderProps {
  id: string;
  label: string;
  /** Erklärung unter der Beschriftung. */
  hint?: string;
  /** Aktueller Wert in Prozent. */
  value: number;
  min: number;
  max: number;
  step: number;
  /** Beschriftung der beiden Enden, etwa „Klein“ und „Groß“. */
  ends?: readonly [string, string];
  disabled?: boolean;
  onChange: (value: number) => void;
}

/** Schieberegler mit Prozentanzeige, etwa für Pet-Größe und Lautstärke. */
export function PercentSlider({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  ends,
  disabled,
  onChange,
}: PercentSliderProps) {
  return (
    <div className="size-row">
      <div className="size-heading">
        <label htmlFor={id}>
          <strong>{label}</strong>
          {hint ? <small>{hint}</small> : null}
        </label>
        <output htmlFor={id}>{value} %</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {ends ? (
        <div className="size-scale" aria-hidden="true">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Eigenschaften von {@link ToggleRow}. */
export interface ToggleRowProps {
  label: string;
  /** Erklärung unter der Beschriftung. */
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Einstellung zum An- und Ausschalten, als Zeile mit Beschriftung. */
export function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
