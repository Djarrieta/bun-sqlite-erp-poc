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

export interface TextareaFieldOptions {
  name: string;
  label: string;
  value?: string;
  hint?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  /** Initial visible rows. Defaults to 4. */
  rows?: number;
  /** Defaults to `name`. */
  id?: string;
  /** Extra raw attributes, e.g. `maxlength="500"`. */
  attrs?: string;
}

/** A labelled multi-line `<textarea>` wrapped in a `.field`. */
export function textareaField(opts: TextareaFieldOptions): string {
  const id = opts.id ?? opts.name;
  const attrs = [
    opts.disabled ? "disabled" : "",
    opts.placeholder ? `placeholder="${escapeHtml(opts.placeholder)}"` : "",
    opts.attrs ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<div class="field">
    ${labelHtml(id, opts.label, opts.hint)}
    <textarea id="${id}" name="${escapeHtml(opts.name)}" rows="${
    opts.rows ?? 4
  }"${attrs ? " " + attrs : ""}>${escapeHtml(opts.value ?? "")}</textarea>
    ${errorHtml(opts.error)}
  </div>`;
}

/**
 * A single checkbox styled as a pill "chip" (see the `.data-chip` styles in
 * `layout.ts`). Several chips sharing one `name` submit as a repeated key
 * (`name=a&name=b`), read server-side with `searchParams.getAll(name)`.
 */
export function chip(opts: {
  name: string;
  value: string;
  label: string;
  checked?: boolean;
}): string {
  return `<label class="data-chip">
    <input type="checkbox" name="${escapeHtml(opts.name)}" value="${escapeHtml(
    opts.value
  )}"${opts.checked ? " checked" : ""} />
    <span>${escapeHtml(opts.label)}</span>
  </label>`;
}

/**
 * A labelled group of checkbox chips (a multi-select). All chips share `name`,
 * and `values` marks the pre-selected ones. Renders `empty` when there are no
 * options. Reuses the same `.data-filter__group` / `.data-chips` styling as the
 * data-table filter panel.
 */
export function chipGroup(opts: {
  legend: string;
  name: string;
  options: SelectOption[];
  values: string[];
  empty?: string;
}): string {
  const selected = new Set(opts.values);
  const chips = opts.options.length
    ? opts.options
        .map((o) =>
          chip({
            name: opts.name,
            value: o.value,
            label: o.label,
            checked: selected.has(o.value),
          })
        )
        .join("")
    : `<span class="muted">${escapeHtml(opts.empty ?? "Sin opciones.")}</span>`;
  return `<fieldset class="data-filter__group">
    <legend class="field__label">${escapeHtml(opts.legend)}</legend>
    <div class="data-chips">${chips}</div>
  </fieldset>`;
}
