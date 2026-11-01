/**
 * Selbstmeldungen mit ihren Anzeigetexten.
 *
 * @module
 */

/**
 * Was man selbst melden kann, in Anzeigereihenfolge. `xp` spiegelt `Action::xp` in Rust und dient
 * nur der Anzeige. `message` sagt das Pet nach einer erfolgreichen Meldung.
 */
export const REPORTS = [
  {
    action: "food",
    icon: "food",
    title: "Essen",
    logTitle: "Essen geholt",
    xp: 15,
    message: "Snack gesichert. Weiter geht’s!",
  },
  {
    action: "drink",
    icon: "drink",
    title: "Getränk",
    logTitle: "Getränk geholt",
    xp: 10,
    message: "Auf die nächste Runde!",
  },
] as const;
