/**
 * Die Statuszeile über der Leiste: Fehler zuerst, dann kurze Bestätigungen nach Aktionen, zuletzt
 * Hinweise wie „Gerade läuft keine LAN.“ Fehler und Bestätigungen räumen sich selbst weg.
 *
 * @module
 */

/** So lange bleibt ein Fehler zu einem Klick stehen. Das nächste Neuladen löscht ihn nicht. */
const PROBLEM_MS = 6000;
/** So lange bleibt eine Bestätigung stehen. */
const CONFIRMATION_MS = 2400;
/** Ein neuer Text steigt kurz auf. */
const ARRIVAL: Keyframe[] = [
  { opacity: 0, translate: "-50% 6px" },
  { opacity: 1, translate: "-50% 0" },
];
const ARRIVAL_MS = 220;

/** Was die Seite in der Statuszeile zeigen kann. */
export interface Notice {
  /** Zeigt, warum ein Klick nicht geklappt hat. Ersetzt eine Bestätigung. */
  problem: (text: string) => void;
  /** Bestätigt eine Aktion. Ersetzt einen älteren Fehler. */
  confirm: (text: string) => void;
  /** Ein Fehler beim Lesen, leer, wenn das letzte Lesen geklappt hat. */
  setReadProblem: (text: string) => void;
  /** Ein bleibender Hinweis, leer für keinen. */
  setNote: (text: string) => void;
}

/** Was gerade gezeigt werden will. */
interface NoticeTexts {
  problem: string;
  confirmation: string;
  readProblem: string;
  note: string;
}

/** Verbindet die Statuszeile aus `map.html`. */
export function createNotice(element: HTMLElement): Notice {
  const texts: NoticeTexts = { problem: "", confirmation: "", readProblem: "", note: "" };
  const render = () => {
    const problem = texts.problem || texts.readProblem;
    const text = problem || texts.confirmation || texts.note;
    const isNew = text !== "" && text !== element.textContent;
    element.textContent = text;
    element.hidden = !text;
    element.toggleAttribute("data-problem", problem !== "");
    const isCalm = document.documentElement.hasAttribute("data-reduced-motion");
    if (isNew && !isCalm) element.animate(ARRIVAL, { duration: ARRIVAL_MS, easing: "ease-out" });
  };
  const showFor = (key: "problem" | "confirmation", text: string, ms: number) => {
    texts.problem = "";
    texts.confirmation = "";
    texts[key] = text;
    render();
    setTimeout(() => {
      if (texts[key] !== text) return;
      texts[key] = "";
      render();
    }, ms);
  };
  return {
    problem: (text) => showFor("problem", text, PROBLEM_MS),
    confirm: (text) => showFor("confirmation", text, CONFIRMATION_MS),
    setReadProblem: (text) => {
      texts.readProblem = text;
      render();
    },
    setNote: (text) => {
      texts.note = text;
      render();
    },
  };
}
