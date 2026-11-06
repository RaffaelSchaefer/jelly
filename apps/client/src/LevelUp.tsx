/**
 * Der Levelaufstieg als Moment auf der Bühne statt als Panel: Das Jelly bleibt zu sehen und jubelt,
 * hinter seinem Kopf schlägt die neue Zahl ein, und es trägt das neue Teil schon zur Probe.
 *
 * Bewegung und Licht stehen in `levelup.css`. Den Takt gibt der letzte Ton der Fanfare vor.
 *
 * @module
 */

import { useEffect, useState, type CSSProperties } from "react";

import type { ActiveEmote } from "./useEmotes";

import {
  LEVEL_UP,
  levelProgress,
  levelReward,
  nextLevelCosmetic,
  slotLabel,
  unlockLabel,
  type Catalog,
  type Cosmetic,
  type Me,
  type Rules,
} from "./pet";
import { Icon, PrimaryButton } from "./ui";
import "./levelup.css";

/** Sekunden bis zum letzten Ton der Fanfare. Dann schlägt alles ein. */
const BOOM_SECONDS = LEVEL_UP.at(-1)!.at;

/** Für `levelup.css`, damit Bild und Ton nicht auseinanderlaufen, wenn sich die Fanfare ändert. */
const BOOM_STYLE = { "--boom": `${BOOM_SECONDS}s` } as CSSProperties;

/** Die Hände blenden 0,3 s lang ein und sollen beim Einschlag oben sein. */
const CHEER_DELAY_MS = BOOM_SECONDS * 1000 - 300;

/** Die Jubel-Geste. Ihr Text bleibt ungelesen, die Sprechblase ist währenddessen weg. */
const CHEER = { key: "cheer", label: "Jubeln" };

/** Goldener Winkel: Die Spritzer verteilen sich gleichmäßig und ohne Zufall im Rendern. */
const GOLDEN_ANGLE = 137.5;

/** Ein Spritzer der Explosion beim Einschlag. */
function burstPiece(index: number) {
  return {
    "--angle": `${index * GOLDEN_ANGLE}deg`,
    "--reach": `${60 + ((index * 73) % 131)}px`,
    "--size": `${5 + ((index * 5) % 9)}px`,
    "--delay": `${(index * 29) % 130}ms`,
  } as CSSProperties;
}

/** Eine Blase, die danach langsam hinter dem Jelly aufsteigt. */
function risingBubble(index: number) {
  return {
    "--x": `${((index * 61) % 100) * 3.2 - 160}px`,
    "--size": `${4 + ((index * 3) % 7)}px`,
    "--time": `${4.2 + (index % 4) * 0.7}s`,
    "--delay": `${index * 0.62}s`,
  } as CSSProperties;
}

/** Ein Funkeln um die Zahl, als Abstand von ihrer Mitte. */
function twinkle(x: number, y: number, delay: number) {
  return { "--x": `${x}px`, "--y": `${y}px`, "--delay": `${delay}s` } as CSSProperties;
}

const BURST = Array.from({ length: 36 }, (_, index) => burstPiece(index));
const BURST_BEHIND = BURST.filter((_, index) => index % 2 === 0);
const BURST_FRONT = BURST.filter((_, index) => index % 2 === 1);
const RISING = Array.from({ length: 10 }, (_, index) => risingBubble(index));
const TWINKLES = [
  twinkle(-92, -32, 0),
  twinkle(84, -44, 0.9),
  twinkle(112, 14, 1.7),
  twinkle(-118, 24, 2.4),
  twinkle(58, 38, 3.1),
];

/**
 * Was das Jelly während des Aufstiegs tut: Es jubelt und trägt ab dem Einschlag das neue Teil. Das
 * läuft am Spielstand vorbei, so kommt der Fanfare kein Laut der Geste dazwischen.
 */
export function useCelebration(open: boolean) {
  const [cheer, setCheer] = useState<ActiveEmote | null>(null);
  const [revealed, setRevealed] = useState(false);
  if (open !== (cheer !== null)) {
    setCheer(open ? { ...CHEER, startedAt: performance.now() + CHEER_DELAY_MS } : null);
    setRevealed(false);
  }
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setRevealed(true), BOOM_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [open]);
  return { cheer, revealed };
}

/** Viele kleine Teile mit ihren Werten aus den Listen oben. */
function Pieces({ className, pieces }: { className: string; pieces: CSSProperties[] }) {
  return (
    <span className={className}>
      {pieces.map((style, index) => (
        <i key={index} style={style} />
      ))}
    </span>
  );
}

