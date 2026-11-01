/**
 * React-Hooks rund um den Spielstand: laden, Aktionen ans Backend schicken, Rückmeldungen des Pets,
 * Tastatur-Stupser und der Größen-Regler.
 *
 * In der Browser-Vorschau gibt es kein Backend. Aussehen und Cosmetics ändern dann nur den lokalen
 * Zustand, XP-Aktionen sind gesperrt.
 *
 * @module
 */

import { useCallback, useEffect, useRef, useState } from "react";

import * as backend from "./backend";
import { desktop } from "./backend";
import {
  levelCosmetic,
  levelProgress,
  PREVIEW_PET,
  REPORTS,
  type Action,
  type Appearance,
  type Pet,
} from "./pet";

/** Mindestabstand zwischen zwei Stupsern in Millisekunden. Rust prüft dasselbe noch einmal. */
const POKE_INTERVAL_MS = 1000;

/** Was das Pet nach einer belohnten Aktion sagt, und ob es dabei ein Level aufgestiegen ist. */
function reactionTo(action: Action, xpBefore: number, after: Pet) {
  const level = levelProgress(after.xp).level;
  if (level > levelProgress(xpBefore).level) {
    const unlocked = levelCosmetic(level);
    const message = unlocked
      ? `Level ${level}! Neu für mich: ${unlocked.name}.`
      : `Level ${level}! Weiter so.`;
    return { message, levelUp: true };
  }
  const report = REPORTS.find((item) => item.action === action);
  return { message: report?.message ?? "Gute Runde. Ich bin dabei.", levelUp: false };
}

/** Lässt höchstens einen Stupser pro {@link POKE_INTERVAL_MS} durch und merkt sich den Zeitpunkt. */
function allowPoke(lastPoke: { current: number }) {
  const now = performance.now();
  if (now - lastPoke.current < POKE_INTERVAL_MS) return false;
  lastPoke.current = now;
  return true;
}

/**
 * Führt Backend-Aufrufe aus und hält dafür Lade- und Fehlerzustand. Es läuft immer nur ein Aufruf
 * gleichzeitig. Ein zweiter wird verworfen, solange der erste läuft, damit kein älterer Stand einen
 * neueren überschreibt.
 *
 * @param onResult - Bekommt den neuen Spielstand nach jedem erfolgreichen Aufruf.
 */
