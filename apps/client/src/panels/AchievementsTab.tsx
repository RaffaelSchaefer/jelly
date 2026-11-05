/**
 * XP-Reiter „Erfolge“: alle Erfolge aus dem Katalog, verdiente mit Haken.
 *
 * @module
 */

import { achievementRows, type Catalog, type Me } from "../pet";
import { AchievementRow } from "../ui";

/** Der Reiter „Erfolge“. Geheime erscheinen erst, wenn sie verdient sind. */
export default function AchievementsTab({ me, catalog }: { me: Me; catalog: Catalog }) {
  const rows = achievementRows(catalog, me);
  const done = rows.filter((item) => item.done).length;
  return (
    <div className="xp-sections">
      <div className="xp-section-head">
        <strong>
          {done} von {rows.length} Erfolgen
        </strong>
      </div>
      <section className="xp-section" aria-labelledby="xp-achievements">
        <h3 id="xp-achievements">Alle Erfolge</h3>
        {rows.map((item) => (
          <AchievementRow
            key={item.key}
            icon={item.icon}
            title={item.title}
            detail={item.detail}
            goal={item.goal}
            unit={item.unit}
            done={item.done}
          />
        ))}
      </section>
      <p className="panel-hint">
        Es gibt noch geheime Erfolge. Die zeigen sich erst, wenn du sie hast.
      </p>
    </div>
  );
}
