/**
 * Die Suche nach einem Jelly im Panel „Dabei“: Lupe in der Kopfzeile und, solange sie offen ist,
 * das Suchfeld.
 *
 * @module
 */

import { useRef, useState } from "react";

import { IconButton } from "../ui";

/** Das Suchfeld hinter der Lupe. Beim Schließen ist der Text weg und die Lupe hat wieder den Fokus. */
export function usePlayerSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  }
  return { open, query, setQuery, trigger, close, toggle: open ? close : () => setOpen(true) };
}

/** Lupe und Suchfeld. Escape schließt erst die Suche, das Panel bleibt offen (siehe `App.tsx`). */
export default function PlayerSearch({ search }: { search: ReturnType<typeof usePlayerSearch> }) {
  const { open, query, setQuery, trigger, close, toggle } = search;
  return (
    <>
      <IconButton
        ref={trigger}
        icon="search"
        label="Jelly suchen"
        title="Jelly suchen"
        className="follow-search-toggle"
        aria-expanded={open}
        onClick={toggle}
      />
      {open ? (
        <input
          className="follow-search"
          role="searchbox"
          aria-label="Jelly nach Namen suchen"
          placeholder="Name suchen"
          value={query}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            close();
          }}
        />
      ) : null}
    </>
  );
}
