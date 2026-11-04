/**
 * Panel direkt nach einem Levelaufstieg: neues Level, neu freigeschaltetes Teil, nächste Belohnung.
 *
 * @module
 */

import { levelCosmetic, levelProgress, nextLevelCosmetic, unlockLabel, type Pet } from "../pet";
import { Icon, PrimaryButton, XpProgress } from "../ui";

/** Das Level-Panel. Gab es ein neues Teil, lässt es sich direkt anlegen. */
export default function LevelUpPanel({
  pet,
  disabled,
  onEquip,
  onClose,
}: {
  pet: Pet;
  disabled: boolean;
  onEquip: (id: string) => void;
  onClose: () => void;
}) {
  const { level } = levelProgress(pet.xp);
  const unlocked = levelCosmetic(level);
  const next = nextLevelCosmetic(level);
  return (
    <div className="xp-sections">
      <span className="levelup-step">
        <Icon name="spark" />
        Level {level - 1} → Level {level}
      </span>
      <XpProgress name={pet.name} xp={pet.xp} />
      {unlocked ? (
        <section className="xp-section" aria-labelledby="xp-unlocked">
          <h3 id="xp-unlocked">Neu freigeschaltet</h3>
          <div className="cosmetic-detail featured">
            <span className="cosmetic-preview">
              <Icon name={unlocked.icon} />
            </span>
            <span>
              <strong>{unlocked.name}</strong>
              <small>
                {unlocked.slot} · gehört jetzt {pet.name}.
              </small>
            </span>
          </div>
        </section>
      ) : null}
      {next ? (
        <p className="xp-row xp-next">
          <span>
            <Icon name="lock" />
            Als Nächstes bei {unlockLabel(next)}: {next.name}
          </span>
        </p>
      ) : null}
      <div className="report-grid">
        <button className="secondary-button" onClick={onClose}>
          {unlocked ? "Später" : "Weiter"}
        </button>
        {unlocked ? (
          <PrimaryButton disabled={disabled} onClick={() => onEquip(unlocked.id)}>
            Anlegen
          </PrimaryButton>
        ) : null}
      </div>
    </div>
  );
}