function useBackendCall(onResult: (pet: Pet) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  /** Führt `task` aus. Liefert den neuen Stand, oder `undefined`, wenn nichts übernommen wurde. */
  const run = useCallback(
    async (task: () => Promise<Pet>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        const next = await task();
        onResult(next);
        return next;
      } catch (cause) {
        setError(String(cause));
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [onResult],
  );

  /** Fensterknöpfe. Fehler landen in derselben Fehleranzeige. */
  const windowAction = useCallback(async (action: backend.WindowAction) => {
    if (!desktop) return;
    await backend.windowAction(action).catch((cause) => setError(String(cause)));
  }, []);

  return { busy, error, inFlight, run, windowAction };
}

/**
 * Hält den Spielstand und alles, was die Oberfläche damit tun kann.
 *
 * @param onLevelUp - Wird nach einem Levelaufstieg aufgerufen, zum Beispiel um das Level-Panel zu
 *   öffnen. Sollte stabil sein (`useCallback`), sonst entsteht `interact` bei jedem Rendern neu.
 */
export function usePet(onLevelUp: () => void) {
  const [pet, setPet] = useState<Pet>(PREVIEW_PET);
  const [ready, setReady] = useState(!desktop);
  const [message, setMessage] = useState("Bereit für die nächste Runde.");
  const [pulse, setPulse] = useState(0);
  const { busy, error, inFlight, run, windowAction } = useBackendCall(setPet);
  const lastPoke = useRef(-POKE_INTERVAL_MS);

  /** Lädt den Spielstand. Auch für „Erneut versuchen“, falls das Laden scheitert. */
  const load = useCallback(async () => {
    if (desktop && (await run(backend.getPet))) setReady(true);
  }, [run]);
  useEffect(() => void load(), [load]);

  /** Stupser oder Selbstmeldung. Danach reagiert das Pet mit Sprechblase und Hüpfer. */
  const interact = useCallback(
    async (action: Action) => {
      if (!ready || !desktop || inFlight.current) return;
      if (action === "activity" && !allowPoke(lastPoke)) return;
      const next = await run(() => backend.interact(action));
      if (!next) return;
      const reaction = reactionTo(action, pet.xp, next);
      setMessage(reaction.message);
      setPulse((value) => value + 1);
      if (reaction.levelUp) onLevelUp();
    },
    [ready, pet.xp, inFlight, run, onLevelUp],
  );

  /** Übernimmt ein neues Aussehen. `false` heißt: gerade beschäftigt, später erneut versuchen. */
  const customize = useCallback(
    async (appearance: Appearance) => {
      if (inFlight.current) return false;
      if (!desktop) {
        setPet((current) => ({ ...current, ...appearance, name: appearance.name.trim() }));
        setMessage("Vorschau angepasst. Es wird nichts gespeichert.");
      } else if (await run(() => backend.customizePet(appearance))) {
        setMessage("So gefällt’s mir.");
      }
      return true;
    },
    [inFlight, run],
  );

  /** Legt ein Cosmetic an oder mit `null` ab. */
  const equip = useCallback(
    async (cosmetic: string | null) => {
      if (inFlight.current) return;
      if (!desktop) setPet((current) => ({ ...current, cosmetic }));
      else if (await run(() => backend.equipCosmetic(cosmetic)))
        setMessage(cosmetic ? "Steht mir, oder?" : "Wieder ganz natürlich.");
    },
    [inFlight, run],
  );

  return {
    pet,
    ready,
    busy,
    error,
    message,
    pulse,
    load,
    interact,
    customize,
    equip,
    windowAction,
  };
}

/** Alles, was {@link usePet} liefert. */
export type PetGame = ReturnType<typeof usePet>;

/** Elemente, in denen Tasten eine eigene Bedeutung haben. Dort stupst ein Tastendruck nicht. */
const EDITABLE = 'input, textarea, button, select, [contenteditable="true"]';

/**
 * Stupst das Pet bei Tastendruck im Pet-Fenster an (Leertaste oder ein druckbares Zeichen).
 * Ausgenommen sind wiederholte Tasten, Kürzel mit Strg/Alt/Cmd und Eingaben in Bedienelementen.
 *
 * @param enabled - Nur aktiv, wenn kein Panel offen ist.
 */
export function usePokeKeys(interact: (action: Action) => unknown, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if ((event.target as HTMLElement).closest(EDITABLE)) return;
      if (event.code === "Space" || event.key.length === 1) void interact("activity");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [interact, enabled]);
}

/**
 * Entwurfswert für den Größen-Regler. Das Pet wächst sofort mit, gespeichert wird erst 400 ms nach
 * der letzten Bewegung.
 *
 * @param saved - Gespeicherte Größe, solange es keinen Entwurf gibt.
 * @param save - Speichert eine Größe. `false` heißt: gerade beschäftigt, dann in 200 ms erneut.
 * @returns Die anzuzeigende Größe und die Funktion für `onChange`.
 */
export function useSizeDraft(saved: number, save: (size: number) => Promise<boolean>) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function change(next: number) {
    setDraft(next);
    window.clearTimeout(timer.current);
    const attempt = async () => {
      if (!(await save(next))) {
        timer.current = window.setTimeout(attempt, 200);
        return;
      }
      // Nur zurücksetzen, wenn der Regler inzwischen nicht schon woanders steht.
      setDraft((current) => (current === next ? null : current));
    };
    timer.current = window.setTimeout(attempt, 400);
  }

  return [draft ?? saved, change] as const;
}
