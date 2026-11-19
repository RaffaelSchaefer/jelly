/**
 * Updates der App: einmal beim Start nachsehen, auf Wunsch einspielen.
 *
 * Rust fragt die Liste am letzten Release auf GitHub ab, nicht den Jelly-Server. Scheitert das
 * Nachsehen, etwa ohne Internet in der LAN, bleibt es still. In der Browser-Vorschau bietet
 * `/#update` eine erfundene Version mit der `CHANGELOG.md` an und spielt das Laden nur vor.
 *
 * @module
 */

import { useCallback, useEffect, useState } from "react";

import changelog from "../CHANGELOG.md?raw";
import * as backend from "./backend";
import { desktop, type AvailableUpdate } from "./backend";

/** Was {@link useUpdate} der Oberfläche gibt. */
export interface AppUpdate {
  /** Die neue und die laufende Version, `null` ohne Update oder nach „Später“. */
  available: AvailableUpdate | null;
  /** Läuft gerade Laden und Einspielen? Danach startet die App neu. */
  installing: boolean;
  /** Geladen in Prozent, 100 heißt „wird eingespielt“. `null`, solange die Größe unbekannt ist. */
  progress: number | null;
  /** Fehlermeldung des letzten Versuchs, sonst leer. */
  error: string;
  install: () => void;
  dismiss: () => void;
}

/** Was die Vorschau mit `/#update` anbietet, samt dem echten Changelog. */
const PREVIEW_UPDATE: AvailableUpdate | null =
  !desktop && location.hash === "#update"
    ? { current: "0.2.0", version: "0.3.0", notes: changelog }
    : null;

/** Spielt in der Vorschau das Laden vor, bis „wird eingespielt“. Dort bleibt sie stehen. */
function previewDownload(onProgress: (percent: number) => void) {
  let percent = 0;
  const timer = setInterval(() => {
    percent = Math.min(100, percent + 4 + Math.round(Math.random() * 6));
    onProgress(percent);
    if (percent === 100) clearInterval(timer);
  }, 160);
}

/** Sieht beim Start nach einem Update und spielt es auf Wunsch ein. */
export function useUpdate(): AppUpdate {
  const [available, setAvailable] = useState(PREVIEW_UPDATE);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // ponytail: nur beim Start. Ein Abfragen im Takt erst, wenn eine LAN länger läuft als ein Release.
    if (desktop) backend.checkUpdate().then(setAvailable, () => null);
  }, []);

  const install = useCallback(() => {
    setInstalling(true);
    setProgress(null);
    setError("");
    if (!desktop) return previewDownload(setProgress);
    backend.installUpdate(setProgress).then(
      // Kehrt der Aufruf zurück, gab es beim zweiten Nachsehen doch nichts mehr.
      () => {
        setInstalling(false);
        setAvailable(null);
      },
      (cause: unknown) => {
        setError(String(cause));
        setInstalling(false);
      },
    );
  }, []);
  const dismiss = useCallback(() => setAvailable(null), []);

  return { available, installing, progress, error, install, dismiss };
}
