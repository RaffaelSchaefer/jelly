/**
 * Erkennt das Betriebssystem des Besuchers, damit der passende Download vorn steht. Nur eine
 * Vermutung: Die Architektur verrät der Browser nicht zuverlässig, für macOS zeigt die Seite
 * deshalb beide Varianten.
 *
 * @module
 */

/** Wofür die Seite einen Download vorschlägt. `other` sind Handys, Tablets und Unbekanntes. */
export type Platform = "windows" | "macos" | "linux" | "other";

/** Was der Browser über sich verrät. */
export interface PlatformHints {
  /** `navigator.userAgentData.platform` (Chromium) oder `navigator.platform`. */
  platform?: string;
  /** `navigator.userAgent`. */
  userAgent?: string;
  /** `navigator.maxTouchPoints`. Ein iPad gibt sich als Mac aus, hat aber Touch. */
  touchPoints?: number;
}

/** Geräte ohne Jelly: Handys und Tablets, auch wenn ihr Kern Linux ist (Android), dazu Chromebooks. */
const MOBILE = /android|iphone|ipad|ipod|mobile|cros/i;

/** Ordnet die Angaben des Browsers einer {@link Platform} zu. */
export function detectPlatform({
  platform = "",
  userAgent = "",
  touchPoints = 0,
}: PlatformHints): Platform {
  const text = `${platform} ${userAgent}`;
  if (MOBILE.test(text)) return "other";
  if (/mac/i.test(text)) return touchPoints > 1 ? "other" : "macos";
  if (/^win/i.test(platform) || /windows/i.test(userAgent)) return "windows";
  if (/linux|x11|bsd/i.test(text)) return "linux";
  return "other";
}

/** Die Angaben dieses Browsers. */
export function readPlatformHints(): PlatformHints {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return {
    platform: data?.platform || navigator.platform,
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints,
  };
}
