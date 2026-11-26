/**
 * Panel „Einstellungen“: Pet-Größe, reduzierte Bewegung, optimierter Modus, Bildrate, was ohne
 * Mauszeiger zu sehen bleibt, Vordergrund, Geräusche und ihre Lautstärke. Alles bleibt auf diesem
 * Gerät.
 *
 * @module
 */

import {
  FRAME_RATE,
  frameRateText,
  PET_SIZE,
  stopToFrameLimit,
  UNLIMITED_STOP,
  VOLUME,
  type IdleView,
  type Settings,
} from "../pet";
import { ChoiceRow, PercentSlider, ToggleRow } from "../ui";

/** Eigenschaften von {@link SettingsPanel}. */
interface SettingsPanelProps {
  /** Name des Pets für den Hinweistext. */
  name: string;
  settings: Settings;
  /**
   * Wirksamer Wert von „Weniger Bewegung“: die Einstellung oder sonst der Wunsch des
   * Betriebssystems.
   */
  reducedMotion: boolean;
  /** Angezeigte Größe, solange der Regler bewegt wird, also eventuell noch nicht gespeichert. */
  size: number;
  /** Angezeigte Lautstärke, ebenso. */
  volume: number;
  /** Angezeigte Stellung des Bildraten-Reglers, ebenso. */
  frameStop: number;
  ready: boolean;
  busy: boolean;
  onSize: (size: number) => void;
  onVolume: (volume: number) => void;
  onFrameStop: (stop: number) => void;
  onReducedMotion: (reducedMotion: boolean) => void;
  onOptimizedRendering: (optimizedRendering: boolean) => void;
  onSound: (sound: boolean) => void;
  onIdleView: (idleView: IdleView) => void;
  onAlwaysOnTop: (alwaysOnTop: boolean) => void;
}

/** Die große Anzeige der Bildrate. */
function FrameRateValue({ limit }: { limit: number | null }) {
  if (limit === null) return <span className="frame-rate-value frame-rate-unlimited">∞</span>;
  return (
    <span className="frame-rate-value">
      {limit}
      <small> FPS</small>
    </span>
  );
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
}: Pick<
  SettingsPanelProps,
  "name" | "settings" | "volume" | "ready" | "busy" | "onVolume" | "onSound"
>) {
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

/** Die Stufen von „Knöpfe ausblenden“. */
const IDLE_VIEWS = [
  { id: "all", label: "Alles zeigen" },
  { id: "bubble", label: "Nur Sprechblase" },
  { id: "none", label: "Alles weg" },
] as const satisfies readonly { id: IdleView; label: string }[];

/** Wie sich das Fenster auf dem Desktop verhält: was es zeigt und ob es über allem liegt. */
function WindowRows({
  name,
  settings,
  ready,
  busy,
  onIdleView,
  onAlwaysOnTop,
}: Pick<
  SettingsPanelProps,
  "name" | "settings" | "ready" | "busy" | "onIdleView" | "onAlwaysOnTop"
>) {
  return (
    <>
      <ChoiceRow<IdleView>
        name="pet-idle-view"
        label="Knöpfe ausblenden"
        hint={`Ohne Mauszeiger über ${name} blenden die Knöpfe aus. Mit Zeiger kommt alles zurück.`}
        options={IDLE_VIEWS}
        value={settings.idleView}
        // Nicht bei `busy`: Das gesperrte Feld verlöre beim Speichern den Fokus, Pfeiltasten gingen ins Leere.
        disabled={!ready}
        onChange={onIdleView}
      />
      <ToggleRow
        label="Immer im Vordergrund"
        hint="Bleibt über allen Fenstern, unter Windows auch über Spielen im randlosen Vollbild."
        checked={settings.alwaysOnTop}
        disabled={busy || !ready}
        onChange={onAlwaysOnTop}
      />
    </>
  );
}

/** Die Einstellungen. Die Regler speichern, sobald sie ruhen (siehe `useSettingDraft`). */
export default function SettingsPanel(props: SettingsPanelProps) {
  const { name, settings, reducedMotion, size, frameStop, ready, busy } = props;
  const { onSize, onFrameStop, onReducedMotion, onOptimizedRendering } = props;
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
      <PercentSlider
        id="pet-frame-rate"
        label="Bildrate"
        hint="Weniger Bilder sparen Grafikleistung. Mehr Bilder machen Bewegungen flüssiger."
        value={frameStop}
        valueText={frameRateText(stopToFrameLimit(frameStop))}
        display={<FrameRateValue limit={stopToFrameLimit(frameStop)} />}
        min={FRAME_RATE.min}
        max={UNLIMITED_STOP}
        step={1}
        disabled={!ready}
        onChange={onFrameStop}
      />
      <ToggleRow
        label="Weniger Bewegung"
        hint="Ruhiger Begleiter, gleiche Gesellschaft. Ohne eigene Wahl wie im System."
        checked={reducedMotion}
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
      <WindowRows {...props} />
      <SoundRows {...props} />
    </>
  );
}
