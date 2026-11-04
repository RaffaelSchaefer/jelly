/**
 * XP-Reiter „Erfolge“: hervorgehobener nächster Erfolg und die vollständige Liste.
 *
 * @module
 */

import { ACHIEVEMENTS, achievementProgress, type Pet } from "../pet";
import { AchievementRow } from "../ui";

/** Der Reiter „Erfolge“. Geheime Erfolge bleiben verborgen, bis sie geschafft sind. */
export default function AchievementsTab({ pet }: { pet: Pet }) {
  const progress = achievementProgress(pet.log);
  const done = ACHIEVEMENTS.filter((item) => progress[item.id] >= item.goal);
  // Der offene Erfolg, der am nächsten am Ziel ist, steht oben im Rampenlicht.
  const featured = ACHIEVEMENTS.filter(
    (item) => !item.secret && progress[item.id] > 0 && progress[item.id] < item.goal,
  ).sort((a, b) => progress[b.id] / b.goal - progress[a.id] / a.goal)[0];
  return (
    <div className="xp-sections">
      <div className="xp-section-head">
        <strong>
          {done.length} von {ACHIEVEMENTS.length} Erfolgen
        </strong>
      </div>
      {featured ? (
        <div className="achievement-featured">
          <AchievementRow
            icon={featured.icon}
            title={featured.title}
            detail={featured.detail}
            value={progress[featured.id]}
            goal={featured.goal}
            unit={featured.unit}
            done={false}
          />
        </div>
      ) : null}
      <section className="xp-section" aria-labelledby="xp-achievements">
        <h3 id="xp-achievements">Alle Erfolge</h3>
        {ACHIEVEMENTS.filter((item) => item !== featured).map((item) => {
          const finished = progress[item.id] >= item.goal;
          const hidden = item.secret && !finished;
          return (
            <AchievementRow
              key={item.id}
              icon={hidden ? "moon" : item.icon}
              title={hidden ? "Geheimer Erfolg" : item.title}
              detail={hidden ? "Bleib lange genug wach …" : item.detail}
              value={progress[item.id]}
              goal={item.goal}
              unit={item.unit}
              done={finished}
            />
          );
        })}
      </section>
    </div>
  );
}
