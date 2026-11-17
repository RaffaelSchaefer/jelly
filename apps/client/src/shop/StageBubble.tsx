/**
 * Die Sprechblase des Zauberers über der Bühne, als Pergament mit Messingrand. Ihr Schwanz zeigt
 * nach links unten auf seinen Mund.
 *
 * Je nach Art des Satzes sieht sie anders aus: gesprochen, gedacht, als Zauberspruch oder als
 * Schnarchen. Hat der Satz ein Ende (`until`), verblasst sie dann in 300 ms. Die Meldung für
 * Screenreader bleibt stehen.
 *
 * @module
 */

import { memo, useEffect, useState, type CSSProperties } from "react";

import { BUBBLE, cssPercent } from "../pet/shopStage";
import { SpeechBubble } from "../ui";

/** Wie ein Satz klingt und aussieht. */
export type SaidKind = "speech" | "thought" | "incantation" | "snore";

/** Was die Blase von einem Satz des Zauberers braucht. */
export interface BubbleLine {
  line: { text: string };
  /** Zähler: Auch derselbe Satz ist eine neue Meldung. */
  id: number;
  /** Wann er begann, auf der Uhr von `performance.now()`. */
  at: number;
  kind?: SaidKind;
  /** Wann die Blase verblasst, auf derselben Uhr. `null` oder ohne Wert bleibt sie stehen. */
  until?: number | null;
  /** Sprechtempo: Die Silben erscheinen im Takt seiner Stimme. Ohne Angabe 1. */
  tempo?: number;
  /** Ob Screenreader den Satz vorlesen. Ohne Angabe ja. */
  announce?: boolean;
}

/** Lage und Breite der Blase, aus `pet/shopStage.ts`. */
const BUBBLE_STYLE = {
  "--bubble-x": cssPercent(BUBBLE.left),
  "--bubble-y": cssPercent(BUBBLE.top),
  "--bubble-w": `clamp(${BUBBLE.minPx}px, ${cssPercent(BUBBLE.width)}, ${BUBBLE.maxPx}px)`,
} as CSSProperties;

/** Ob die Blase dieses Satzes schon verblasst ist. */
function useFaded(said: BubbleLine | null) {
  const [fadedId, setFadedId] = useState<number | null>(null);
  const until = said?.until;
  const id = said?.id;
  useEffect(() => {
    if (typeof until !== "number" || id === undefined) return;
    const timer = window.setTimeout(() => setFadedId(id), Math.max(0, until - performance.now()));
    return () => window.clearTimeout(timer);
  }, [until, id]);
  return said !== null && fadedId === said.id;
}

/** Eigenschaften von {@link StageBubble}. */
export interface StageBubbleProps {
  /** Der letzte Satz, `null` vor dem ersten. */
  said: BubbleLine | null;
}

/**
 * Die Blase. Sie steht immer da: Screenreader lesen nur Änderungen in einer Meldung vor, die schon
 * stand.
 */
function StageBubble({ said }: StageBubbleProps) {
  const faded = useFaded(said);
  return (
    <div
      className="stage-bubble"
      style={BUBBLE_STYLE}
      data-kind={said?.kind ?? "speech"}
      data-faded={faded ? "" : undefined}
    >
      <SpeechBubble
        text={said?.line.text ?? ""}
        saidAt={said?.at}
        hidden={!said}
        tempo={said?.tempo}
        announce={said?.announce}
      />
    </div>
  );
}

export default memo(StageBubble);
