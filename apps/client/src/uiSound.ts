/**
 * Die Geräusche der Oberfläche: Tippen, Auf- und Zuklappen, Wählen, Schalter, Fenster, Sperren,
 * Fehler und die schönen Momente im Spiel. Sie stammen aus der Bibliothek von reactsounds.com (MIT,
 * siehe `sounds/LICENSE`).
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
};

/** Die Oberfläche begleitet nur, die Stimme des Jellys bleibt vorn. */
const UI_LEVEL = 0.35;

/** Nach so vielen Sekunden Stille gibt die Oberfläche das Audiogerät wieder frei. */
const IDLE_SECONDS = 3;

/** So lange klingt ein Schließen, bevor das Fenster wirklich zugeht. Sonst bräche der Ton ab. */
const CLOSE_LEAD_MS = 350;

/** Nur so kurz nach dem Klick auf die Karte heißt ein verstecktes Pet: Die Karte ist offen. */
const MAP_HIDE_MS = 3000;

/** Liest eine Data-URL ohne `fetch`, das die CSP verbietet. */
function decodeDataUrl(url: string) {
  const base64 = url.slice(url.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
}

/**
 * Spielt die Geräusche. Hält ein eigenes `AudioContext`, aber erst beim ersten Geräusch: Wer stumm
 * schaltet, hält kein Audiogerät offen.
 */
function createUiSounds() {
  let enabled = false;
  let level = UI_LEVEL;
  let audio: { context: AudioContext; output: GainNode } | null = null;
  let idle: number | undefined;
  const buffers = new Map<UiSound, Promise<AudioBuffer>>();

  /** Öffnet das Audiogerät beim ersten Geräusch. */
  function openAudio() {
    const context = new AudioContext();
    const output = context.createGain();
    output.gain.value = level;
    output.connect(context.destination);
    return { context, output };
  }

  /** Dekodiert ein Geräusch einmal und hebt es auf. */
  function bufferOf(context: AudioContext, name: UiSound) {
    let buffer = buffers.get(name);
    if (!buffer) {
      buffer = context.decodeAudioData(decodeDataUrl(SOUNDS[name]));
      buffers.set(name, buffer);
    }
    return buffer;
  }

  /** Startet ein dekodiertes Geräusch in seiner Lautstärke. */
  function start(context: AudioContext, output: AudioNode, name: UiSound, buffer: AudioBuffer) {
    const gain = context.createGain();
    gain.gain.value = LEVELS[name];
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain).connect(output);
    source.addEventListener("ended", () => gain.disconnect());
    source.start();
  }

  return {
    /** Übernimmt die Einstellungen: Geräusche an oder aus, Lautstärke in Prozent. */
    configure(sound: boolean, percent: number) {
      enabled = sound;
      level = volumeGain(percent) * UI_LEVEL;
      audio?.output.gain.setTargetAtTime(level, audio.context.currentTime, 0.05);
    },
    /**
     * Spielt ein Geräusch. Fehler bleiben hier: Ton darf nie stören.
     *
     * @returns Ob es erklingen soll. Stumm geschaltet oder ohne Audio `false`.
     */
    play(name: UiSound) {
      if (!enabled) return false;
      try {
        audio ??= openAudio();
        const { context, output } = audio;
        void context.resume().catch(() => null);
        void bufferOf(context, name)
          .then((buffer) => start(context, output, name, buffer))
          .catch(() => null);
        window.clearTimeout(idle);
        idle = window.setTimeout(
          () => void context.suspend().catch(() => null),
          IDLE_SECONDS * 1000,
        );
        return true;
      } catch {
        // Ohne Audiogerät oder WebAudio bleibt die Oberfläche eben still.
        return false;
      }
    },
  };
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
