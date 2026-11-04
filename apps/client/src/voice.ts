/**
 * Macht die Stimme des Jellys hörbar: ein kleiner Synthesizer aus WebAudio, ohne Samples.
 *
 * Zwei leicht verstimmte Sägezähne geben den Ton, drei Formant-Filter machen daraus Vokale, leises
 * Rauschen klingt nach Atem und kurze Rausch-Stöße nach Konsonanten. Die Noten kommen aus
 * `pet/voice.ts`. Klingt die Stimme falsch, sind `FORMANTS`, `DETUNE_CENTS`, `BREATH` und
 * `MASTER_GAIN` hier sowie Grundton und Tempo dort die Stellschrauben.
 *
 * @module
 */

import { VIBRATO_HZ, volumeGain, type VoiceNote, type Vowel } from "./pet";

/** Die drei Formanten je Vokal in Hertz, für eine kleine, helle Stimme. */
const FORMANTS: Record<Vowel, readonly [number, number, number]> = {
  a: [950, 1500, 3100],
  e: [560, 2200, 3200],
  i: [340, 2700, 3700],
  o: [560, 1000, 3000],
  u: [360, 800, 2700],
};

/** Lautstärke und Schärfe der drei Formant-Filter. */
const FORMANT_GAINS = [1, 0.75, 0.35] as const;
const FORMANT_Q = [4, 6, 8] as const;

/** Wie schnell die Filter zum nächsten Vokal gleiten, als Zeitkonstante in Sekunden. */
const VOWEL_GLIDE = 0.015;

/**
 * Anteil des ungefilterten Tons: Er hält die Stimme auch dort, wo kein Oberton einen Formanten
 * trifft.
 */
const BODY_GAIN = 0.16;
const BODY_CUTOFF = 2400;

/** Abstand der zwei Oszillatoren in Cent. Etwas Schwebung nimmt dem Ton das Piepsige. */
const DETUNE_CENTS = 7;

/** Grundstärke des Vibratos in Cent. Lange Töne bringen ihre eigene Stärke mit. */
const VIBRATO_CENTS = 5;

/** Anteil des Tonhöhen-Gleitens an der Note. */
const GLIDE_SHARE = 0.55;

/**
 * Hüllkurve einer Note: Einschwingen in Sekunden, bis zu diesem Anteil der Note halten, dann
 * ausklingen.
 */
const ATTACK = 0.012;
const SUSTAIN = 0.78;
const HOLD_SHARE = 0.8;

/** Pegel des Tons vor dem Clipping. Weit darüber würde das Clipping hart und die Stimme kratzig. */
const VOICE_LEVEL = 0.38;

/** Lautstärke des Atems. */
const BREATH = 0.05;

/** So weit über dem Grundton liegt der erste Formant mindestens. */
const FIRST_FORMANT_ABOVE_PITCH = 1.05;

/** Konsonanten: Länge in Sekunden und Lautstärke. */
const ONSETS = {
  tick: { seconds: 0.012, gain: 0.5 },
  hiss: { seconds: 0.032, gain: 0.22 },
} as const;
const ONSET_CUTOFF = 2600;

/** Stärke des weichen Clippings. */
const DRIVE = 1.8;

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

/** Die Kennlinie des weichen Clippings. */
function createDriveCurve() {
  const curve = new Float32Array(1025);
  curve.forEach((_, index) => {
    curve[index] = Math.tanh(((index - 512) / 512) * DRIVE) / Math.tanh(DRIVE);
  });
  return curve;
}

/** Einmal gerechnet, jede Phrase nutzt dieselbe Kennlinie. */
const DRIVE_CURVE = createDriveCurve();

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
function startNoise(context: BaseAudioContext, start: number) {
  const buffer = NOISE.get(context) ?? createNoise(context);
  NOISE.set(context, buffer);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start(start);
  return source;
}

/** Gleitet je Note von ihrer Anfangs- zur Zieltonhöhe. */
function schedulePitch(frequency: AudioParam, notes: VoiceNote[], start: number) {
  for (const note of notes) {
    frequency.setValueAtTime(note.from, start + note.at);
    frequency.exponentialRampToValueAtTime(note.to, start + note.at + note.duration * GLIDE_SHARE);
  }
}

