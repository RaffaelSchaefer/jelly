/**
 * Der Mischer des Zauberladens: Plätze im Stereobild, ein Bus je Art mit Anteil am Hall, dann
 * Begrenzer und Lautstärke. Das Ambiente läuft über drei eigene Stufen: Ducken, Fokus und
 * Einblenden.
 *
 * Kein Regler liest je `AudioParam.value`, und keiner nutzt `cancelAndHoldAtTime`, das Safari nicht
 * kennt. Jeder Regler kennt seinen geplanten Verlauf selbst, und Ducken plant nur Zielwerte.
 *
 * @module
 */

import {
  dbToGain,
  levelPlan,
  LIMITER,
  MIX,
  REVERB_SENDS,
  SOUND_PANS,
  type LevelSpan,
  type LevelStep,
  type SoundBus,
  type SoundPlace,
} from "../../pet/shopMix";
import { createRoom } from "./room";
import { createPan, gainNode } from "./synth";

/** Ein Regler, der seinen geplanten Verlauf selbst kennt. Neue Befehle gelten ab jetzt. */
export interface Level {
  /** Der geplante Wert zur Zeit `time`. */
  valueAt(time: number): number;
  /** Springt sofort auf `value`. */
  set(value: number): void;
  /** Gleitet ab jetzt mit der Zeitkonstante `tau` zu `to`. */
  glide(to: number, tau: number): void;
  /** Hält den Wert bis `from` und läuft dann linear bis `until` zu `to`. */
  ramp(to: number, from: number, until: number): void;
}

/** Ein Stück im Verlauf eines Reglers. */
type Segment =
  | { at: number; kind: "hold"; value: number }
  | { at: number; kind: "glide"; from: number; to: number; tau: number }
  | { at: number; kind: "ramp"; from: number; to: number; until: number };

/** Der Wert eines Stücks zur Zeit `time`. */
function valueOf(segment: Segment, time: number) {
  if (segment.kind === "hold") return segment.value;
  const elapsed = Math.max(0, time - segment.at);
  if (segment.kind === "glide") {
    return segment.to + (segment.from - segment.to) * Math.exp(-elapsed / segment.tau);
  }
  const share = Math.min(1, elapsed / Math.max(1e-6, segment.until - segment.at));
  return segment.from + (segment.to - segment.from) * share;
}

/** Das letzte Element, das bis `time` begonnen hat. Ohne `findLast`, das Safari 15.0 fehlt. */
function lastBefore<T extends { at: number }>(items: readonly T[], time: number) {
  let found: T | undefined;
  for (const item of items) if (item.at <= time) found = item;
  return found;
}

/** Ein Regler für `param`, der bei `initial` beginnt. */
export function createLevel(param: AudioParam, context: BaseAudioContext, initial: number): Level {
  let segments: Segment[] = [{ at: 0, kind: "hold", value: initial }];
  param.value = initial;

  function valueAt(time: number) {
    const segment = lastBefore(segments, time) ?? segments[0];
    return segment ? valueOf(segment, time) : initial;
  }

  /** Verwirft alles ab jetzt und hält den Wert, den der Regler gerade hat. */
  function anchor() {
    const now = context.currentTime;
    const value = valueAt(now);
    segments = segments.filter((segment) => segment.at < now).slice(-1);
    segments.push({ at: now, kind: "hold", value });
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
    return { now, value };
  }

  return {
    valueAt,
    set(value) {
      const { now } = anchor();
      segments.push({ at: now, kind: "hold", value });
      param.setValueAtTime(value, now);
    },
    glide(to, tau) {
      const { now, value } = anchor();
      segments.push({ at: now, kind: "glide", from: value, to, tau });
      param.setTargetAtTime(to, now, tau);
    },
    ramp(to, from, until) {
      const { now, value } = anchor();
      const start = Math.max(now, from);
      segments.push({ at: start, kind: "ramp", from: value, to, until: Math.max(start, until) });
      param.setValueAtTime(value, start);
      param.linearRampToValueAtTime(to, Math.max(start, until));
    },
  };
}

/** Ein Pegel aus überlagerten Zeiträumen, etwa Ducken unter Sprache oder die Kugel beim Laden. */
export interface SpanLevel {
  /** Verschiebt den Pegel um `db` von `from` bis `to`. Ohne `to` bleibt es, bis `end` es schließt. */
  add(db: number, from: number, to?: number): LevelSpan;
  /** Schließt einen Zeitraum früher. */
  end(span: LevelSpan, at: number): void;
}

/**
 * Plant einen Wert aus Zeiträumen. Es gilt immer der stärkste, nur Zielwerte werden geplant.
 *
 * @param map - Macht aus dem Ausschlag den Wert des Parameters, sonst eine Verstärkung aus dB.
 */
