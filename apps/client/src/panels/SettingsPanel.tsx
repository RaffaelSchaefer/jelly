/**
 * Panel „Einstellungen“: Pet-Größe und reduzierte Bewegung.
 *
 * @module
 */

import { PET_SIZE, type Pet } from "../pet";
import { SizeSlider, ToggleRow } from "../ui";

/** Die Einstellungen. Die Größe wird gespeichert, sobald der Regler ruht (siehe `useSizeDraft`). */
export default function SettingsPanel({
  pet,
  size,
  ready,
  busy,
  onSize,
  onReducedMotion,
}: {
  pet: Pet;
  /** Angezeigte Größe, solange der Regler bewegt wird, also eventuell noch nicht gespeichert. */
  size: number;
  ready: boolean;
  busy: boolean;
  onSize: (size: number) => void;
  onReducedMotion: (reducedMotion: boolean) => void;
}) {
  return (
    <>
      <SizeSlider
        id="pet-size"
        label="Größe"
        hint={`So viel Platz bekommt ${pet.name} auf deinem Desktop.`}
        value={size}
        min={PET_SIZE.min}
        max={PET_SIZE.max}
        step={PET_SIZE.step}
        disabled={!ready}
        onChange={onSize}
      />
      <ToggleRow
        label="Weniger Bewegung"
        hint="Ruhiger Begleiter, gleiche Gesellschaft."
        checked={pet.reducedMotion}
        disabled={busy || !ready}
        onChange={onReducedMotion}
      />
    </>
  );
}
