/**
 * The form for the rules of a LAN. It sends only what changed, so a value someone else set in the
 * meantime stays.
 *
 * @module
 */

import { patchRules, type GameRules, type LANSummary } from "./api.ts";
import type { FailureHandler } from "./failure.ts";
import { createElement, createField, createMessage, type Field, type Message } from "./dom.ts";
import {
  allowsDecimals,
  findRuleChanges,
  formatDuration,
  groupRules,
  RULE_XP_PER_LEVEL,
  type RuleText,
} from "./rules.ts";

const TEXT_FILL_ALL = "Bitte fülle alle Regeln aus.";
const CLASS_CHANGED = "is-changed";

/** One rule on the page. */
interface RuleField {
  rule: RuleText;
  field: Field;
  /** The readable length of a number of seconds, right beside the field. */
  duration: HTMLElement;
}

/** The parts of the form that its actions work on. */
interface RulesFormParts {
  lan: LANSummary;
  entries: RuleField[];
  message: Message;
  save: HTMLButtonElement;
  discard: HTMLButtonElement;
}

/** Names the unit shown inside the field, if the label does not say it already. */
function nameUnit(rule: RuleText): string {
  const names: Partial<Record<RuleText["unit"], string>> = {
    seconds: "s",
    percent: "%",
    xp: "XP",
    meters: "m",
    speed: "m/s",
  };
  return names[rule.unit] ?? "";
}

/** Writes how long a number of seconds is, and the help line. */
function writeHint({ rule, field, duration }: RuleField): void {
  duration.textContent =
    rule.unit === "seconds" && field.input.value !== ""
      ? `= ${formatDuration(Number(field.input.value))}`
      : "";
  field.hint.textContent = rule.hint ?? "";
  field.hint.hidden = rule.hint === undefined;
}

/** Reads all fields. Gives `null` when one is empty. */
function readRules(entries: RuleField[]): GameRules | null {
  const values = entries.map(({ rule, field }) => [rule.key, field.input.value] as const);
  if (values.some(([, value]) => value.trim() === "")) {
    return null;
  }
  return Object.fromEntries(values.map(([key, value]) => [key, Number(value)]));
}

/** Creates the field of one rule. */
function createRuleField(rule: RuleText, lan: LANSummary): RuleField {
  const field = createField({ id: `rule-${rule.key}`, label: rule.label, type: "number" });
  field.input.step = allowsDecimals(rule) ? "any" : "1";
  field.input.value = String(lan.rules[rule.key] ?? "");
  field.input.disabled = rule.key === RULE_XP_PER_LEVEL && Date.now() >= lan.starts_at;
  const duration = createElement("span", "duration");
  const box = createElement("div", "unit-box");
  field.input.replaceWith(box);
  box.append(field.input, createElement("span", "unit", nameUnit(rule)), duration);
  return { rule, field, duration };
}

/** Shows which fields differ from the saved rules and what can be done about it. */
function refresh({ lan, entries, save, discard }: RulesFormParts): void {
  let isAnyChanged = false;
  for (const entry of entries) {
    writeHint(entry);
    const { value } = entry.field.input;
    const isChanged = value === "" || Number(value) !== lan.rules[entry.rule.key];
    entry.field.root.classList.toggle(CLASS_CHANGED, isChanged);
    isAnyChanged ||= isChanged;
  }
  save.disabled = !isAnyChanged;
  discard.disabled = !isAnyChanged;
}

/** Puts the saved values back into the fields. */
function restoreSaved(parts: RulesFormParts): void {
  for (const { rule, field } of parts.entries) {
    field.input.value = String(parts.lan.rules[rule.key]);
  }
  parts.message.clear();
  refresh(parts);
}

/** Names the rules in a text. The server only says that one of them is invalid. */
function nameRules(entries: RuleField[], changes: GameRules): string {
  return entries
    .filter(({ rule }) => rule.key in changes)
    .map(({ rule }) => rule.label)
    .join(", ");
}

/** Puts the label in place of the technical name that starts the error of the server. */
function explainRuleError(text: string, entries: RuleField[]): string {
  const entry = entries.find(({ rule }) => text.startsWith(`${rule.key} `));
  return entry === undefined ? text : entry.rule.label + text.slice(entry.rule.key.length);
}

/** Sends the changes and takes over what the server saved. */
function submitRules(parts: RulesFormParts, onFailure: FailureHandler): void {
  const { lan, entries, message, save } = parts;
  const edited = readRules(entries);
  if (edited === null) {
    message.showBad(TEXT_FILL_ALL);
    return;
  }
  const changes = findRuleChanges(lan.rules, edited);
  save.disabled = true;
  patchRules(lan.id, changes)
    .then((saved) => {
      lan.rules = saved;
      restoreSaved(parts);
      message.showGood(`Gespeichert: ${nameRules(entries, changes)}.`);
    })
    .catch((error: unknown) => {
      save.disabled = false;
      onFailure(error, (text) => message.showBad(explainRuleError(text, entries)));
    });
}

/** Creates the panel with all rules. `lan.rules` follows what the server saved. */
export function createRulesForm(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  const groups = groupRules(lan.rules).map((group) => ({
    title: group.title,
    entries: group.rules.map((rule) => createRuleField(rule, lan)),
  }));
  const discard = createElement("button", "quiet", "Verwerfen");
  discard.type = "button";
  const parts: RulesFormParts = {
    lan,
    entries: groups.flatMap((group) => group.entries),
    message: createMessage(),
    save: createElement("button", "", "Änderungen speichern"),
    discard,
  };
  const form = createElement(
    "form",
    "panel",
    createElement("h3", "", "Regeln"),
    // Only the first group is open, the others wait folded until someone needs them.
    ...groups.map((group, index) => {
      const fold = createElement(
        "details",
        "rule-group",
        createElement("summary", "", group.title),
        createElement("div", "rule-fields", ...group.entries.map((entry) => entry.field.root)),
      );
      fold.open = index === 0;
      return fold;
    }),
    parts.message.root,
    createElement("div", "actions", parts.save, discard),
  );
  discard.addEventListener("click", () => restoreSaved(parts));
  form.addEventListener("input", () => refresh(parts));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitRules(parts, onFailure);
  });
  refresh(parts);
  return form;
}
