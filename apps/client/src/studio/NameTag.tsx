/**
 * Das Namensschild unter den Füßen: Es ist immer ein Eingabefeld, nur sieht man das erst beim
 * Klick.
 *
 * @module
 */

import { useEffect, useState, type KeyboardEvent } from "react";

import { NAME_MAX_LENGTH, nameToSave } from "../pet";

/**
 * Speichert beim Verlassen des Feldes und mit Enter, Esc nimmt die Eingabe zurück.
 *
 * @param onSave - Liefert `false`, wenn der Server den Namen abgelehnt hat. Dann gilt der alte
 *   wieder.
 */
export default function NameTag({
  name,
  busy,
  onSave,
}: {
  name: string;
  busy: boolean;
  onSave: (name: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  async function save(value: string) {
    const next = nameToSave(value, name);
    if (next === null) setDraft(name);
    else if (!(await onSave(next))) setDraft(name);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    // Esc gehört hier dem Feld, nicht dem Studio.
    event.stopPropagation();
    // Direkt ins Feld: Das Verlassen speichert gleich danach, noch bevor React neu gerendert hätte.
    if (event.key === "Escape") event.currentTarget.value = name;
    // Der Fokus wandert ins Studio statt ins Leere, sonst käme ein weiteres Esc nirgends mehr an.
    event.currentTarget.closest<HTMLElement>(".studio")?.focus();
  }

  return (
    <label className="name-tag" data-liquid>
      <span aria-hidden="true">{draft || " "}</span>
      <input
        aria-label="Name deines Begleiters"
        title="Klicken zum Umbenennen"
        value={draft}
        maxLength={NAME_MAX_LENGTH}
        size={1}
        autoComplete="off"
        spellCheck={false}
        readOnly={busy}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={(event) => void save(event.currentTarget.value)}
      />
    </label>
  );
}
