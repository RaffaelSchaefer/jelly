/**
 * Macht die Stimme des Jellys hörbar: ein kleiner Synthesizer aus WebAudio, ohne Samples.
 *
 * Zwei leicht verstimmte Sägezähne geben den Ton, drei Formant-Filter machen daraus Vokale, leises
 * Rauschen klingt nach Atem und kurze Rausch-Stöße nach Konsonanten. Die Noten kommen aus
 * `pet/voice.ts`, die Klangfarbe und ihre Stellschrauben aus `pet/voiceTimbre.ts`. Der Zauberer im
 * Shop singt in seiner eigenen, mit Schichten aus `shop/wizardVoiceLayers.ts`.
 *
 * @module
 */

import { VIBRATO_HZ, volumeGain, type VoiceNote } from "./pet";
import {
  JELLY_TIMBRE,
  type PhraseSetup,
  type VoiceLayers,
  type VoiceRoute,
  type VoiceTimbre,
} from "./pet/voiceTimbre";

export type { PhraseSetup, VoiceLayers, VoiceRoute } from "./pet/voiceTimbre";

/** Anteil des Tonhöhen-Gleitens an der Note. */
const GLIDE_SHARE = 0.55;

/** Hüllkurve einer Note: Einschwingen in Sekunden, halten bis zu diesem Anteil, dann ausklingen. */
const ATTACK = 0.012;
const SUSTAIN = 0.78;
const HOLD_SHARE = 0.8;

/** So weit über dem Grundton liegt der erste Formant mindestens. */
const FIRST_FORMANT_ABOVE_PITCH = 1.05;

/** Konsonanten: Länge in Sekunden und Lautstärke. */
const ONSETS = {
  tick: { seconds: 0.012, gain: 0.5 },
  hiss: { seconds: 0.032, gain: 0.22 },
} as const;
const ONSET_CUTOFF = 2600;

/** Pegel am Ende der Kette. */
const MASTER_GAIN = 0.7;

/** Der Kompressor fängt nur Spitzen ab, die Betonung einzelner Silben bleibt. */
const COMPRESSOR = { threshold: -14, knee: 10, ratio: 5, attack: 0.003, release: 0.12 };

/** Zeitkonstante, mit der eine neue Lautstärke greift. So knackt der Regler nicht. */
const VOLUME_GLIDE = 0.02;

/** Wie lange eine Phrase nachklingen darf, bevor ihre Quellen stoppen. */
const RELEASE_SECONDS = 0.08;

/** Zeitkonstante beim Ablösen einer laufenden Phrase, und wann sie danach still ist. */
const FADE_CONSTANT = 0.012;
const FADE_SECONDS = 0.1;

/** Kurzer Vorlauf, damit der erste Ton nicht schon in der Vergangenheit beginnt. */
const LEAD_SECONDS = 0.02;

/** Wacht das Audio nicht auf, läuft der Mund nach so vielen Sekunden ohne den Ton los. */
const MAX_WAKE_SECONDS = 0.25;

/** Nach so vielen Sekunden Stille gibt die App das Audiogerät wieder frei. */
const IDLE_SECONDS = 30;

/** Eine laufende Phrase. */
export interface Phrase {
  /** Wann sie von selbst zu Ende ist, in Sekunden der Kontext-Uhr. */
  end: number;
  /** Blendet sie ab `at` schnell aus und stoppt alle Quellen. */
  fade: (at: number) => void;
}

/** Die Kennlinien des weichen Clippings je Stärke, einmal gerechnet. */
const DRIVE_CURVES = new Map<number, Float32Array<ArrayBuffer>>();

/** Die Kennlinie des weichen Clippings mit Stärke `drive`. */
function driveCurve(drive: number) {
  const known = DRIVE_CURVES.get(drive);
  if (known) return known;
  const curve = new Float32Array(1025);
  curve.forEach((_, index) => {
    curve[index] = Math.tanh(((index - 512) / 512) * drive) / Math.tanh(drive);
  });
  DRIVE_CURVES.set(drive, curve);
  return curve;
}

/** Eine Sekunde weißes Rauschen. */
function createNoise(context: BaseAudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  samples.forEach((_, index) => {
    samples[index] = Math.random() * 2 - 1;
  });
  return buffer;
}

