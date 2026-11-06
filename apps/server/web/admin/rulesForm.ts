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
}

/** The parts of the form that its actions work on. */
interface RulesFormParts {
  lan: LANSummary;
  entries: RuleField[];
  message: Message;
  save: HTMLButtonElement;
  discard: HTMLButtonElement;
}

/** Writes the help line, which also says how long a number of seconds is. */
function writeHint({ rule, field }: RuleField): void {
  const parts = [
    rule.unit === "seconds" && field.input.value !== ""
      ? formatDuration(Number(field.input.value))
      : undefined,
    rule.unit === "percent" ? "Prozent" : undefined,
    rule.hint,
  ].filter((part) => part !== undefined);
  field.hint.textContent = parts.join(". ");
  field.hint.hidden = parts.length === 0;
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
  return { rule, field };
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
    ...groups.map((group) =>
      createElement(
        "fieldset",
        "rule-group",
        createElement("legend", "", group.title),
        ...group.entries.map((entry) => entry.field.root),
      ),
    ),
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