/** Linear, denn ein exponentieller Verlauf darf 0 nicht erreichen. `level` skaliert die ganze Kurve. */
function scheduleEnvelope(gain: AudioParam, notes: VoiceNote[], start: number, level = 1) {
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
function formantOf(note: VoiceNote, index: number) {
  const target = FORMANTS[note.vowel][index] ?? 1000;
  return index === 0 ? Math.max(target, note.to * FIRST_FORMANT_ABOVE_PITCH) : target;
}

/** Baut die Formant-Filter und führt sie je Note zu ihrem Vokal. Alle laufen in `output` zusammen. */
function createFormants(
  context: BaseAudioContext,
  notes: VoiceNote[],
  start: number,
  output: AudioNode,
) {
  return FORMANT_GAINS.map((level, index) => {
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = FORMANT_Q[index] ?? 1;
    for (const note of notes) {
      const target = formantOf(note, index);
      if (note === notes[0]) filter.frequency.setValueAtTime(target, start);
      filter.frequency.setTargetAtTime(target, start + note.at, VOWEL_GLIDE);
    }
    const gain = context.createGain();
    gain.gain.value = level;
    filter.connect(gain).connect(output);
    return filter;
  });
}

/** Die zwei Oszillatoren samt Vibrato, je Note mit eigener Stärke. Liefert alle Quellen. */
function startOscillators(
  context: BaseAudioContext,
  notes: VoiceNote[],
  start: number,
  output: AudioNode,
) {
  const vibrato = context.createOscillator();
  vibrato.frequency.value = VIBRATO_HZ;
  const depth = context.createGain();
  depth.gain.setValueAtTime(VIBRATO_CENTS, start);
  for (const note of notes) {
    if (note.shake)
      depth.gain.setTargetAtTime(note.shake, start + note.at + note.duration * 0.25, 0.06);
  }
  vibrato.connect(depth);
  vibrato.start(start);
  const voices = [-DETUNE_CENTS, DETUNE_CENTS].map((detune) => {
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
function createThroat(
  context: BaseAudioContext,
  notes: VoiceNote[],
  start: number,
  output: AudioNode,
) {
  const drive = context.createWaveShaper();
  drive.curve = DRIVE_CURVE;
  drive.connect(output);
  const throat = context.createGain();
  for (const filter of createFormants(context, notes, start, drive)) throat.connect(filter);
  const body = context.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.value = BODY_CUTOFF;
  const bodyGain = context.createGain();
  bodyGain.gain.value = BODY_GAIN;
  throat.connect(body).connect(bodyGain).connect(drive);
  return throat;
}

/** Atem und Konsonanten aus demselben Rauschen. */
function startNoiseVoices(
  context: BaseAudioContext,
  notes: VoiceNote[],
  start: number,
  routes: { throat: AudioNode; output: AudioNode },
) {
  const noise = startNoise(context, start);
  const breath = context.createGain();
  scheduleEnvelope(breath.gain, notes, start, BREATH);
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
 * Spielt Noten ab `start` in `output`. Geht auch mit einem `OfflineAudioContext`, deshalb lässt
 * sich der Klang rendern und prüfen.
 *
 * @param notes - Darf nicht leer sein, Noten dürfen sich nicht überlappen.
 * @returns Die laufende Phrase. Sie räumt sich nach ihrem Ende selbst auf.
 */
export function playNotes(
  context: BaseAudioContext,
  output: AudioNode,
  notes: VoiceNote[],
  start: number,
): Phrase {
  // Die Hüllkurven liegen eine Stufe davor: So kann `fade` ausblenden, ohne ihre Rampen anzufassen.
  const fader = context.createGain();
  fader.connect(output);
  const throat = createThroat(context, notes, start, fader);
  const envelope = context.createGain();
  scheduleEnvelope(envelope.gain, notes, start, VOICE_LEVEL);
  envelope.connect(throat);
  const sources = [
    ...startOscillators(context, notes, start, envelope),
    startNoiseVoices(context, notes, start, { throat, output: fader }),
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
}

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

/**
 * Die Stimme der App. Hält genau einen `AudioContext`, aber erst, wenn es wirklich etwas zu hören
 * gibt: Wer stumm schaltet, hält kein Audiogerät offen.
 */
export function createVoice() {
  let armed = false;
  let volume = 1;
  let audio: ReturnType<typeof openAudio> | null = null;
  let phrase: Phrase | null = null;
  let idle: number | undefined;

  /** Löst die laufende Phrase ab. */
  function hush() {
    if (audio) phrase?.fade(audio.context.currentTime);
    phrase = null;
  }

  return {
    /** Merkt sich die erste Geste. Vorher bleibt das Jelly still, auch beim Start der App. */
    arm() {
      armed = true;
    },
    /** Setzt die Lautstärke in Prozent, auch für einen Ton, der gerade läuft. */
    setVolume(percent: number) {
      volume = volumeGain(percent);
      audio?.level.gain.setTargetAtTime(volume, audio.context.currentTime, VOLUME_GLIDE);
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
        audio ??= openAudio(volume);
        const { context, output } = audio;
        hush();
        // Nicht abwarten: WebKit kann das Versprechen lange offen lassen, die Uhr steht bis dahin nur.
        void context.resume().catch(() => null);
        const start = context.currentTime + LEAD_SECONDS;
        const sentAt = performance.now();
        phrase = playNotes(context, output, notes, start);
        window.clearTimeout(idle);
        idle = window.setTimeout(
          () => void context.suspend().catch(() => null),
          (phrase.end - context.currentTime + IDLE_SECONDS) * 1000,
        );
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
