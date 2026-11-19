/**
 * Das Siegel als Zeremonie: Zeiger und Tasten am Siegel-Knopf treiben die Zeremonie aus
 * `pet/sealMachine.ts`, die mit Zeitgebern durch die Phasen aus `pet/sealCeremony.ts` geht und beim
 * Stempeln den Auftrag an den Server schickt.
 *
 * Gekauft wird durch Halten, mit Maus, Leertaste oder Enter. Ein Klick ohne eigenen Druck kommt von
 * VoiceOver oder einer Schaltersteuerung: Er macht das Siegel scharf, der zweite bestätigt. Anlegen
 * und Ablegen gehen mit einem Tipp.
 *
 * @module
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

import { SEAL_IDLE, type SealState } from "../pet/sealCeremony";
import {
  createSealMachine,
  type CeremonyOptions,
  type SealMachine,
  type SealSubject,
} from "../pet/sealMachine";

export type { CeremonyOptions, SealSubject };

/** Die Tasten, die das Siegel drücken. */
const PRESS_KEYS = new Set(["Enter", " "]);

/** Die Ereignisse am Siegel-Knopf. */
function sealBindings(machine: SealMachine, options: () => CeremonyOptions) {
  const holds = () => options().mode === "hold";
  const release = () => machine.release();
  return {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      if (!holds() || event.button !== 0 || !event.isPrimary) return;
      // So kommt das Loslassen auch an, wenn der Zeiger dabei vom Siegel rutscht.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ohne Capture endet der Druck spätestens beim Verlassen des Fensters.
      }
      machine.press();
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onBlur: release,
    onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
      if (!PRESS_KEYS.has(event.key)) return;
      // Wiederholungen gehören zum laufenden Druck, auch wenn das Siegel inzwischen anlegt statt
      // kauft. Sonst klickte jedes wiederholte Enter und legte die eben gekaufte Ware wieder ab.
      if (machine.pressing() || event.repeat) return void event.preventDefault();
      if (!holds()) return;
      // Sonst klickte Enter sofort und die Leertaste beim Loslassen.
      event.preventDefault();
      machine.press();
    },
    onKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
      // Auch wenn das Siegel inzwischen anlegt statt kauft: Der Druck begann als Kauf.
      if (!machine.pressing() || !PRESS_KEYS.has(event.key)) return;
      event.preventDefault();
      machine.release();
    },
    onClick: () => machine.click(),
    onContextMenu: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
  };
}

/**
 * Die Zeremonie des Siegels.
 *
 * @returns Stand und Gegenstand der Zeremonie, dazu `bind` für den Siegel-Knopf.
 */
export function useSealCeremony(options: CeremonyOptions) {
  const [view, setView] = useState<{ state: SealState; subject: SealSubject | null }>({
    state: SEAL_IDLE,
    subject: null,
  });
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const [machine] = useState(() =>
    createSealMachine({
      options: () => latest.current,
      render: (state, subject) => setView({ state, subject }),
    }),
  );

  // Eine andere Ware bricht ab, was nicht schon beim Server ist.
  const itemId = options.item?.cosmetic.id ?? null;
  useEffect(() => machine.send({ type: "reset" }), [machine, itemId]);

  useEffect(() => {
    const release = () => machine.release();
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      machine.stop();
    };
  }, [machine]);

  const bind = useMemo(() => sealBindings(machine, () => latest.current), [machine]);
  return { ...view, bind };
}
