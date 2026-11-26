/**
 * Die Geräusche der Oberfläche: Tippen, Auf- und Zuklappen, Wählen, Schalter, Fenster, Sperren,
 * Fehler und die schönen Momente im Spiel. Sie stammen aus der Bibliothek von reactsounds.com (MIT,
 * siehe `sounds/LICENSE`), nur Jingle und leise Musik der Jelly-News und die Musik zur Polonaise
 * sind eigene (`sounds/news/LICENSE`, `sounds/conga/LICENSE`). Die Musik spielt in Abschnitten
 * (`playWith`, `newsBedSound.ts`, `congaBedSound.ts`).
 *
 * Die MP3s liegen als Daten im Bundle und werden ohne `fetch` dekodiert: Die CSP der App erlaubt
 * weder `fetch` noch `blob:`, und auf der LAN fehlt vielleicht das Internet. Das Paket
 * `react-sounds` lädt jeden Ton per `fetch` und bliebe im gebauten Binary stumm, deshalb spielt die
 * App sie selbst. `tauri dev` und die Browser-Vorschau zeigen das nicht, dort gilt keine CSP.
 *
 * @module
 */

import { uiSoundFor, volumeGain, type UiSound } from "./pet";
import coin from "./sounds/arcade/coin.mp3?inline";
import hatch from "./sounds/arcade/power_up.mp3?inline";
import congaBed from "./sounds/conga/bed.mp3?inline";
import newsBed from "./sounds/news/bed.mp3?inline";
import news from "./sounds/news/intro.mp3?inline";
import error from "./sounds/notification/error.mp3?inline";
import invite from "./sounds/notification/message.mp3?inline";
import blocked from "./sounds/ui/blocked.mp3?inline";
import tap from "./sounds/ui/button_squishy.mp3?inline";
import select from "./sounds/ui/item_select.mp3?inline";
import close from "./sounds/ui/pop_close.mp3?inline";
import open from "./sounds/ui/pop_open.mp3?inline";
import success from "./sounds/ui/success_blip.mp3?inline";
import achievement from "./sounds/ui/success_chime.mp3?inline";
import toggleOff from "./sounds/ui/toggle_off.mp3?inline";
import toggleOn from "./sounds/ui/toggle_on.mp3?inline";
import windowClose from "./sounds/ui/window_close.mp3?inline";
import windowOpen from "./sounds/ui/window_open.mp3?inline";

/** Jedes Geräusch als Data-URL. */
const SOUNDS: Record<UiSound, string> = {
  tap,
  open,
  close,
  select,
  blocked,
  toggleOn,
  toggleOff,
  window: windowOpen,
  windowClose,
  success,
  error,
  coin,
  achievement,
  invite,
  hatch,
  news,
  newsBed,
  congaBed,
};

/**
 * Gleicht die Töne an, sie sind sehr verschieden laut abgemischt (lautestes Zehntel von −35 bis −4
 * dBFS). Klicks landen bei −20 dBFS, seltene Momente bei −16 dBFS. Leise Töne bleiben, wie sie
 * sind, hochgezogen wird keiner.
 */
const LEVELS: Record<UiSound, number> = {
  tap: 1,
  open: 0.81,
  close: 0.83,
  select: 0.2,
  blocked: 0.41,
  toggleOn: 1,
  toggleOff: 1,
  window: 0.23,
  windowClose: 0.28,
  success: 0.54,
  error: 0.25,
  coin: 0.46,
  achievement: 1,
  invite: 0.44,
  hatch: 0.38,
  news: 0.94,
  // Die Musik unter den Jelly-News liegt leise: ihr lautestes Zehntel bei −27 dBFS, gut 18 dB unter
  // den Sätzen des Vorlesers.
  newsBed: 0.72,
  // Die Musik zur Polonaise liegt noch darunter, sie soll nur im Hintergrund mitlaufen: ihr
  // lautestes Zehntel bei −35 dBFS, gut 7 dB unter der Musik der News (Datei −15,3 dBFS und
  // −20,6 LUFS, die der News −15,5 dBFS und −19,3 LUFS). Nach LUFS liegt sie 9 LU darunter.
  congaBed: 0.3,
};

/**
 * Lange Töne: Sie laufen nie doppelt und verstummen mit dem Schalter, wie die Stimme des Jellys.
 * Die kurzen klingen aus, sonst schnitte der Schalter sein eigenes Klicken ab.
 */