export function createSpanLevel(
  param: AudioParam,
  context: BaseAudioContext,
  map: (db: number) => number = dbToGain,
): SpanLevel {
  let spans: LevelSpan[] = [];
  let plan: LevelStep[] = [];

  function replan() {
    const now = context.currentTime;
    spans = spans.filter((span) => span.to > now);
    const heading = lastBefore(plan, now)?.db ?? 0;
    plan = levelPlan(spans, now, heading);
    param.cancelScheduledValues(now);
    for (const step of plan) param.setTargetAtTime(map(step.db), step.at, step.tau);
  }

  return {
    add(db, from, to = Infinity) {
      const span = { from, to, db };
      spans.push(span);
      replan();
      return span;
    },
    end(span, at) {
      span.to = Math.min(span.to, at);
      replan();
    },
  };
}

/** Der ganze Mischer eines Kontexts. */
export interface ShopMixer {
  readonly context: BaseAudioContext;
  /** Eingang eines Busses. Das Ambiente beginnt vor seinen eigenen Stufen. */
  bus(name: SoundBus): AudioNode;
  /**
   * Ein fester Platz auf einem Bus, für Stimmen und Ambiente. Kurze Geräusche stellen sich selbst
   * hin.
   */
  place(place: SoundPlace, bus: SoundBus): AudioNode;
  /** Eingang des Halls, für einen größeren Anteil einzelner Geräusche. */
  readonly reverb: AudioNode;
  /** Vor dem Begrenzer: Verstecken, Ruhe und Schließen blenden hier aus. */
  readonly master: Level;
  /** Hinter dem Begrenzer: die Lautstärke aus den Einstellungen. */
  readonly volume: Level;
  /** Einblenden des Ambientes: nach der ersten Geste und wenn das Fenster zurückkommt. */
  readonly bedFade: Level;
  /** Ohne Fokus spielt das Ambiente leiser. */
  readonly bedFocus: Level;
  /** Duckt das Ambiente um `db` für `ms`, ab `delayMs` von jetzt. */
  duck(db: number, ms: number, delayMs?: number): LevelSpan;
}

/** Der Begrenzer vor der Lautstärke. */
function createLimiter(context: BaseAudioContext) {
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  return limiter;
}

/** Die Kette hinter den Bussen: Master, Begrenzer, Lautstärke, Ausgang. Dazu der Hall. */
function createChain(context: BaseAudioContext, volume: number, destination: AudioNode) {
  const master = context.createGain();
  const level = context.createGain();
  master.connect(createLimiter(context)).connect(level).connect(destination);
  const room = createRoom(context);
  room.output.connect(master);
  return {
    master,
    room,
    masterLevel: createLevel(master.gain, context, 1),
    volumeLevel: createLevel(level.gain, context, volume),
  };
}

/** Die Stufen des Ambientes: Ducken, dann Fokus, dann Einblenden. */
function createBed(context: BaseAudioContext, output: AudioNode) {
  const duck = context.createGain();
  const focus = context.createGain();
  const fade = context.createGain();
  duck.connect(focus).connect(fade).connect(output);
  return {
    input: duck,
    duck: createSpanLevel(duck.gain, context),
    focus: createLevel(focus.gain, context, 1),
    fade: createLevel(fade.gain, context, 0),
  };
}

/**
 * Baut den Mischer. Busse und Plätze entstehen erst, wenn sie jemand braucht.
 *
 * @param volume - Verstärkung der Lautstärke, etwa aus `volumeGain`.
 */
export function createMixer(
  context: BaseAudioContext,
  volume = 1,
  destination: AudioNode = context.destination,
): ShopMixer {
  const chain = createChain(context, volume, destination);
  const buses = new Map<SoundBus, AudioNode>();
  const places = new Map<string, AudioNode>();

  function categoryBus(name: SoundBus) {
    let node = buses.get(name);
    if (!node) {
      node = gainNode(context, dbToGain(MIX[name]));
      node.connect(chain.master);
      node.connect(gainNode(context, REVERB_SENDS[name])).connect(chain.room.input);
      buses.set(name, node);
    }
    return node;
  }

  const bed = createBed(context, categoryBus("ambience"));

  function bus(name: SoundBus) {
    return name === "ambience" ? bed.input : categoryBus(name);
  }

  return {
    context,
    bus,
    place(place, name) {
      const key = `${place}:${name}`;
      let node = places.get(key);
      if (!node) {
        node = SOUND_PANS[place] === 0 ? bus(name) : createPan(context, SOUND_PANS[place]);
        if (node !== bus(name)) node.connect(bus(name));
        places.set(key, node);
      }
      return node;
    },
    reverb: chain.room.input,
    master: chain.masterLevel,
    volume: chain.volumeLevel,
    bedFade: bed.fade,
    bedFocus: bed.focus,
    duck(db, ms, delayMs = 0) {
      const from = context.currentTime + delayMs / 1000;
      return bed.duck.add(db, from, from + ms / 1000);
    },
  };
}
