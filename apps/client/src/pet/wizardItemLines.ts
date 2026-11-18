/**
 * Die eigenen Sätze des Zauberers zu jedem Teil des Shops, nach seinem Schlüssel im Katalog. Es
 * gelten die Regeln aus `wizardLines.ts`: höchstens 60 Zeichen, auch mit einem Namen aus 24
 * Zeichen, und Artikel nur hier, in den Sätzen zu einem bestimmten Teil.
 *
 * @module
 */

/** Wozu es eigene Sätze je Teil gibt. */
export type ItemLineKind = "offer" | "short" | "worn" | "bought" | "hover";

/** Eigene Sätze je Teil, nach seinem Schlüssel im Katalog. */
export const ITEM_LINES: Readonly<Record<string, Record<ItemLineKind, readonly string[]>>> = {
  headset: {
    offer: [
      "Ein Headset! Damit hörst du jeden Schritt.",
      "Mit dem Headset hörst du sogar Gedanken.",
    ],
    short: ["Fürs Headset fehlt noch ein wenig Gold."],
    worn: ["Das Headset steht dir. Hörst du mich gut?"],
    bought: ["Möge dein Headset nie rauschen, {name}!"],
    hover: ["Die Öhrchen wackeln, wenn keiner hinsieht."],
  },
  "headset-neutral": {
    offer: ["Schlicht und edel. Wie mein Bart.", "Das schlichte Headset, ganz ohne Firlefanz."],
    short: ["Auch Schlichtes hat seinen Preis."],
    worn: ["Schlicht steht dir am besten."],
    bought: ["Schlicht gekauft, schlicht schön!"],
    hover: ["Ganz ohne Schnickschnack, das gute Stück."],
  },
  beanie: {
    offer: ["Die Mütze hält warm, auch bei Lags.", "Handgestrickt! Von meiner Großtante."],
    short: ["Für die Mütze fehlt noch ein Zipfel."],
    worn: ["Mit Mütze bist du doppelt gemütlich."],
    bought: ["Bleib warm, {name}! Die Mütze passt."],
    hover: ["Die Mütze hat schon zwei Winter überlebt."],
  },
  sprout: {
    offer: [
      "Ein Spross! Er wächst mit jeder guten Laune.",
      "Frisch gekeimt aus meinem Kräutergarten.",
    ],
    short: ["Für den Spross fehlt noch etwas Dünger."],
    worn: ["Da sprießt ja was! Steht dir prächtig."],
    bought: ["Wachse und gedeihe, {name}!"],
    hover: ["Psst! Er wächst, wenn keiner hinsieht."],
  },
  "pixel-glasses": {
    offer: [
      "Durch die Pixel-Brille wird alles schön eckig.",
      "Die Pixel-Brille! Acht Bit voller Stil.",
    ],
    short: ["Die Pixel-Brille braucht noch ein paar Münzen."],
    worn: ["Sehr scharf. Also … pixelscharf."],
    bought: ["Jetzt siehst du alles in Pixeln, {name}!"],
    hover: ["Ich seh dadurch nur Klötzchen. Du?"],
  },
  "schnoerbi-mask": {
    offer: [
      "Die Schnörbi-Maske! Golden, flauschig, herrlich albern.",
      "Gold, Schnabel, Büschel. Mehr Würde passt in keine Maske.",
    ],
    short: ["Die Schnörbi-Maske will noch einen Beutel Gold."],
    worn: ["Schnörbi? Fast hätte ich dich nicht erkannt."],
    bought: ["Herrlich, {name}! Schnatter mit Stil."],
    hover: ["Psst! Die Büschel wackeln, wenn du lachst."],
  },
  "long-schnoerbi": {
    offer: [
      "Der Long Schnörbi! Er hört einfach nicht auf.",
      "So lang, ich musste ihn zweimal falten.",
    ],
    short: ["Für so viel Schnörbi fehlt noch etwas Gold."],
    worn: ["Halt ihn gut fest, er ist länger als du!"],
    bought: ["Knuddel ihn gut, {name}! Alle drei Meter."],
    hover: ["Psst! Sein Schwanz liegt noch im Lager."],
  },
  goose: {
    offer: ["Die Kuschelgans! Weich wie eine Wolke.", "Sie schnattert nur, wenn keiner hinsieht."],
    short: ["Für die Gans fehlt noch etwas Gold."],
    worn: ["Drück sie fest, sie mag das!"],
    bought: ["Kuschel sie gut, {name}! Sie schnattert."],
    hover: ["Psst! Nachts mopst sie Kekse aus dem Lager."],
  },
  hood: {
    offer: [
      "Die Kapuze! Geheimnisvoll wie ein Zauberer.",
      "Unter der Kapuze bleibt jeder Plan geheim.",
    ],
    short: ["Die Kapuze will noch ein paar Münzen."],
    worn: ["Geheimnisvoll! Fast wie ich."],
    bought: ["Kapuze auf, {name}! Ganz geheimnisvoll."],
    hover: ["Darunter passt sogar ein Nickerchen."],
  },
  crown: {
    offer: [
      "Eine LAN lang Hoheit sein. Verlockend, was?",
      "Die Krone! Schwer wie die Verantwortung.",
    ],
    short: ["Für die Krone fehlt noch Kleingeld."],
    worn: ["Eure Hoheit! Darf ich die Krone polieren?"],
    bought: ["Lang lebe {name}! Bis zum LAN-Ende."],
    hover: ["Schwer wiegt die Verantwortung, glaub mir."],
  },
};