const LONG_SOUNDS: ReadonlySet<UiSound> = new Set(["news", "newsBed", "congaBed"]);

/**
 * Später als so viele Millisekunden nach dem Aufruf beginnt kein Ton mehr. Sperrt das Gerät Ton bis
 * zur ersten Geste, käme er sonst erst mit ihr, zur falschen Zeit.
 */
const LATE_MS = 1000;

/** So lange blendet ein langer Ton aus, wenn der Schalter ihn anhält, in Sekunden. */
const HUSH_SECONDS = 0.1;

/** Die Oberfläche begleitet nur, die Stimme des Jellys bleibt vorn. */
const UI_LEVEL = 0.35;

/** Nach so vielen Sekunden Stille gibt die Oberfläche das Audiogerät wieder frei. */
const IDLE_SECONDS = 3;

/** So lange klingt ein Schließen, bevor das Fenster wirklich zugeht. Sonst bräche der Ton ab. */
const CLOSE_LEAD_MS = 350;

/** Nur so kurz nach dem Klick auf die Karte heißt ein verstecktes Pet: Die Karte ist offen. */
const MAP_HIDE_MS = 3000;

/**
 * Ein Klangthema, das Geräusche selbst spielt, statt die MP3s. `true` heißt: erledigt. Nur der Shop
 * setzt eins (`shop/sound/useShopSound.ts`), Pet und Karte bleiben bei `null`.
 */
let theme: ((name: UiSound) => boolean) | null = null;

/**
 * Setzt das Klangthema des Fensters oder nimmt es mit `null` zurück. Es greift erst, wenn die
 * Geräusche an sind. Spielt es ein Geräusch nicht, klingt wie bisher das MP3.
 */
export function setUiSoundTheme(next: ((name: UiSound) => boolean) | null) {
  theme = next;
}

/** Ob das Klangthema das Geräusch übernimmt. Fehler darin bleiben hier: Ton darf nie stören. */
function themed(name: UiSound) {
  try {
    return theme?.(name) ?? false;
  } catch {
    return false;
  }
}

