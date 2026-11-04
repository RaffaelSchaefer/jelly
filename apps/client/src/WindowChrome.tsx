/**
 * Rahmen um das Pet: Fensterknöpfe sowie Kopf- und Fußzeile der Browser-Vorschau.
 *
 * @module
 */

import { desktop, type WindowAction } from "./backend";
import { IconButton } from "./ui";

/** Kopfzeile, die nur in der Browser-Vorschau erscheint. */
export function PreviewHeader() {
  return (
    <header className="preview-header">
      <img src="/pet.svg" width="32" height="32" alt="" />
      <div>
        <strong>Jelly</strong>
        <span>Umwelt-Campus Birkenfeld · November 2026</span>
      </div>
      <span className="preview-label">Browser-Vorschau</span>
    </header>
  );
}

/** Fußzeile, die nur in der Browser-Vorschau erscheint. */
export function PreviewFooter() {
  return (
    <footer className="preview-footer">
      <span className="status-dot" />
      Oberflächen-Vorschau · Starte <code>pnpm run tauri dev</code> für das Desktop-Pet.
    </footer>
  );
}

/** Verschiebe-Griff links, Minimieren und Schließen rechts. In der Vorschau gesperrt. */
export function WindowTools({ onAction }: { onAction: (action: WindowAction) => void }) {
  return (
    <div className="window-tools">
      <IconButton
        icon="drag"
        label="Pet-Fenster verschieben"
        className="drag-handle"
        title={desktop ? "Fenster verschieben" : "Im Desktop-Modus verschiebbar"}
        disabled={!desktop}
        onPointerDown={(event) => {
          if (event.button === 0) onAction("drag");
        }}
      />
      <div className="window-tools-right">
        <IconButton
          icon="minus"
          label="Minimieren"
          disabled={!desktop}
          onClick={() => onAction("minimize")}
        />
        <IconButton
          icon="close"
          label="Schließen"
          disabled={!desktop}
          onClick={() => onAction("close")}
        />
      </div>
    </div>
  );
}