/** Die Zahl: Die alte zählt im Takt der Fanfare hoch, die neue schlägt auf dem letzten Ton ein. */
function LevelNumber({ level }: { level: number }) {
  return (
    <h2 className="levelup-title">
      <span className="levelup-eyebrow">Neues Level</span>
      <span className="levelup-digits">
        <span className="levelup-old" aria-hidden="true">
          {level - 1}
        </span>
        <span className="levelup-new">{level}</span>
        <span className="levelup-echo" aria-hidden="true">
          {level}
        </span>
      </span>
    </h2>
  );
}

/** Der Fortschritt zum nächsten Level als Ring um dessen Zahl. */
function XpDrop({ xp, xpPerLevel }: { xp: number; xpPerLevel: number }) {
  const { level, current, remaining } = levelProgress(xp, xpPerLevel);
  const fill = { "--levelup-fill": current / xpPerLevel } as CSSProperties;
  return (
    <div className="levelup-side right">
      <span className="levelup-drop" data-liquid="calm" style={fill}>
        <span className="levelup-ring" />
        <b aria-hidden="true">{level + 1}</b>
      </span>
      <progress
        className="sr-only"
        value={current}
        max={xpPerLevel}
        aria-label={`Fortschritt zu Level ${level + 1}`}
      />
      <small>Noch {remaining} XP</small>
    </div>
  );
}

/** Die nächste Belohnung, noch verschlossen. */
function NextDrop({ item, catalog }: { item: Cosmetic; catalog: Catalog }) {
  return (
    <div className="levelup-side left">
      <span className="levelup-drop" data-liquid="calm">
        <Icon name={item.icon} />
        <span className="levelup-lock">
          <Icon name="lock" />
        </span>
      </span>
      <small>
        Bei {unlockLabel(item.id, catalog)}
        <br />
        {item.name}
      </small>
    </div>
  );
}

/** Die Glas-Kapsel an der Stelle des Docks: das neue Teil, sonst nur ein Lob, und der Weg zurück. */
function Capsule({
  name,
  reward,
  slot,
  disabled,
  onEquip,
  onClose,
}: {
  name: string;
  reward: Cosmetic | undefined;
  slot: string;
  disabled: boolean;
  onEquip: (item: Cosmetic) => void;
  onClose: () => void;
}) {
  return (
    <div className="levelup-capsule" data-liquid="calm">
      <span className="levelup-seal">
        <Icon name={reward?.icon ?? "spark"} />
      </span>
      <span className="levelup-reward">
        <strong>{reward ? reward.name : `Stark, ${name}!`}</strong>
        <small>{reward ? `Neu für ${name} · ${slot}` : "Eine Stufe weiter."}</small>
      </span>
      {reward ? (
        <>
          <button className="levelup-later" onClick={onClose}>
            Später
          </button>
          <PrimaryButton className="levelup-go" disabled={disabled} onClick={() => onEquip(reward)}>
            Anlegen
          </PrimaryButton>
        </>
      ) : (
        <PrimaryButton className="levelup-go" onClick={onClose}>
          Weiter
        </PrimaryButton>
      )}
    </div>
  );
}

/** Der ganze Aufstieg. Läuft neu an, wenn ihn `key` wechselt, etwa beim nächsten Level. */
export default function LevelUp({
  me,
  catalog,
  rules,
  disabled,
  onEquip,
  onClose,
}: {
  me: Me;
  catalog: Catalog;
  rules: Rules;
  disabled: boolean;
  onEquip: (item: Cosmetic) => void;
  onClose: () => void;
}) {
  const reward = levelReward(me, catalog);
  const next = nextLevelCosmetic(me.level, catalog);
  return (
    <section className="levelup" style={BOOM_STYLE} aria-labelledby="levelup-title">
      <div className="levelup-back">
        <span className="levelup-bed" />
        <span className="levelup-halo" />
        <span className="levelup-rays" />
        <Pieces className="levelup-rise" pieces={RISING} />
        <span className="levelup-flash" />
        <span className="levelup-wave" />
        <span className="levelup-wave late" />
        <Pieces className="levelup-burst" pieces={BURST_BEHIND} />
        <LevelNumber level={me.level} />
      </div>
      <div className="levelup-front">
        <Capsule
          {...{ reward, disabled, onEquip, onClose }}
          name={me.name}
          slot={reward ? slotLabel(reward.slot, catalog) : ""}
        />
        <XpDrop xp={me.xp} xpPerLevel={rules.xp_per_level} />
        {next ? <NextDrop item={next} catalog={catalog} /> : null}
        <Pieces className="levelup-burst" pieces={BURST_FRONT} />
        <Pieces className="levelup-twinkles" pieces={TWINKLES} />
      </div>
    </section>
  );
}
