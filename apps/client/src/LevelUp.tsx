/**
 * Der Levelaufstieg als Moment auf der Bühne statt als Panel: Das Jelly bleibt zu sehen und jubelt,
 * hinter seinem Kopf schlägt die neue Zahl ein, und die Kapsel zeigt die Münzen für den Shop.
 *
 * Bewegung und Licht stehen in `levelup.css`. Den Takt gibt der letzte Ton der Fanfare vor.
 *
 * @module
 */

import { useState, type CSSProperties } from "react";

import type { ActiveEmote } from "./useEmotes";

import { coinLabel, LEVEL_UP, levelProgress, type Me, type Rules } from "./pet";
import { Icon, PrimaryButton } from "./ui";
import "./levelup.css";

/** Sekunden bis zum letzten Ton der Fanfare. Dann schlägt alles ein. */
const BOOM_SECONDS = LEVEL_UP.at(-1)!.at;

/** Ab wann die Kapsel und ihre Knöpfe zu sehen sind, siehe `.levelup-capsule > *` in `levelup.css`. */
export const CAPSULE_READY_MS = BOOM_SECONDS * 1000 + 640;

/** Für `levelup.css`, damit Bild und Ton nicht auseinanderlaufen, wenn sich die Fanfare ändert. */
export const BOOM_STYLE = { "--boom": `${BOOM_SECONDS}s` } as CSSProperties;

/** Die Hände blenden 0,3 s lang ein und sollen beim Einschlag oben sein. */
const CHEER_DELAY_MS = BOOM_SECONDS * 1000 - 300;

/** Die Jubel-Geste. Ihr Text bleibt ungelesen: Die Sprechblase zeigt nur Gesten aus dem Spielstand. */
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
 * Was das Jelly während des Aufstiegs tut: Es jubelt zum Einschlag. Das läuft am Spielstand vorbei,
 * so kommt der Fanfare kein Laut der Geste dazwischen.
 */
export function useCelebration(open: boolean) {
  const [cheer, setCheer] = useState<ActiveEmote | null>(null);
  if (open !== (cheer !== null)) {
    setCheer(open ? { ...CHEER, startedAt: performance.now() + CHEER_DELAY_MS } : null);
  }
  return cheer;
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

/** Licht und Spritzer hinter dem Jelly. Auch das Schlüpfen in `Hatch.tsx` zündet sie. */
export function BoomBehind() {
  return (
    <>
      <span className="levelup-halo" />
      <span className="levelup-rays" />
      <Pieces className="levelup-rise" pieces={RISING} />
      <span className="levelup-flash" />
      <span className="levelup-wave" />
      <span className="levelup-wave late" />
      <Pieces className="levelup-burst" pieces={BURST_BEHIND} />
    </>
  );
}

/** Die Spritzer und Funken vor dem Jelly. */
export function BoomFront() {
  return (
    <>
      <Pieces className="levelup-burst" pieces={BURST_FRONT} />
      <Pieces className="levelup-twinkles" pieces={TWINKLES} />
    </>
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

/** Die Münzen, die jetzt im Shop bereitliegen, gegenüber dem Fortschritt. */
function CoinDrop({ coins }: { coins: number }) {
  return (
    <div className="levelup-side left">
      <span className="levelup-drop" data-liquid="calm">
        <b>{coins}</b>
        <span className="levelup-badge">
          <Icon name="coin" />
        </span>
      </span>
      <small>
        {coins === 1 ? "Münze" : "Münzen"}
        <br />
        für den Shop
      </small>
    </div>
  );
}

/** Die Glas-Kapsel an der Stelle des Docks: die neuen Münzen, sonst nur ein Lob, und der Weg weiter. */
function Capsule({
  name,
  gained,
  disabled,
  onShop,
  onClose,
}: {
  name: string;
  /** Münzen für diesen Aufstieg, 0 wenn die LAN keine zahlt. */
  gained: number;
  disabled: boolean;
  onShop: () => void;
  onClose: () => void;
}) {
  return (
    <div className="levelup-capsule" data-liquid="calm">
      <span className="levelup-seal">
        <Icon name={gained > 0 ? "coin" : "spark"} />
      </span>
      <span className="levelup-reward">
        <strong>{gained > 0 ? `+${coinLabel(gained)}` : `Stark, ${name}!`}</strong>
        <small>{gained > 0 ? "Im Shop einlösen" : "Eine Stufe weiter."}</small>
      </span>
      {gained > 0 ? (
        <>
          <button className="levelup-later" data-sound="close" onClick={onClose}>
            Später
          </button>
          <PrimaryButton
            className="levelup-go"
            data-sound="window"
            disabled={disabled}
            onClick={onShop}
          >
            Zum Shop
          </PrimaryButton>
        </>
      ) : (
        <PrimaryButton className="levelup-go" data-sound="close" onClick={onClose}>
          Weiter
        </PrimaryButton>
      )}
    </div>
  );
}

/** Der ganze Aufstieg. Läuft neu an, wenn ihn `key` wechselt, etwa beim nächsten Level. */
export default function LevelUp({
  me,
  rules,
  disabled,
  onShop,
  onClose,
}: {
  me: Me;
  rules: Rules;
  disabled: boolean;
  onShop: () => void;
  onClose: () => void;
}) {
  const gained = rules.coins_per_level;
  return (
    <section className="levelup" style={BOOM_STYLE} aria-labelledby="levelup-title">
      <div className="levelup-back">
        <span className="levelup-bed" />
        <BoomBehind />
        <LevelNumber level={me.level} />
      </div>
      <div className="levelup-front">
        <Capsule {...{ gained, disabled, onShop, onClose }} name={me.name} />
        <XpDrop xp={me.xp} xpPerLevel={rules.xp_per_level} />
        {gained > 0 ? <CoinDrop coins={me.coins} /> : null}
        <BoomFront />
      </div>
    </section>
  );
}
