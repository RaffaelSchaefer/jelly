// The pet's UI building blocks. App.tsx composes them; scripts/ds-bundle.mjs ships them to the design system.
import type { ComponentProps, ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { levelProgress, PET_COLORS, type PetColor } from './pet';

export { Icon, type IconName };

const cx = (base: string, extra?: string) => extra ? `${base} ${extra}` : base;

export interface IconButtonProps extends ComponentProps<'button'> { icon: IconName; label: string }
export function IconButton({ icon, label, className, ...rest }: IconButtonProps) {
  return <button className={cx('icon-button', className)} aria-label={label} {...rest}><Icon name={icon} /></button>;
}

export function Dock({ label, children }: { label: string; children: ReactNode }) {
  return <div className="dock"><nav aria-label={label}>{children}</nav></div>;
}

export interface DockButtonProps extends ComponentProps<'button'> { icon: IconName; label: string; expanded: boolean }
export function DockButton({ icon, label, expanded, ...rest }: DockButtonProps) {
  return <button aria-label={label} aria-expanded={expanded} {...rest}><Icon name={icon} /></button>;
}

export function SpeechBubble({ children }: { children: ReactNode }) {
  return <p className="speech" role="status">{children}</p>;
}

export function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section className="panel" aria-labelledby="panel-title">
      <div className="panel-heading"><h2 id="panel-title">{title}</h2><IconButton icon="close" label="Panel schließen" onClick={onClose} /></div>
      {children}
    </section>
  );
}

export interface ActionButtonProps extends ComponentProps<'button'> { icon: IconName; title: string; detail: string; xp: number }
export function ActionButton({ icon, title, detail, xp, ...rest }: ActionButtonProps) {
  return (
    <button className="action-button" {...rest}>
      <span className="action-icon"><Icon name={icon} /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <span className="action-xp">+{xp} XP</span>
    </button>
  );
}

export function XpProgress({ name, xp }: { name: string; xp: number }) {
  const progress = levelProgress(xp);
  return (
    <div className="level-summary">
      <div className="xp-row"><span><Icon name="spark" /><strong>{name} · Level {progress.level} · {xp} XP</strong></span><span>Noch {progress.remaining} XP</span></div>
      <progress value={progress.current} max={100} aria-label={`Fortschritt zu Level ${progress.level + 1}`} />
    </div>
  );
}

export interface TextFieldProps extends ComponentProps<'input'> { id: string; label: string }
export function TextField({ id, label, ...rest }: TextFieldProps) {
  return <><label className="field-label" htmlFor={id}>{label}</label><input id={id} {...rest} /></>;
}

export function ColorChoice({ value, onChange, legend = 'Lieblingsfarbe' }: { value: PetColor; onChange: (color: PetColor) => void; legend?: string }) {
  return (
    <fieldset className="colors"><legend>{legend}</legend>
      {(Object.entries(PET_COLORS) as [PetColor, typeof PET_COLORS[PetColor]][]).map(([key, color]) => (
        <label key={key} className="color-choice" style={{ '--swatch-fill': color.hex } as React.CSSProperties}>
          <input type="radio" name="color" value={key} checked={value === key} onChange={() => onChange(key)} />
          <span className="swatch" /><span>{color.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function PrimaryButton({ className, ...rest }: ComponentProps<'button'>) {
  return <button className={cx('primary-button', className)} {...rest} />;
}

export interface SizeSliderProps { id: string; label: string; hint: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }
export function SizeSlider({ id, label, hint, value, min, max, step, disabled, onChange }: SizeSliderProps) {
  return (
    <div className="size-row">
      <div className="size-heading"><label htmlFor={id}><strong>{label}</strong><small>{hint}</small></label><output htmlFor={id}>{value} %</output></div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
      <div className="size-scale" aria-hidden="true"><span>Klein</span><span>Groß</span></div>
    </div>
  );
}

export interface ToggleRowProps { label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }
export function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
  return <label className="toggle-row"><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}

export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error" role="alert"><strong>Das hat nicht geklappt.</strong><span>{message}</span>{onRetry ? <button onClick={onRetry}>Erneut versuchen</button> : null}</div>;
}
