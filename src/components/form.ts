/**
 * Reusable form fields. Each renders a labelled control inside a `.field`
 * wrapper (styles live in `layout.ts`) and escapes user-supplied values, so
 * modules describe their inputs declaratively instead of hand-writing markup.
 */
import { escapeHtml } from "./layout.ts";

function labelHtml(forId: string, label: string, hint?: string): string {
  const hintHtml = hint
    ? ` <span class="field__hint">${escapeHtml(hint)}</span>`
    : "";
  return `<label class="field__label" for="${forId}">${escapeHtml(
    label
  )}${hintHtml}</label>`;
}

function errorHtml(error?: string): string {
  return error ? `<span class="field__error">${escapeHtml(error)}</span>` : "";
}

export interface FieldOptions {
  name: string;
  label: string;
  /** Input type (text, email, password, number, ...). Defaults to "text". */
  type?: string;
  value?: string;
  placeholder?: string;
  /** Muted helper text shown next to the label. */
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  autocomplete?: string;
  /** Defaults to `name`. */
  id?: string;
  /** Extra raw attributes, e.g. `maxlength="120" minlength="8"`. */
  attrs?: string;
}

/** A labelled text-style input wrapped in a `.field`. */
export function textField(opts: FieldOptions): string {
  const id = opts.id ?? opts.name;
  const attrs = [
    opts.required ? "required" : "",
    opts.disabled ? "disabled" : "",
    opts.placeholder ? `placeholder="${escapeHtml(opts.placeholder)}"` : "",
    opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : "",
    opts.attrs ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<div class="field">
    ${labelHtml(id, opts.label, opts.hint)}
    <input id="${id}" name="${escapeHtml(opts.name)}" type="${
    opts.type ?? "text"
  }" value="${escapeHtml(opts.value ?? "")}"${attrs ? " " + attrs : ""} />
    ${errorHtml(opts.error)}
  </div>`;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldOptions {
  name: string;
  label: string;
  options: SelectOption[];
  value?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
  attrs?: string;
}

/** A labelled `<select>` wrapped in a `.field`. */
export function selectField(opts: SelectFieldOptions): string {
  const id = opts.id ?? opts.name;
  const options = opts.options
    .map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${
          o.value === opts.value ? " selected" : ""
        }>${escapeHtml(o.label)}</option>`
    )
    .join("");
  const attrs = [opts.disabled ? "disabled" : "", opts.attrs ?? ""]
    .filter(Boolean)
    .join(" ");
  return `<div class="field">
    ${labelHtml(id, opts.label, opts.hint)}
    <select id="${id}" name="${escapeHtml(opts.name)}"${
    attrs ? " " + attrs : ""
  }>${options}</select>
    ${errorHtml(opts.error)}
  </div>`;
}

/** Wraps action buttons in a consistent, wrapping row. Falsy items are dropped. */
export function formActions(...items: string[]): string {
  return `<div class="form-actions">${items.filter(Boolean).join("")}</div>`;
}
