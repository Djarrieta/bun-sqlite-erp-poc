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

/**
 * Form-control styles, aggregated into the global stylesheet by `layout.ts`.
 * Includes the multi-select chip styles shared by `chipGroup()` and the
 * data-table filter panel.
 */
export const formStyles = `
    input, select, textarea {
      width: 100%;
      padding: var(--control-pad-y) var(--control-pad-x);
      font-family: inherit;
      font-size: var(--font-size-base);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-sunken);
      color: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
    }
    input::placeholder, textarea::placeholder { color: var(--text-muted); opacity: 0.8; }
    textarea { resize: vertical; min-height: 5rem; }
    .field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-3); }
    .field__label { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
    .field__hint { color: var(--text-muted); font-weight: var(--font-weight-normal); }
    .field__error { color: var(--danger); font-size: var(--font-size-xs); }
    .form-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-4); }

    /* Multi-select chips (shared by chipGroup() and the filter panel). */
    .data-filter__group { border: 0; margin: 0; padding: 0; min-inline-size: 0; }
    .data-filter__group > .field__label { display: block; margin-bottom: var(--space-2); }
    .data-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .data-chip { display: inline-flex; cursor: pointer; }
    .data-chip input { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
    .data-chip > span { display: inline-block; padding: var(--space-1) var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-full); background: var(--surface); font-size: var(--font-size-sm); line-height: 1.4; user-select: none; transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
    .data-chip > span:hover { border-color: var(--text-muted); }
    .data-chip:has(input:checked) > span { background: color-mix(in srgb, var(--accent) 14%, transparent); border-color: var(--accent); color: var(--accent-text); }
    .data-chip:has(input:focus-visible) > span { outline: 2px solid var(--accent); outline-offset: 2px; }

    @media (max-width: 860px) {
      .form-actions .btn { flex: 1 1 auto; }
    }`;
