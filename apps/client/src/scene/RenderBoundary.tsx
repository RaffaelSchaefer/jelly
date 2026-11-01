/**
 * Fängt Fehler beim 3D-Rendern ab, damit die LAN-Aktionen auch ohne WebGL weiter funktionieren.
 *
 * @module
 */

import { Component, type ReactNode } from "react";

/** Eigenschaften von {@link RenderBoundary}. */
interface RenderBoundaryProps {
  children: ReactNode;
  /** Was stattdessen erscheint. Ohne Angabe ein Hinweis auf Grafiktreiber und WebView. */
  fallback?: ReactNode;
}

/** Error Boundary für die 3D-Szene. Fehler-Boundaries gibt es in React nur als Klasse. */
export default class RenderBoundary extends Component<RenderBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <p className="render-fallback" role="status">
        3D ist nicht verfügbar. Bitte Grafiktreiber und WebView prüfen. Die LAN-Aktionen
        funktionieren weiterhin.
      </p>
    );
  }
}
