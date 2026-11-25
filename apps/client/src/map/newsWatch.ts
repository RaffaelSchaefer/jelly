/**
 * Der Knopf „Sendung ansehen“ oben in der Mitte der Karte. Er erscheint, solange die Jelly-News
 * laufen, und lässt die News-Kamera der Bühne filmen. Die Karte gehört dem Nutzer: Ohne Klick filmt
 * sie nie (`newsCamera: "manual"` in `main.ts`). Jede Hand an der Kamera beendet das Zusehen, die
 * Bühne meldet das über `readNews`, und der Knopf folgt in jedem Bild. Taste N wie News.
 *
 * Fest statt Glas und in den Farben der Bauchbinde: Er gehört zur Sendung, nicht zur Karte, und
 * kostet so keinen Platz im Glas (`LAYOUT.maxShapes` in `glass.ts`).
 *
 * @module
 */

import type { NewsReading } from "@jelly/stage";

const TEXT_WATCH = "Sendung ansehen";
const TEXT_BACK = "Zurück zur Karte";
const KEY = "n";

/** Wie der Knopf gerade aussieht. */
export interface NewsButtonLook {
  /** Die Kamera filmt die Sendung, der Knopf führt zurück. */
  watching: boolean;
  label: string;
  /** Das Geräusch zum Klick (`data-sound`), nach dem, was er gleich tut. */
  sound: "toggleOn" | "toggleOff";
}

/** Was die Karte von der Bühne braucht. `null`, bis sie läuft. */
export interface NewsWatchActions {
  readNews: () => NewsReading | null;
  watchNews: (on: boolean) => void;
}

/** Was die Seite mit dem Knopf tun kann. */
export interface NewsWatch {
  /**
   * Zeigt den Stand der Bühne und ändert das DOM nur, wenn er sich geändert hat. `true`, wenn das
   * Zusehen gerade begonnen hat: Dann soll weichen, was an einem Jelly im alten Bild hing.
   */
  show: (reading: NewsReading) => boolean;
}

/** Wie der Knopf zu einem Stand der Bühne aussieht, `null`: verborgen, es läuft keine Sendung. */
export function describeNewsButton(reading: NewsReading): NewsButtonLook | null {
  if (!reading.onAir) return null;
  const label = reading.watching ? TEXT_BACK : TEXT_WATCH;
  return {
    watching: reading.watching,
    label,
    sound: reading.watching ? "toggleOff" : "toggleOn",
  };
}

/** Schaltet zwischen Sendung und Karte um. Ohne Sendung gibt es nichts zu sehen. */
function toggle(actions: NewsWatchActions) {
  const reading = actions.readNews();
  if (reading?.onAir) actions.watchNews(!reading.watching);
}

/** Taste N schaltet um, solange eine Sendung läuft. In der Suche ist N ein Buchstabe. */
function listenToKey(actions: NewsWatchActions) {
  window.addEventListener("keydown", (event) => {
    const isTyping = event.target instanceof HTMLInputElement;
    if (isTyping || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (event.key.toLowerCase() === KEY) toggle(actions);
  });
}

/** Der Stand in einem Wort, damit das DOM nur bei einer Änderung angefasst wird. */
function nameState(look: NewsButtonLook | null) {
  if (!look) return "off";
  return look.watching ? "watching" : "on";
}

/** Sucht den Knopf aus `map.html` und verbindet ihn mit der Bühne. */
export function createNewsWatch(actions: NewsWatchActions): NewsWatch {
  const button = document.querySelector<HTMLButtonElement>("#news-watch")!;
  const text = document.querySelector<HTMLElement>("#news-watch-text")!;
  let shown = "off";
  button.addEventListener("click", () => toggle(actions));
  listenToKey(actions);
  return {
    show: (reading) => {
      const look = describeNewsButton(reading);
      const state = nameState(look);
      if (state === shown) return false;
      shown = state;
      button.hidden = look === null;
      if (!look) return false;
      text.textContent = look.label;
      button.dataset.sound = look.sound;
      button.toggleAttribute("data-watching", look.watching);
      return look.watching;
    },
  };
}
