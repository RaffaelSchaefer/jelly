/**
 * Spielt einen Ton in Abschnitten (`SoundSegment`), etwa die Musik unter den Jelly-News in
 * Schleife: jeden Abschnitt mit Ein- und Ausblenden, genau auf der Uhr des Kontexts. Live plant
 * {@link playSegments} immer nur die nächsten Sekunden voraus, eine Sendung kann Stunden laufen.
 * Beim Rendern kommen alle auf einmal, mit demselben {@link startSegment}.
 *
 * @module
 */

import type { SoundSegment } from "./pet";

/** So weit im Voraus plant die App Abschnitte, in Sekunden. */
const AHEAD_SECONDS = 10;

/** So schnell verstummt alles ohne eigene Angabe, etwa mit dem Schalter, in Sekunden. */
const QUICK_SECONDS = 0.1;

/** So viele Stützstellen haben die Kurven zum Ein- und Ausblenden. */
const CURVE_STEPS = 64;

/**
 * Einblenden mit gleicher Leistung, als Viertel einer Sinuswelle: Zwei Abschnitte, die sich
 * überblenden, klingen zusammen so laut wie einer. Linear sackte die Musik mitten in der
 * Überblendung um 3 dB ab, denn die Stellen klingen ähnlich, schwingen aber nicht gleich.
 */
const FADE_IN = Float32Array.from({ length: CURVE_STEPS }, (_, index) =>
  Math.sin(((index / (CURVE_STEPS - 1)) * Math.PI) / 2),
);
/** Ausblenden, das Gegenstück zu {@link FADE_IN}. */
const FADE_OUT = FADE_IN.slice().reverse();

/** Wohin ein Ton in Abschnitten klingt. */
export interface SoundTrack {
  context: BaseAudioContext;
  /** Eingang mit dem Pegel des Tons. */
  output: AudioNode;
  buffer: AudioBuffer;
}

/** Ein geplanter Abschnitt. */
interface Started {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Startet `segment` ab `t0` auf der Uhr des Kontexts, mit Ein- und Ausblenden. */
export function startSegment(
  { context, output, buffer }: SoundTrack,
  segment: SoundSegment,
  t0: number,
): Started {
  const start = t0 + segment.at;
  const end = start + segment.duration;
  const gain = context.createGain();
  if (segment.fadeIn > 0) gain.gain.setValueCurveAtTime(FADE_IN, start, segment.fadeIn);
  else gain.gain.setValueAtTime(1, start);
  // Nie vor dem Ende des Einblendens: Zwei Kurven dürfen sich nicht berühren, auch nicht um eine
  // Rundung, sonst wirft WebAudio.
  const fadeFrom = Math.max(start + segment.fadeIn, end - segment.fadeOut);
  if (end > fadeFrom) gain.gain.setValueCurveAtTime(FADE_OUT, fadeFrom, end - fadeFrom);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain).connect(output);
  source.start(start, segment.offset, segment.duration);
  return { source, gain };
}

/**
 * Blendet alles hinter `fader` ab jetzt in `seconds` aus und hält die Abschnitte an. Der Regler
 * liegt hinter den Abschnitten: Ihre Kurven bleiben unberührt, denn eine Rampe mitten in einer
 * Kurve lehnen manche Engines ab. Fehler bleiben hier: Ton darf nie stören.
 */
function fadeAll(fader: GainNode, live: Iterable<Started>, seconds: number) {
  try {
    const now = fader.context.currentTime;
    fader.gain.setTargetAtTime(0, now, seconds / 4);
    for (const { source } of live) source.stop(now + seconds);
  } catch {
    // Ohne Audio verstummt die Musik ohnehin.
  }
}

/**
 * Spielt alle Abschnitte ab `t0` und plant dabei voraus. `ended` meldet einmal, wenn alles aus ist.
 *
 * @returns Blendet alles in den angegebenen Sekunden aus, ohne Angabe sofort, und plant nichts
 *   mehr.
 */
export function playSegments(
  track: SoundTrack,
  segments: SoundSegment[],
  t0: number,
  ended: () => void,
) {
  const live = new Set<Started>();
  const fader = track.context.createGain();
  fader.connect(track.output);
  const faded = { ...track, output: fader };
  let next = 0;
  let timer: number | undefined;
  let done = false;
  const finish = () => {
    if (!done) ended();
    done = true;
  };
  const plan = () => {
    const horizon = track.context.currentTime + AHEAD_SECONDS;
    for (; next < segments.length && t0 + (segments[next]?.at ?? 0) < horizon; next++) {
      const started = startSegment(faded, segments[next]!, t0);
      const last = next === segments.length - 1;
      live.add(started);
      started.source.addEventListener("ended", () => {
        started.gain.disconnect();
        live.delete(started);
        if (last) finish();
      });
    }
    const following = segments[next];
    if (following) timer = window.setTimeout(plan, (t0 + following.at - horizon) * 1000 + 50);
  };
  plan();
  return (seconds = QUICK_SECONDS) => {
    window.clearTimeout(timer);
    next = segments.length;
    fadeAll(fader, live, seconds);
    window.setTimeout(finish, seconds * 1000 + 100);
  };
}
