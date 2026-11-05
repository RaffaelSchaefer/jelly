/**
 * Panel „Einstellungen“: Pet-Größe, reduzierte Bewegung, optimierter Modus, Geräusche und ihre
 * Lautstärke. Alles bleibt auf diesem Gerät.
 *
 * @module
 */

import { PET_SIZE, VOLUME, type Settings } from "../pet";
import { PercentSlider, ToggleRow } from "../ui";

/** Eigenschaften von {@link SettingsPanel}. */
interface SettingsPanelProps {
  /** Name des Pets für den Hinweistext. */
  name: string;
  settings: Settings;
  /** Angezeigte Größe, solange der Regler bewegt wird, also eventuell noch nicht gespeichert. */
  size: number;
  /** Angezeigte Lautstärke, ebenso. */
  volume: number;
  ready: boolean;
  busy: boolean;
  onSize: (size: number) => void;
  onVolume: (volume: number) => void;
  onReducedMotion: (reducedMotion: boolean) => void;
  onOptimizedRendering: (optimizedRendering: boolean) => void;
  onSound: (sound: boolean) => void;
}

/** Schalter und Lautstärke. Abgeschaltet gibt es nichts leiser zu stellen. */
function SoundRows({
  name,
  settings,
  volume,
  ready,
  busy,
  onVolume,
  onSound,
}: Omit<SettingsPanelProps, "size" | "onSize" | "onReducedMotion" | "onOptimizedRendering">) {
  return (
    <>
      <ToggleRow
        label="Geräusche"
        hint={`${name} piepst, summt und plappert.`}
        checked={settings.sound}
        disabled={busy || !ready}
        onChange={onSound}
      />
      <PercentSlider
        id="pet-volume"
        label="Lautstärke"
        value={volume}
        min={VOLUME.min}
        max={VOLUME.max}
        step={VOLUME.step}
        disabled={!ready || !settings.sound}
        onChange={onVolume}
      />
    </>
  );
}

/** Die Einstellungen. Die Regler speichern, sobald sie ruhen (siehe `useSettingDraft`). */
export default function SettingsPanel(props: SettingsPanelProps) {
  const { name, settings, size, ready, busy, onSize, onReducedMotion, onOptimizedRendering } =
    props;
  return (
    <>
      <PercentSlider
        id="pet-size"
        label="Größe"
        hint={`So viel Platz bekommt ${name} auf deinem Desktop.`}
        value={size}
        min={PET_SIZE.min}
        max={PET_SIZE.max}
        step={PET_SIZE.step}
        ends={["Klein", "Groß"]}
        disabled={!ready}
        onChange={onSize}
      />
      <ToggleRow
        label="Weniger Bewegung"
        hint="Ruhiger Begleiter, gleiche Gesellschaft."
        checked={settings.reducedMotion}
        disabled={busy || !ready}
        onChange={onReducedMotion}
      />
      <ToggleRow
        label="Optimierter Modus"
        hint="Einfachere Oberflächen und weniger Grafikeffekte. Jelly bewegt sich weiterhin flüssig."
        checked={settings.optimizedRendering}
        disabled={busy || !ready}
        onChange={onOptimizedRendering}
      />
      <SoundRows {...props} />
    </>
  );
}
