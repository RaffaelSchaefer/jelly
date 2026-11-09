/**
 * Names and explains the rules of a LAN for the organizers. Pure functions, without DOM. Which values
 * are valid is decided by the server alone.
 *
 * @module
 */

import type { GameRules } from "./api.ts";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;
const OTHER_GROUP_TITLE = "Weitere";

/** What a value counts. */
export type RuleUnit = "seconds" | "xp" | "count" | "percent" | "units" | "meters";

/** How the page shows one rule. */
export interface RuleText {
  key: string;
  label: string;
  unit: RuleUnit;
  hint?: string;
}

/** Rules that belong together. */
export interface RuleGroup {
  title: string;
  rules: RuleText[];
}

/** The rule that cannot change after the start of a LAN, because levels would jump. */
export const RULE_XP_PER_LEVEL = "xp_per_level";

/** Lists the rules about XP and levels. */
function listProgressRules(): RuleText[] {
  return [
    {
      key: RULE_XP_PER_LEVEL,
      label: "XP pro Level",
      unit: "xp",
      hint: "Nach dem Start der LAN fest.",
    },
    {
      key: "poke_interval",
      label: "Abstand der Stupser",
      unit: "seconds",
      hint: "So oft gibt ein Stupser XP.",
    },
    { key: "poke_xp", label: "XP pro Stupser", unit: "xp" },
    {
      key: "poke_max_ticks",
      label: "Nachholbare Abstände",
      unit: "count",
      hint: "1 heißt: kein Nachholen.",
    },
    {
      key: "partner_xp",
      label: "XP für Partner-Emote",
      unit: "xp",
      hint: "Beim ersten Mal mit jemandem in dieser LAN.",
    },
    {
      key: "full_house_percent",
      label: "Volles Haus",
      unit: "percent",
      hint: "Anteil der Spieler, die denselben Event-Code einlösen müssen.",
    },
  ];
}

/** Lists the rules about food and drinks. */
function listFoodRules(): RuleText[] {
  return [
    { key: "food_xp", label: "XP für Essen", unit: "xp" },
    { key: "drink_xp", label: "XP für Trinken", unit: "xp" },
    {
      key: "report_cooldown",
      label: "Abstand der Meldungen",
      unit: "seconds",
      hint: "Zwischen zwei Meldungen derselben Art.",
    },
    { key: "report_window", label: "Zeitfenster der Meldungen", unit: "seconds" },
    {
      key: "reports_per_window",
      label: "Meldungen im Zeitfenster",
      unit: "count",
      hint: "Essen und Trinken zusammen.",
    },
    {
      key: "snack_run_seconds",
      label: "Dauer an der Theke",
      unit: "seconds",
      hint: "So lange bleibt ein Jelly nach einer Meldung dort.",
    },
  ];
}

/** Lists the rules about what happens on the stage. */
function listStageRules(): RuleText[] {
  return [
    {
      key: "presence_window",
      label: "Anwesenheit",
      unit: "seconds",
      hint: "So lange bleibt ein Jelly nach seiner letzten Aktion auf der Bühne.",
    },
    {
      key: "room_width",
      label: "Breite der Halle",
      unit: "meters",
      hint: "Von links nach rechts. Eine Karte in Metern rechnet damit, nach einer Änderung neu importieren.",
    },
    {
      key: "room_depth",
      label: "Tiefe der Halle",
      unit: "meters",
      hint: "Von hinten nach vorn.",
    },
    {
      key: "jelly_width",
      label: "Breite eines Jellies",
      unit: "meters",
    },
    { key: "trip_seconds", label: "Dauer eines Ausflugs", unit: "seconds" },
    { key: "follow_seconds", label: "Dauer des Dazustellens", unit: "seconds" },
    {
      key: "walk_speed",
      label: "Laufgeschwindigkeit",
      unit: "units",
      hint: "Einheiten pro Sekunde. Die Halle ist 21 breit und 40 tief.",
    },
    {
      key: "near_distance",
      label: "Abstand für „nebeneinander“",
      unit: "units",
      hint: "Einheiten. Ein Jelly ist etwa 1,7 breit.",
    },
    { key: "stack_seconds", label: "Dauer eines Stapels", unit: "seconds" },
    {
      key: "stack_max_members",
      label: "Jellies pro Stapel",
      unit: "count",
      hint: "0 heißt: ohne Grenze.",
    },
  ];
}

/** Lists the rules about gestures. */
function listGesturesRules(): RuleText[] {
  return [
    {
      key: "emote_cooldown",
      label: "Abstand der Emotes",
      unit: "seconds",
      hint: "0 schaltet ihn ab.",
    },
    {
      key: "partner_invite_seconds",
      label: "Antwortzeit Partner-Emote",
      unit: "seconds",
    },
    { key: "highlight_seconds", label: "Dauer des Hervorhebens", unit: "seconds" },
    {
      key: "highlight_cooldown",
      label: "Abstand des Hervorhebens",
      unit: "seconds",
      hint: "0 schaltet ihn ab.",
    },
  ];
}

/** Lists the limits of the server. */
function listOperationRules(): RuleText[] {
  return [
    { key: "max_players", label: "Spieler pro LAN", unit: "count" },
    { key: "max_streams", label: "Verbindungen insgesamt", unit: "count" },
    { key: "max_player_streams", label: "Verbindungen pro Spieler", unit: "count" },
  ];
}

/** Lists all known rules in the order of the page. */
function listRuleGroups(): RuleGroup[] {
  return [
    { title: "XP und Level", rules: listProgressRules() },
    { title: "Essen und Trinken", rules: listFoodRules() },
    { title: "Auf der Bühne", rules: listStageRules() },
    { title: "Gesten", rules: listGesturesRules() },
    { title: "Betrieb", rules: listOperationRules() },
  ];
}

/** Returns the groups for the rules of a LAN. A rule the page does not know yet still appears. */
export function groupRules(rules: GameRules): RuleGroup[] {
  const groups = listRuleGroups();
  const known = new Set(groups.flatMap((group) => group.rules.map((rule) => rule.key)));
  const others = Object.keys(rules).filter((key) => !known.has(key));
  if (others.length > 0) {
    const toRule = (key: string): RuleText => ({ key, label: key, unit: "count" });
    groups.push({ title: OTHER_GROUP_TITLE, rules: others.map(toRule) });
  }
  return groups;
}

/** Returns only the rules whose value differs from the saved one. */
export function findRuleChanges(saved: GameRules, edited: GameRules): GameRules {
  return Object.fromEntries(Object.entries(edited).filter(([key, value]) => saved[key] !== value));
}

/** Says a duration in the largest unit that fits: `600` gives `10 min`. */
export function formatDuration(seconds: number): string {
  if (seconds >= SECONDS_PER_DAY) {
    return `${round(seconds / SECONDS_PER_DAY)} d`;
  }
  if (seconds >= SECONDS_PER_HOUR) {
    return `${round(seconds / SECONDS_PER_HOUR)} h`;
  }
  if (seconds >= SECONDS_PER_MINUTE) {
    return `${round(seconds / SECONDS_PER_MINUTE)} min`;
  }
  return `${seconds} s`;
}

/** Keeps one decimal place, with the comma of German text. */
function round(value: number): string {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

/** Whether a rule takes values like `1.5`. */
export function allowsDecimals(rule: RuleText): boolean {
  return rule.unit === "units" || rule.unit === "meters";
}
