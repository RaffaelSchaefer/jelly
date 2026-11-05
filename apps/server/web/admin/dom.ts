/**
 * Small helpers to build the page. Text always goes in as text, so player input stays harmless.
 *
 * @module
 */

/** A child of an element. Empty values are left out, which keeps optional parts short to write. */
export type Child = Node | string | null | undefined;

/** Creates an element with a class and children. */
export function createElement<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  ...children: Child[]
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (className !== "") {
    element.className = className;
  }
  element.append(...children.filter((child) => child !== null && child !== undefined));
  return element;
}

/** Describes one labelled input. */
export interface FieldOptions {
  id: string;
  label: string;
  type?: string;
  hint?: string;
}

/** A labelled input with its parts, so that callers can read and change them. */
export interface Field {
  root: HTMLElement;
  input: HTMLInputElement;
  hint: HTMLElement;
}

/** Creates a label, an input and a line of help below them. */
export function createField(options: FieldOptions): Field {
  const label = createElement("label", "", options.label);
  label.htmlFor = options.id;
  const input = createElement("input", "");
  input.id = options.id;
  input.type = options.type ?? "text";
  const hint = createElement("p", "hint", options.hint);
  hint.hidden = options.hint === undefined;
  return { root: createElement("div", "field", label, input, hint), input, hint };
}

/** Creates a button that does not submit a form. */
export function createButton(text: string, className: string, onClick: () => void) {
  const button = createElement("button", className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

/** A line that reports the result of an action. */
export interface Message {
  root: HTMLElement;
  showGood(text: string): void;
  showBad(text: string): void;
  clear(): void;
}

/** Creates an empty message line that screen readers announce. */
export function createMessage(): Message {
  const root = createElement("p", "message");
  root.setAttribute("role", "status");
  root.hidden = true;
  const show = (text: string, className: string) => {
    root.className = `message ${className}`;
    root.textContent = text;
    root.hidden = false;
  };
  return {
    root,
    showGood: (text) => show(text, "message-good"),
    showBad: (text) => show(text, "message-bad"),
    clear: () => {
      root.hidden = true;
    },
  };
}