/** Liest eine Data-URL ohne `fetch`, das die CSP verbietet. */
function decodeDataUrl(url: string) {
  const base64 = url.slice(url.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
}

/** Das Audiogerät der Oberfläche mit ihrer Lautstärke. */
export interface UiAudio {
  context: AudioContext;
  output: GainNode;
}

/** Blendet einen Ton in `seconds` aus und hält ihn an, ohne Angabe schnell wie beim Schalter. */
export type Hush = (seconds?: number) => void;

/**
 * Wie ein Ton beginnt, sobald Audio und Daten bereit sind: `output` trägt die Lautstärke der
 * Oberfläche, `ended` meldet, wenn er aus ist.
 */
export type Starter = (target: UiAudio, buffer: AudioBuffer, ended: () => void) => Hush;

/** Ein Ton, der klingt oder noch auf Audio und Daten wartet. */
interface Playing {
  name: UiSound;
  /** Wann er erklingen sollte, auf der Uhr von `performance.now()`. */
  since: number;
  /** Blendet ihn aus und hält ihn an. `null`, solange er noch nicht klingt. */
  hush: Hush | null;
  /** Abgesagt, bevor er klang: Er beginnt nicht mehr. */
  cancelled: boolean;
}

/** Öffnet das Audiogerät beim ersten Geräusch. */
function openAudio(level: number): UiAudio {
  const context = new AudioContext();
  const output = context.createGain();
  output.gain.value = level;
  output.connect(context.destination);
  return { context, output };
}

/** Ein Eingang mit dem Pegel des Geräuschs `name` aus {@link LEVELS}, der nach `output` führt. */
export function levelFor(context: BaseAudioContext, name: UiSound, output: AudioNode) {
  const gain = context.createGain();
  gain.gain.value = LEVELS[name];
  gain.connect(output);
  return gain;
}

/**
 * Der Pegel der Oberfläche bei voller Lautstärke, für einen fremden Kontext wie einen
 * `OfflineAudioContext`. Liefert den Eingang.
 */
export function uiOutput(context: BaseAudioContext, destination: AudioNode = context.destination) {
  const output = context.createGain();
  output.gain.value = UI_LEVEL;
  output.connect(destination);
  return output;
}

/** Dekodiert ein Geräusch in `context`. */
export function decodeUiSound(context: BaseAudioContext, name: UiSound) {
  return context.decodeAudioData(decodeDataUrl(SOUNDS[name]));
}

/** Führt ein dekodiertes Geräusch über seinen Pegel aus {@link LEVELS} nach `output`. */
function connectSound(
  context: BaseAudioContext,
  output: AudioNode,
  name: UiSound,
  buffer: AudioBuffer,
) {
  const gain = levelFor(context, name, output);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  return { gain, source };
}

/**
 * Plant ein Geräusch in einen beliebigen Kontext, etwa einen `OfflineAudioContext`, mit derselben
 * Kette wie in der App bei voller Lautstärke: sein Pegel, dann der der Oberfläche. So rendert
 * `newsVoiceRender.ts` den Jingle wie live.
 *
 * @param at - Beginn auf der Uhr des Kontexts in Sekunden.
 */
export async function scheduleUiSound(
  context: BaseAudioContext,
  name: UiSound,
  at: number,
  destination: AudioNode = context.destination,
) {
  const buffer = await decodeUiSound(context, name);
  connectSound(context, uiOutput(context, destination), name, buffer).source.start(at);
}

/**
 * Startet ein dekodiertes Geräusch in seiner Lautstärke. `ended` meldet, wenn es aus ist.
 *
 * @returns Blendet es aus und hält es an.
 */
function startSound(
  { context, output }: UiAudio,
  name: UiSound,
  buffer: AudioBuffer,
  ended: () => void,
) {
  const { gain, source } = connectSound(context, output, name, buffer);
  source.addEventListener("ended", () => {
    gain.disconnect();
    ended();
  });
  source.start();
  return (seconds = HUSH_SECONDS) => {
    try {
      const now = context.currentTime;
      gain.gain.setTargetAtTime(0, now, seconds / 4);
      source.stop(now + seconds);
    } catch {
      // Siehe `play`.
    }
  };
}

/**
 * Ob `entry` jetzt noch beginnen soll: nicht zu spät ({@link LATE_MS}), ein langer Ton nur bei
 * eingeschaltetem Ton und nur, wenn er nicht schon klingt ({@link LONG_SOUNDS}).
 */
function isWanted(entry: Playing, playing: ReadonlySet<Playing>, enabled: boolean) {
  if (entry.cancelled || performance.now() - entry.since > LATE_MS) return false;
  if (!LONG_SOUNDS.has(entry.name)) return true;
  return enabled && ![...playing].some((other) => other.name === entry.name && other.hush);
}

/** Die dekodierten Geräusche. Es gibt je Fenster nur ein Audiogerät der Oberfläche. */
const BUFFERS = new Map<UiSound, Promise<AudioBuffer>>();

/** Dekodiert ein Geräusch einmal und hebt es auf. */
function bufferOf(context: AudioContext, name: UiSound) {
  let buffer = BUFFERS.get(name);
  if (!buffer) {
    buffer = decodeUiSound(context, name);
    BUFFERS.set(name, buffer);
  }
  return buffer;
}

/**
 * Spielt die Geräusche. Hält ein eigenes `AudioContext`, aber erst beim ersten Geräusch: Wer stumm
 * schaltet, hält kein Audiogerät offen.
 */
function createUiSounds() {
  let enabled = false;
  let level = UI_LEVEL;
  let audio: UiAudio | null = null;
  let idle: number | undefined;
  const playing = new Set<Playing>();

  /** Gibt das Audiogerät frei, wenn eine Weile nichts mehr klingt. Ein langer Ton hält es offen. */
  function rest(context: AudioContext) {
    window.clearTimeout(idle);
    idle = window.setTimeout(() => {
      if (playing.size === 0) void context.suspend().catch(() => null);
    }, IDLE_SECONDS * 1000);
  }

  /** Vergisst einen Ton, der aus ist oder nicht mehr beginnen soll. */
  function forget(context: AudioContext, entry: Playing) {
    playing.delete(entry);
    rest(context);
  }

  /** Beginnt `entry` mit `starter`, sobald das Audio läuft und der Ton dekodiert ist. */
  function begin(target: UiAudio, entry: Playing, starter: Starter) {
    const { context } = target;
    void Promise.all([context.resume(), bufferOf(context, entry.name)])
      .then(([, buffer]) => {
        if (!isWanted(entry, playing, enabled)) return forget(context, entry);
        entry.hush = starter(target, buffer, () => forget(context, entry));
      })
      .catch(() => forget(context, entry));
  }

  /** Meldet einen Ton an und beginnt ihn. `null` ohne Audio. */
  function start(name: UiSound, starter: Starter) {
    try {
      audio ??= openAudio(level);
      const entry: Playing = { name, since: performance.now(), hush: null, cancelled: false };
      playing.add(entry);
      begin(audio, entry, starter);
      rest(audio.context);
      return entry;
    } catch {
      // Ohne Audiogerät oder WebAudio bleibt die Oberfläche eben still.
      return null;
    }
  }

  return {
    /** Übernimmt die Einstellungen: Geräusche an oder aus, Lautstärke in Prozent. */
    configure(sound: boolean, percent: number) {
      enabled = sound;
      level = volumeGain(percent) * UI_LEVEL;
      audio?.output.gain.setTargetAtTime(level, audio.context.currentTime, 0.05);
      if (sound) return;
      for (const entry of playing) if (LONG_SOUNDS.has(entry.name)) halt(entry);
    },
    /**
     * Spielt ein Geräusch. Fehler bleiben hier: Ton darf nie stören.
     *
     * @returns Ob es erklingen soll. Stumm geschaltet oder ohne Audio `false`.
     */
    play(name: UiSound) {
      if (!enabled) return false;
      if (themed(name)) return true;
      const starter: Starter = (target, buffer, ended) => startSound(target, name, buffer, ended);
      return start(name, starter) !== null;
    },
    /**
     * Beginnt einen Ton, der selbst plant, wie er klingt, etwa Musik in Abschnitten. Liefert, wie
     * er endet, auch bevor er klingt. `null`, wenn er nicht klingen soll.
     */
    playWith(name: UiSound, starter: Starter): Hush | null {
      if (!enabled) return null;
      const entry = start(name, starter);
      return entry && ((seconds) => halt(entry, seconds));
    },
  };
}

/**
 * Hält einen Ton an, auch einen, der noch auf Audio wartet. Er zählt danach nicht mehr als
 * klingend, so darf derselbe lange Ton schon neu beginnen, während er ausblendet.
 */
function halt(entry: Playing, seconds?: number) {
  entry.cancelled = true;
  entry.hush?.(seconds);
  entry.hush = null;
}

/** Die Geräusche der ganzen App. */
export const uiSounds = createUiSounds();

/** Spielt `sound` und ruft `then` erst kurz danach, etwa bevor ein Fenster zugeht. */
export function playThen(sound: UiSound, then: () => void) {
  if (uiSounds.play(sound)) window.setTimeout(then, CLOSE_LEAD_MS);
  else then();
}

/** Wann die Karte angeklickt wurde, und ob das Pet ihretwegen gerade versteckt ist. */
let mapClickedAt = -Infinity;
let awayForMap = false;

/** Spielt das Geräusch zu einem Klick auf einen Knopf, bevor React den Klick verarbeitet. */
function onClick(event: MouseEvent) {
  const button = event.target instanceof Element ? event.target.closest("button") : null;
  if (!button) return;
  const sound = uiSoundFor({
    sound: button.getAttribute("data-sound"),
    blocked: button.getAttribute("aria-disabled") === "true",
    expanded: button.getAttribute("aria-expanded"),
    role: button.getAttribute("role"),
  });
  if (sound === "window") mapClickedAt = performance.now();
  if (sound) uiSounds.play(sound);
}

/** Schalter klingen nach ihrem neuen Zustand, eine Wahl zwischen Optionen wählt. */
function onChange(event: Event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.type === "checkbox") uiSounds.play(input.checked ? "toggleOn" : "toggleOff");
  else if (input.type === "radio" && input.checked) uiSounds.play("select");
}

/** Zeigt sich das Pet wieder, nachdem es für die Karte verschwunden war, ging die Karte zu. */
function onVisibility() {
  if (document.hidden) {
    awayForMap = performance.now() - mapClickedAt < MAP_HIDE_MS;
    return;
  }
  if (!awayForMap) return;
  awayForMap = false;
  uiSounds.play("windowClose");
}

/** Hört auf Klicks, Schalter und das Pet-Fenster. Liefert das Aufräumen. */
export function listenForUiSounds() {
  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