/** Je Kontext nur einmal gerechnet. */
const NOISE = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Das Rauschen dieses Kontexts als laufende Schleife. */
export function startNoise(context: BaseAudioContext, start: number) {
  const buffer = NOISE.get(context) ?? createNoise(context);
  NOISE.set(context, buffer);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start(start);
  return source;
}

/** Gleitet je Note von ihrer Anfangs- zur Zieltonhöhe. */
export function schedulePitch(frequency: AudioParam, notes: VoiceNote[], start: number) {
  for (const note of notes) {
    frequency.setValueAtTime(note.from, start + note.at);
    frequency.exponentialRampToValueAtTime(note.to, start + note.at + note.duration * GLIDE_SHARE);
  }
}

/** Linear, denn ein exponentieller Verlauf darf 0 nicht erreichen. `level` skaliert die ganze Kurve. */
export function scheduleEnvelope(gain: AudioParam, notes: VoiceNote[], start: number, level = 1) {
  gain.setValueAtTime(0, start);
  for (const note of notes) {
    const begin = start + note.at;
    const peak = note.gain * level;
    gain.setValueAtTime(0, begin);
    gain.linearRampToValueAtTime(peak, begin + Math.min(ATTACK, note.duration / 3));
    gain.linearRampToValueAtTime(peak * SUSTAIN, begin + note.duration * HOLD_SHARE);
    gain.linearRampToValueAtTime(0, begin + note.duration);
  }
}

/** Kurze Rausch-Stöße am Anfang der Noten, die mit einem Konsonanten beginnen. */
function scheduleOnsets(gain: AudioParam, notes: VoiceNote[], start: number) {
  gain.setValueAtTime(0, start);
  for (const note of notes) {
    if (!note.onset) continue;
    const { seconds, gain: level } = ONSETS[note.onset];
    const begin = start + note.at;
    gain.setValueAtTime(level * note.gain, begin);
    gain.linearRampToValueAtTime(0, begin + Math.min(seconds, note.duration));
  }
}

/**
 * Wo ein Formant bei dieser Note liegt. Der erste läge bei „i“ und „u“ unter dem Grundton und ließe
 * nichts durch, der Ton bräche weg. Hohe Stimmen heben ihn deshalb mit dem Ton an, hier ebenso.
 */
function formantOf(timbre: VoiceTimbre, note: VoiceNote, index: number) {
  const target = timbre.formants[note.vowel][index] ?? 1000;
  return index === 0 ? Math.max(target, note.to * FIRST_FORMANT_ABOVE_PITCH) : target;
}

/** Baut die Formant-Filter und führt sie je Note zu ihrem Vokal. Alle laufen in `output` zusammen. */
function createFormants({ context, notes, start, timbre }: PhraseSetup, output: AudioNode) {
  return timbre.formantGains.map((level, index) => {
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = timbre.formantQ[index] ?? 1;
    for (const note of notes) {
      const target = formantOf(timbre, note, index);
      if (note === notes[0]) filter.frequency.setValueAtTime(target, start);
      filter.frequency.setTargetAtTime(target, start + note.at, timbre.vowelGlide);
    }
    const gain = context.createGain();
    gain.gain.value = level;
    filter.connect(gain).connect(output);
    return filter;
  });
}

/** Die zwei Oszillatoren samt Vibrato, je Note mit eigener Stärke. Liefert alle Quellen. */
function startOscillators({ context, notes, start, timbre }: PhraseSetup, output: AudioNode) {
  const vibrato = context.createOscillator();
  vibrato.frequency.value = VIBRATO_HZ;
  const depth = context.createGain();
  depth.gain.setValueAtTime(timbre.vibratoCents, start);
  for (const note of notes) {
    if (note.shake)
      depth.gain.setTargetAtTime(note.shake, start + note.at + note.duration * 0.25, 0.06);
  }
  vibrato.connect(depth);
  vibrato.start(start);
  const voices = [-timbre.detuneCents, timbre.detuneCents].map((detune) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.detune.value = detune;
    depth.connect(oscillator.detune);
    schedulePitch(oscillator.frequency, notes, start);
    oscillator.connect(output);
    oscillator.start(start);
    return oscillator;
  });
  return [vibrato, ...voices];
}

