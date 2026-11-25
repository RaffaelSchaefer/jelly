/**
 * The form for the rules of a LAN. It sends only what changed, so a value someone else set in the
 * meantime stays.
 *
 * @module
 */

import { patchRules, type GameRules, type LANSummary } from "./api.ts";
import type { FailureHandler } from "./failure.ts";
import {
  createElement,
  createField,
  createLabelled,
  createMessage,
  createSelect,
  type Message,
} from "./dom.ts";
import { createLevelPreview, type LevelPreview } from "./levelPreview.ts";
import {
  allowsDecimals,
  findRuleChanges,
  formatDuration,
  groupRules,
  isRuleShown,
  type RuleText,
} from "./rules.ts";

const TEXT_FILL_ALL = "Bitte fülle alle Regeln aus.";
const CLASS_CHANGED = "is-changed";

/** One rule on the page. */
interface RuleField {
  rule: RuleText;
  root: HTMLElement;
  control: HTMLInputElement | HTMLSelectElement;
  hint: HTMLElement;
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
  preview: LevelPreview;
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
function writeHint({ rule, control, hint, duration }: RuleField): void {
  duration.textContent =
    rule.unit === "seconds" && control.value !== ""
      ? `= ${formatDuration(Number(control.value))}`
      : "";
  hint.textContent = rule.hint ?? "";
  hint.hidden = rule.hint === undefined;
}

/** Reads one field, a choice as text and everything else as a number. */
function readValue({ rule, control }: RuleField): number | string {
  return rule.choices === undefined ? Number(control.value) : control.value;
}

/** Reads all fields. Gives `null` when one is empty. */
function readRules(entries: RuleField[]): GameRules | null {
  if (entries.some(({ control }) => control.value.trim() === "")) {
    return null;
  }
  return Object.fromEntries(entries.map((entry) => [entry.rule.key, readValue(entry)]));
}

/** Reads the fields that hold a value, for a preview while someone types. */
function readFilledRules(entries: RuleField[]): GameRules {
  const filled = entries.filter(({ control }) => control.value.trim() !== "");
  return Object.fromEntries(filled.map((entry) => [entry.rule.key, readValue(entry)]));
}

/** Creates the dropdown of a choice. */
function createChoiceField(rule: RuleText, lan: LANSummary): RuleField {
  const id = `rule-${rule.key}`;
  const control = createSelect(id, rule.choices ?? [], String(lan.rules[rule.key] ?? ""));
  const hint = createElement("p", "hint");
  const root = createLabelled(id, rule.label, control);
  root.append(hint);
  return { rule, root, control, hint, duration: createElement("span", "duration") };
}

/** Creates the number field of one rule. */
function createNumberField(rule: RuleText, lan: LANSummary): RuleField {
  const field = createField({ id: `rule-${rule.key}`, label: rule.label, type: "number" });
  field.input.step = allowsDecimals(rule) ? "any" : "1";
  field.input.value = String(lan.rules[rule.key] ?? "");
  const duration = createElement("span", "duration");
  const box = createElement("div", "unit-box");
  field.input.replaceWith(box);
  box.append(field.input, createElement("span", "unit", nameUnit(rule)), duration);
  return { rule, root: field.root, control: field.input, hint: field.hint, duration };
}

/** Creates the field of one rule. */
function createRuleField(rule: RuleText, lan: LANSummary): RuleField {
  const entry =
    rule.choices === undefined ? createNumberField(rule, lan) : createChoiceField(rule, lan);
  entry.control.disabled = rule.locked === true && Date.now() >= lan.starts_at;
  return entry;
}

/** Shows which fields differ from the saved rules and what can be done about it. */
function refresh({ lan, entries, save, discard, preview }: RulesFormParts): void {
  const current = readFilledRules(entries);
  let isAnyChanged = false;
  for (const entry of entries) {
    writeHint(entry);
    entry.root.hidden = !isRuleShown(entry.rule, current);
    const isChanged = entry.control.value === "" || readValue(entry) !== lan.rules[entry.rule.key];
    entry.root.classList.toggle(CLASS_CHANGED, isChanged);
    isAnyChanged ||= isChanged;
  }
  save.disabled = !isAnyChanged;
  discard.disabled = !isAnyChanged;
  preview.update({ ...lan.rules, ...current });
}

/** Puts the saved values back into the fields. */
function restoreSaved(parts: RulesFormParts): void {
  for (const { rule, control } of parts.entries) {
    control.value = String(parts.lan.rules[rule.key]);
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
function explainRuleError(text: string, rules: RuleText[]): string {
  const rule = rules.find(({ key }) => text.startsWith(`${key} `));
  return rule === undefined ? text : rule.label + text.slice(rule.key.length);
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
      const rules = entries.map(({ rule }) => rule);
      onFailure(error, (text) => message.showBad(explainRuleError(text, rules)));
    });
}

/** Folds the fields of one group, with the preview of the levels below them if it has one. */
function createGroupFold(
  title: string,
  entries: RuleField[],
  preview: HTMLElement | null,
): HTMLDetailsElement {
  const fields = createElement("div", "rule-fields", ...entries.map((entry) => entry.root));
  const fold = createElement("details", "rule-group", createElement("summary", "", title), fields);
  if (preview !== null) {
    fold.append(preview);
  }
  return fold;
}

/** Creates the panel with all rules. `lan.rules` follows what the server saved. */
export function createRulesForm(lan: LANSummary, onFailure: FailureHandler): HTMLElement {
  const groups = groupRules(lan.rules).map((group) => ({
    ...group,
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
    preview: createLevelPreview(),
  };
  const folds = groups.map((group) =>
    createGroupFold(group.title, group.entries, group.previewsLevels ? parts.preview.root : null),
  );
  // Only the first group is open, the others wait folded until someone needs them.
  folds[0]?.setAttribute("open", "");
  const form = createElement(
    "form",
    "panel",
    createElement("h3", "", "Regeln"),
    ...folds,
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
