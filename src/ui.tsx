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

/** Level bar; `next` names the next reward ("Bei Level 5: Pixel-Brille"). */
export function XpProgress({ name, xp, next }: { name: string; xp: number; next?: string }) {
  const progress = levelProgress(xp);
  return (
    <div className="level-summary">
      <div className="xp-row"><span><Icon name="spark" /><strong>{name} · Level {progress.level}</strong></span><span>{progress.current} / 100 XP</span></div>
      <progress value={progress.current} max={100} aria-label={`Fortschritt zu Level ${progress.level + 1}`} />
      <div className="xp-row xp-next">{next ? <span><Icon name="lock" />{next}</span> : <span />}<span>Noch {progress.remaining} XP</span></div>
    </div>
  );
}

export function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => <button key={tab.id} role="tab" aria-selected={tab.id === value} onClick={() => onChange(tab.id)}>{tab.label}</button>)}
    </div>
  );
}

/** One line of the XP log. `live` marks a source that is counting right now. */
export function XpEntry({ icon, title, detail, xp, tag, live }: { icon: IconName; title: string; detail: string; xp: number; tag: string; live?: boolean }) {
  return (
    <div className={cx('xp-entry', live ? 'live' : undefined)}>
      <span className="action-icon"><Icon name={icon} /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <span className="xp-entry-end"><span className="action-xp">+{xp} XP</span><small>{live ? <span className="status-dot" /> : null}{tag}</small></span>
    </div>
  );
}

/** A self-report button; `wait` minutes > 0 shows the cooldown instead of the XP. */
export interface ReportButtonProps extends ComponentProps<'button'> { icon: IconName; title: string; xp: number; wait: number }
export function ReportButton({ icon, title, xp, wait, ...rest }: ReportButtonProps) {
  return (
    <button className="report-button" {...rest}>
      <span className="action-icon"><Icon name={icon} /></span>
      <span><strong>{title}</strong>{wait > 0 ? <small>Wieder in {wait} min</small> : <span className="action-xp">+{xp} XP</span>}</span>
    </button>
  );
}

export interface CosmeticTileProps extends ComponentProps<'button'> { icon: IconName; name: string; state: 'equipped' | 'unlocked' | 'locked'; note: string; selected: boolean }
export function CosmeticTile({ icon, name, state, note, selected, ...rest }: CosmeticTileProps) {
  return (
    <button className={cx('cosmetic-tile', state)} aria-pressed={selected} {...rest}>
      <span className="cosmetic-preview"><Icon name={icon} /></span>
      <strong>{name}</strong>
      <small>{state === 'equipped' ? <Icon name="check" /> : state === 'locked' ? <Icon name="lock" /> : null}{note}</small>
    </button>
  );
}

export function AchievementRow({ icon, title, detail, value, goal, unit = '', done }: { icon: IconName; title: string; detail: string; value: number; goal: number; unit?: string; done: boolean }) {
  return (
    <div className={cx('achievement', done ? 'done' : undefined)}>
      <span className="achievement-badge"><Icon name={icon} /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <span className="achievement-end">
        {done ? <span className="achievement-done"><Icon name="check" />Geschafft</span> : <>
          <small>{value} / {goal}{unit ? ` ${unit}` : ''}</small>
          <progress value={value} max={goal} aria-label={`Fortschritt ${title}`} />
        </>}
      </span>
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