/** Der Weg vom Ton über die Vokale bis zum Ausgang der Phrase. Liefert seinen Eingang. */
function createThroat(setup: PhraseSetup, output: AudioNode) {
  const { context, timbre } = setup;
  const drive = context.createWaveShaper();
  drive.curve = driveCurve(timbre.drive);
  drive.connect(output);
  const throat = context.createGain();
  for (const filter of createFormants(setup, drive)) throat.connect(filter);
  const body = context.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = timbre.bodyCutoff;
  const bodyGain = context.createGain();
  bodyGain.gain.value = timbre.bodyGain;
  throat.connect(body).connect(bodyGain).connect(drive);
  return throat;
}

/** Atem und Konsonanten aus demselben Rauschen. */
function startNoiseVoices(setup: PhraseSetup, routes: { throat: AudioNode; output: AudioNode }) {
  const { context, notes, start, timbre } = setup;
  const noise = startNoise(context, start);
  const breath = context.createGain();
  scheduleEnvelope(breath.gain, notes, start, timbre.breath);
  noise.connect(breath).connect(routes.throat);
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = ONSET_CUTOFF;
  const onset = context.createGain();
  scheduleOnsets(onset.gain, notes, start);
  noise.connect(highpass).connect(onset).connect(routes.output);
  return noise;
}

/**
 * Ein Spieler für Noten in der Klangfarbe `timbre`, mit zusätzlichen Schichten `layers`. Er spielt
 * Noten ab `start` in `output`, auch in einem `OfflineAudioContext`: So lässt sich der Klang
 * rendern und prüfen. Die Noten dürfen nicht leer sein und sich nicht überlappen. Die Phrase räumt
 * sich nach ihrem Ende selbst auf.
 */
export function phrasePlayer(timbre: VoiceTimbre, layers?: VoiceLayers) {
  return (
    context: BaseAudioContext,
    output: AudioNode,
    notes: VoiceNote[],
    start: number,
  ): Phrase => {
    const setup = { context, notes, start, timbre };
    // Die Hüllkurven liegen eine Stufe davor: So kann `fade` ausblenden, ohne ihre Rampen anzufassen.
    const fader = context.createGain();
    fader.connect(output);
    const throat = createThroat(setup, fader);
    const envelope = context.createGain();
    scheduleEnvelope(envelope.gain, notes, start, timbre.voiceLevel);
    envelope.connect(throat);
    const sources = [
      ...startOscillators(setup, envelope),
      startNoiseVoices(setup, { throat, output: fader }),
      ...(layers?.(setup, fader) ?? []),
    ];
    const last = notes.at(-1);
    const end = start + (last ? last.at + last.duration : 0) + RELEASE_SECONDS;
    for (const source of sources) source.stop(end);
    sources[0]?.addEventListener("ended", () => fader.disconnect());
    return {
      end,
      fade(at) {
        fader.gain.setTargetAtTime(0, at, FADE_CONSTANT);
        const silent = Math.min(end, at + FADE_SECONDS);
        for (const source of sources) source.stop(silent);
      },
    };
  };
}

/** Spielt Noten in der Stimme des Jellys, siehe {@link phrasePlayer}. */
export const playNotes = phrasePlayer(JELLY_TIMBRE);

/**
 * Das Ende der Kette: Pegel und Kompressor. Liefert den Eingang.
 *
 * @param destination - Wohin es danach geht. Die App führt es über ihren Lautstärke-Regler.
 */
export function createVoiceOutput(
  context: BaseAudioContext,
  destination: AudioNode = context.destination,
) {
  const master = context.createGain();
  master.gain.value = MASTER_GAIN;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR.threshold;
  compressor.knee.value = COMPRESSOR.knee;
  compressor.ratio.value = COMPRESSOR.ratio;
  compressor.attack.value = COMPRESSOR.attack;
  compressor.release.value = COMPRESSOR.release;
  master.connect(compressor).connect(destination);
  return master;
}

/**
 * Öffnet das Audiogerät. Die Lautstärke liegt hinter dem Kompressor und wirkt so genau wie
 * eingestellt.
 */
function openAudio(volume: number) {
  const context = new AudioContext();
  const level = context.createGain();
  level.gain.value = volume;
  level.connect(context.destination);
  return { context, level, output: createVoiceOutput(context, level) };
}

/** Eine Uhr ab jetzt in Sekunden, für einen Laut, den man nicht hört: Der Mund bewegt sich trotzdem. */
export function startClock() {
  const startedAt = performance.now();
  return () => (performance.now() - startedAt) / 1000;
}

