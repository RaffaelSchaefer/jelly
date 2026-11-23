/**
 * Englische Fassung aller festen Texte aus `index.html`. Die deutsche steht nur dort: Beim ersten
 * Wechsel merkt sich `apply.ts` sie aus dem Dokument. Schlüssel sind die Werte von `data-i18n` und
 * `data-i18n-attrs`, ein Test hält beide Seiten gleich. Werte dürfen einfaches Inline-HTML
 * enthalten.
 *
 * @module
 */

/** Englische Texte je Schlüssel. */
export const EN: Readonly<Record<string, string>> = {
  "meta.title": "Jelly · Your companion for your LAN",
  "meta.description":
    "Jelly is a small desktop companion for LAN parties: your own 3D jelly, the hall with everyone else, XP, levels and a wizard's shop. For Windows, macOS and Linux.",
  "nav.skip": "Skip to content",
  "nav.label": "Main navigation",
  "nav.features": "Features",
  "nav.start": "Get started",

  "hero.title": "Your Jelly for your&nbsp;LAN.",
  "hero.lead":
    "A small companion that sits on your desktop next to your games. It earns XP when you eat and join events, meets everyone else's jellies in the hall and shops at the wizard Funkelbart.",
  "hero.download": "Download Jelly",
  "hero.features": "See what it does",
  "hero.note": "For Windows, macOS and Linux. You get the join code at your LAN.",
  "hero.poke": "Poke Jelly",
  "hero.colors": "Try a colour",

  "features.title": "What Jelly does",
  "features.lead": "All pictures are from the app, which speaks German.",

  "desktop.title": "On your desktop",
  "desktop.text":
    "Jelly sits on your desktop without a window, next to the game. You use it right on the jelly.",
  "desktop.alt": "Jelly on the desktop with a speech bubble, four glass drops and the dock below.",
  "desktop.bubble": "Jelly lets you know",
  "desktop.bubbleText":
    "Ten minutes before each item on the schedule, on a new level and when someone invites you to a partner emote.",
  "desktop.drops": "Open the drops",
  "desktop.dropsText": "Emotes, sign, shop and map hang on the jelly as drops.",
  "desktop.dock": "Report XP",
  "desktop.dockText":
    "In the dock you enter food, drinks and events. Schedule, looks and settings are there too.",

  "map.title": "In the hall",
  "map.text":
    "The map shows the hall in 3D. At every seat stands the jelly of the person sitting there.",
  "map.alt":
    "The map: a hall from above with a stage, a sofa corner, a snack bar and rows of tables full of jellies.",
  "map.seat": "Find your jelly",
  "map.seatText": "It stands at your seat. The space bar brings the camera back to it.",
  "map.others": "Join others",
  "map.othersText":
    "Click a jelly to join it or highlight it. For a partner emote, click your own, pick a gesture and invite a jelly nearby.",
  "map.bar": "Send it on a trip",
  "map.barText":
    "Click the floor and your jelly walks there. The bar at the bottom searches by name and zooms.",

  "shop.title": "In the wizard's shop",
  "shop.text":
    "Every new level gives you coins. You spend them on cosmetics in the shop of the wizard Funkelbart.",
  "shop.alt":
    "The wizard's shop: Funkelbart behind the counter, a jelly trying on cat ears, the bill of sale with its seal on the right.",
  "shop.lore": "“Sewn from cloud plush. They twitch whenever a bag rustles somewhere.”",
  "shop.loreSource": "Bill of sale for the cat ears",
  "shop.try": "Try on",
  "shop.tryText": "Click an item and your jelly tries it on at once.",
  "shop.brief": "Buy",
  "shop.briefText": "Hold down the seal on the bill of sale.",
  "shop.purse": "Coins",
  "shop.purseText": "The top left shows how many you have.",

  "more.title": "And also",
  "more.emotes": "Emotes",
  "more.emotesText": "Twelve gestures from waving to dancing, also as a duet.",
  "more.signs": "Signs",
  "more.signsText": "Your jelly holds up a board with your text.",
  "more.voice": "Voice",
  "more.voiceText": "It babbles in its own pitch. Quieter or off, as you like.",
  "more.studio": "Studio",
  "more.studioText": "Pick colour and cosmetics right on the jelly, in eleven colours.",
  "more.achievements": "Achievements",
  "more.achievementsText": "Small goals for the whole weekend.",
  "more.schedule": "Schedule",
  "more.scheduleText": "The LAN timetable in the dock. Jelly reminds you ten minutes ahead.",

  "start.title": "Get started",
  "start.os": "Operating system",
  "start.github": "Downloads on GitHub",
  "start.load": "Download",
  "start.open": "Open",
  "start.hatch": "Hatch",
  "start.windows":
    "Run the installer. If Windows says “Windows protected your PC”, click <strong>More info</strong> and then <strong>Run anyway</strong>. This happens once, because Jelly is not registered with Microsoft.",
  "start.macos":
    "Open the <code>.dmg</code> and drag Jelly into <strong>Applications</strong>. macOS blocks the first launch because Jelly is not registered with Apple: open <strong>System Settings › Privacy &amp; Security</strong>, click <strong>Open Anyway</strong> next to Jelly and confirm with <strong>Open</strong>.",
  "start.linux":
    "Make the AppImage executable and run it, or install the package for your distribution.",
  "start.hatchText":
    "Your jelly is waiting inside a glass egg. Give it a name, pick a colour and type in the join code of your LAN. Then it hatches.",
  "start.updates": "Jelly tells you about updates and installs them with one click.",
  "start.releases": "All versions on GitHub",

  "footer.made": "A desktop companion for LAN parties.",
  "footer.source": "Source code on GitHub",
};
