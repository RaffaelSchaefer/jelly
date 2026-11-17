/**
 * Die Canvas der Funken, als Portal direkt im `body`: So liegt sie über dem ganzen Fenster, und
 * Münzen fliegen von der Börse im Kopf bis in die Schale auf der Bühne. Gemalt wird sie von
 * {@link shopFx}, diese Komponente hängt sie nur ein und gibt die Einstellungen weiter.
 *
 * @module
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { shopFx } from "./sparksEngine";
import "./fx.css";

/** Eigenschaften von {@link ShopFx}. */
export interface ShopFxProps {
  /** Bilder pro Sekunde, `null` heißt unbegrenzt. */
  frameLimit: number | null;
  /** Optimierte Darstellung: weniger Funken, normal gemischt, ohne hohe Pixeldichte. */
  lite: boolean;
  /** Reduzierte Bewegung: nur kurze Scheine. */
  calm: boolean;
  /** Leuchtfarbe des eigenen Jellys. */
  glow: string;
}

/** Hängt die Canvas der Funken ins Fenster. Einmal je Fenster. */
export default function ShopFx({ frameLimit, lite, calm, glow }: ShopFxProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Zuerst einstellen, dann einhängen: Der Atlas malt die Leuchtfarbe so gleich richtig.
  useEffect(
    () => shopFx.configure({ frameLimit, lite, calm, glow }),
    [frameLimit, lite, calm, glow],
  );
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    shopFx.attach(element);
    return () => shopFx.detach(element);
  }, []);
  return createPortal(
    <canvas ref={canvas} className="shop-fx" aria-hidden="true" />,
    document.body,
  );
}