/** Wie eine Stimme klingt und wohin sie singt. */
export interface VoiceOptions {
  timbre?: VoiceTimbre;
  layers?: VoiceLayers;
  /** Je Phrase der Weg in einen fremden Mischer, `null` solange nichts klingen darf. */
  route?: () => VoiceRoute | null;
}

/** Pegel und Kompressor je fremdem Eingang, einmal gebaut. */
const ROUTED = new WeakMap<AudioNode, AudioNode>();

/** Der Weg, den `route` gerade in einen fremden Mischer gibt: ohne eigenes Audiogerät und Ruhepause. */
function routedWay(route: () => VoiceRoute | null) {
  const found = route();
  if (!found) return null;
  const output = ROUTED.get(found.output) ?? createVoiceOutput(found.context, found.output);
  ROUTED.set(found.output, output);
  return { context: found.context, output, started: found.onPhrase };
}

/** Das eigene Audiogerät: erst geöffnet, wenn etwas klingt, nach etwas Stille wieder frei. */
function ownDevice() {
  let audio: ReturnType<typeof openAudio> | null = null;
  let volume = 1;
  let idle: number | undefined;
  return {
    setVolume(gain: number) {
      volume = gain;
      audio?.level.gain.setTargetAtTime(volume, audio.context.currentTime, VOLUME_GLIDE);
    },
    way() {
      audio ??= openAudio(volume);
      const { context, output } = audio;
      // Nicht abwarten: WebKit kann das Versprechen lange offen lassen, die Uhr steht bis dahin nur.
      void context.resume().catch(() => null);
      const started = (_start: number, end: number) => {
        window.clearTimeout(idle);
        const wait = (end - context.currentTime + IDLE_SECONDS) * 1000;
        idle = window.setTimeout(() => void context.suspend().catch(() => null), wait);
      };
      return { context, output, started };
    },
  };
}

/**
 * Eine Stimme. Ohne Optionen die des Jellys: Sie hält genau einen `AudioContext`, aber erst, wenn
 * es wirklich etwas zu hören gibt. Wer stumm schaltet, hält kein Audiogerät offen.
 */
export function createVoice(options: VoiceOptions = {}) {
  const sing = phrasePlayer(options.timbre ?? JELLY_TIMBRE, options.layers);
  const own = ownDevice();
  const way = () => (options.route ? routedWay(options.route) : own.way());
  let armed = false;
  let current: { phrase: Phrase; context: BaseAudioContext } | null = null;

  /** Löst die laufende Phrase ab. */
  function hush() {
    current?.phrase.fade(current.context.currentTime);
    current = null;
  }

  return {
    /** Merkt sich die erste Geste. Vorher bleibt das Jelly still, auch beim Start der App. */
    arm() {
      armed = true;
    },
    /** Setzt die Lautstärke in Prozent, auch für einen Ton, der gerade läuft. */
    setVolume(percent: number) {
      own.setVolume(volumeGain(percent));
    },
    /**
     * Spielt Noten und löst dabei ab, was gerade läuft. Fehler bleiben hier: Ton darf nie stören.
     *
     * @returns Eine Uhr in Sekunden ab der ersten Note, für den Mund. `null`, wenn nichts erklingt.
     *   Sie läuft auf der Audio-Zeit: Nach langer Stille braucht das Audio einen Moment zum
     *   Aufwachen, und der Mund soll nicht vorauslaufen.
     */
    play(notes: VoiceNote[]) {
      if (!armed || notes.length === 0) return null;
      try {
        const target = way();
        if (!target) return null;
        const { context, output } = target;
        hush();
        const start = context.currentTime + LEAD_SECONDS;
        const sentAt = performance.now();
        const phrase = sing(context, output, notes, start);
        current = { phrase, context };
        target.started(start, phrase.end);
        const late = () => (performance.now() - sentAt) / 1000 - MAX_WAKE_SECONDS;
        return () => Math.max(context.currentTime - start, late());
      } catch {
        // Ohne Audiogerät oder WebAudio bleibt das Jelly eben stumm.
        return null;
      }
    },
    /** Beendet, was gerade läuft. */
    stop() {
      try {
        hush();
      } catch {
        // Siehe `play`.
      }
    },
  };
}
