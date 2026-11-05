/**
 * Panel direkt nach einem Levelaufstieg: neues Level, neu freigeschaltetes Teil, nächste Belohnung.
 *
 * @module
 */

import {
  isUnlocked,
  levelCosmetic,
  nextLevelCosmetic,
  unlockLabel,
  type Catalog,
  type Cosmetic,
  type Me,
} from "../pet";
import { Icon, PrimaryButton, XpProgress } from "../ui";

/** Das eben freigeschaltete Teil. */
function Unlocked({ item, name }: { item: Cosmetic; name: string }) {
  return (
    <section className="xp-section" aria-labelledby="xp-unlocked">
      <h3 id="xp-unlocked">Neu freigeschaltet</h3>
      <div className="cosmetic-detail featured">
        <span className="cosmetic-preview">
          <Icon name={item.icon} />
        </span>
        <span>
          <strong>{item.name}</strong>
          <small>
            {item.slot} · gehört jetzt {name}.
          </small>
        </span>
      </div>
    </section>
  );
}

/** Das Level-Panel. Gab es ein neues Teil, lässt es sich direkt anlegen. */
export default function LevelUpPanel({
  me,
  catalog,
  disabled,
  onEquip,
  onClose,
}: {
  me: Me;
  catalog: Catalog;
  disabled: boolean;
  onEquip: (id: string) => void;
  onClose: () => void;
}) {
  const { level } = me;
  const reward = levelCosmetic(level, catalog);
  const unlocked = reward && isUnlocked(reward.id, me) ? reward : undefined;
  const next = nextLevelCosmetic(level, catalog);
  return (
    <div className="xp-sections">
      <span className="levelup-step">
        <Icon name="spark" />
        Level {level - 1} → Level {level}
      </span>
      <XpProgress name={me.name} xp={me.xp} />
      {unlocked ? <Unlocked item={unlocked} name={me.name} /> : null}
      {next ? (
        <p className="xp-row xp-next">
          <span>
            <Icon name="lock" />
            Als Nächstes bei {unlockLabel(next.id, catalog)}: {next.name}
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
