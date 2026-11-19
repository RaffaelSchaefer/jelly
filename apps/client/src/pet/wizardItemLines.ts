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
  chicken: {
    offer: [
      "Das Kuschelhuhn! Flauschig wie ein Frühstücksei.",
      "Klein, braun und gackert nur ganz leise.",
    ],
    short: ["Fürs Huhn fehlt noch etwas Gold."],
    worn: ["Halt es fest, sonst pickt es die Kekse."],
    bought: ["Gack gack, {name}! Gut gewählt."],
    hover: ["Psst! Es hat heute schon ein Ei gelegt."],
  },
  piercings: {
    offer: [
      "Piercings aus Sternensilber! Ganz schön frech.",
      "Glänzen mehr als jede RGB-Tastatur.",
    ],
    short: ["Für die Piercings fehlt noch etwas Silber."],
    worn: ["Frech und funkelnd, genau richtig."],
    bought: ["Rock die Halle, {name}!"],
    hover: ["Psst! Tut kein bisschen weh, Ehrenwort."],
  },
  "kamina-glasses": {
    offer: [
      "Die Kamina-Brille! Spitz genug, den Himmel zu durchbohren.",
      "Rote Spitzen, großes Herz. Die Brille eines Anführers.",
    ],
    short: ["Für die Kamina-Brille fehlt noch Gold. Und Kampfgeist."],
    worn: ["Was glaubst du eigentlich, wer du bist? Ein Held!"],
    bought: ["Durchbohre den Himmel, {name}!"],
    hover: ["Psst! Die Spitzen sind schärfer als mein Zauberstab."],
  },
  "ogre-ears": {
    offer: ["Oger-Ohren! Frisch aus dem Sumpf.", "Damit hörst du jeden Schritt in der Halle."],
    short: ["Für die Ohren fehlt noch etwas Gold."],
    worn: ["Ein Oger hat Schichten. Du jetzt auch."],
    bought: ["Willkommen im Sumpf, {name}!"],
    hover: ["Psst! Nicht an den Ohren ziehen."],
  },
  "knit-scarf": {
    offer: [
      "Ein Strickschal! Kuschelig bis zur letzten Runde.",
      "Handgestrickt, jede Masche ein kleiner Zauber.",
    ],
    short: ["Für den Schal fehlt noch ein Wollknäuel Gold."],
    worn: ["Warm um den Hals, kühl im Kopf."],
    bought: ["Bleib warm, {name}! Auch beim Lag."],
    hover: ["Psst! Der Schal kratzt kein bisschen."],
  },
  bandana: {
    offer: [
      "Ein Halstuch! Wie für echte Abenteurer.",
      "Gepunktet und gebunden, bereit fürs Turnier.",
    ],
    short: ["Fürs Halstuch fehlt noch etwas Gold."],
    worn: ["Steht dir! Fertig fürs nächste Abenteuer."],
    bought: ["Auf ins Abenteuer, {name}!"],
    hover: ["Psst! Die Punkte zählen nicht als Pixel."],
  },
  "bell-collar": {
    offer: [
      "Ein Glöckchen! Dann hört man dich kommen.",
      "Rosa Rüschen und ein Glöckchen aus Sonnengold.",
    ],
    short: ["Fürs Glöckchen fehlt noch ein Münzlein."],
    worn: ["Klingeling! Alle wissen, dass du da bist."],
    bought: ["Klingeling, {name}! Wie hübsch."],
    hover: ["Psst! Im Glöckchen wohnt ein Brief."],
  },
  "mini-backpack": {
    offer: [
      "Ein Frosch-Rucksack! Platz für Snacks und Kabel.",
      "Klein, grün und quakt nur selten.",
    ],
    short: ["Für den Rucksack fehlt noch etwas Gold."],
    worn: ["Der Frosch passt gut auf deine Snacks auf."],
    bought: ["Gut gepackt, {name}! Quak."],
    hover: ["Psst! Der Frosch schaut dir über die Schulter."],
  },
  "snail-shell": {
    offer: [
      "Das Lag-Schneckenhaus! Für alle mit hohem Ping.",
      "Langsam, aber gemütlich. Wie dein WLAN.",
    ],
    short: ["Fürs Schneckenhaus fehlt noch etwas Gold."],
    worn: ["Nimm dir Zeit. Die Pakete kommen schon."],
    bought: ["Willkommen im Schneckentempo, {name}!"],
    hover: ["Psst! Drinnen lädt noch etwas."],
  },
  "fairy-wings": {
    offer: ["Feenflügel! Aus Mondlicht gesponnen.", "Glitzern im Dunkeln, ganz ohne RGB."],
    short: ["Für Feenflügel braucht es mehr Glitzer im Beutel."],
    worn: ["Jetzt fehlt nur noch ein Zauberstab."],
    bought: ["Flieg hoch, {name}! Im Herzen jedenfalls."],
    hover: ["Psst! Sie flattern, wenn du lachst."],
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
