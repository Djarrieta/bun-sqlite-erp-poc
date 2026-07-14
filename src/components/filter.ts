/**
 * A reusable, fully dynamic filter panel: a funnel button that discloses one
 * control per filter — a single-select dropdown or a multi-select chip group.
 * Pass any set of {@link FilterDef}s with your own param names, labels and
 * options; a badge shows how many are currently narrowing results.
 *
 * `dataTable` (table.ts) renders this next to its search box, but it is exported
 * on its own so any HTMX-driven region (a calendar, a card grid, …) can offer
 * the same filtering. Render it inside a form that HTMX-submits on change — see
 * `dataTable`'s toolbar for the canonical wiring. The filter `name`s become the
 * submitted field/URL names, so keep them trusted, developer-supplied constants.
 *
 * The single/multi controls delegate to `selectField()` / `chipGroup()`, so the
 * panel automatically matches the rest of the form components.
 */
import { selectField, chipGroup, type SelectOption } from "./form.ts";

export interface FilterDef {
  /**
   * Query-string param name, e.g. "status". Becomes a form-field and URL param
   * name, so it must be a trusted, developer-supplied constant.
   */
  name: string;
  /** Label shown above the control in the panel. */
  label: string;
  /** Selectable options. Single-select prepends a blank "any" option. */
  options: SelectOption[];
  /** Single-select current value, echoed back. Empty string means "any". */
  value?: string;
  /** Label for the blank "any" option (single-select). Defaults to "Todos". */
  anyLabel?: string;
  /** Render as a multi-select chip group (checkboxes) instead of a dropdown. */
  multiple?: boolean;
  /** Multi-select current values (used when `multiple` is true). */
  values?: string[];
}

/** Feather "filter" (funnel) icon used on the panel toggle. */
const FILTER_ICON = `<svg class="data-filter__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`;

/** Whether a filter currently narrows results (a value set or any chip on). */
export function filterActive(f: FilterDef): boolean {
  return f.multiple ? (f.values?.length ?? 0) > 0 : (f.value ?? "") !== "";
}

/** A single-select dropdown filter with a blank "any" option prepended. */
function singleFilter(f: FilterDef): string {
  return selectField({
    id: `filter-${f.name}`,
    name: f.name,
    label: f.label,
    value: f.value ?? "",
    options: [{ value: "", label: f.anyLabel ?? "Todos" }, ...f.options],
  });
}

/** A multi-select filter rendered as a group of toggle chips (checkboxes). */
function multiFilter(f: FilterDef): string {
  return chipGroup({
    legend: f.label,
    name: f.name,
    options: f.options,
    values: f.values ?? [],
    empty: "Sin opciones",
  });
}

/**
 * The filter (funnel) button plus a disclosure panel holding one control per
 * filter. The count badge reflects how many filters are currently active.
 */
export function filterPanel(filters: FilterDef[]): string {
  const active = filters.filter(filterActive).length;
  const count = active
    ? `<span class="data-filter__count">${active}</span>`
    : "";
  const fields = filters
    .map((f) => (f.multiple ? multiFilter(f) : singleFilter(f)))
    .join("");
  return `<details class="data-filter">
    <summary class="data-filter__toggle btn btn--secondary" title="Filtros" aria-label="Filtros">
      ${FILTER_ICON}<span class="data-filter__label">Filtros</span>${count}
    </summary>
    <div class="data-filter__panel" role="group" aria-label="Filtros">${fields}</div>
  </details>`;
}

/** Filter (funnel) panel styles, aggregated into the global stylesheet by
 *  `layout.ts`. The chip styles it reuses live with the form component. */
export const filterStyles = `
    .data-filter { position: relative; flex: 0 0 auto; }
    .data-filter__toggle { display: inline-flex; align-items: center; gap: var(--space-2); list-style: none; cursor: pointer; user-select: none; }
    .data-filter__toggle::-webkit-details-marker { display: none; }
    .data-filter__toggle::marker { content: ""; }
    .data-filter__icon { display: block; flex: 0 0 auto; }
    .data-filter[open] > .data-filter__toggle { border-color: var(--text-muted); background: var(--surface-raised); }
    .data-filter__count { display: inline-flex; align-items: center; justify-content: center; min-width: 1.1rem; height: 1.1rem; padding: 0 0.3rem; border-radius: var(--radius-full); background: var(--accent); color: var(--on-accent); font-size: var(--font-size-2xs); font-weight: var(--font-weight-semibold); line-height: 1; }
    .data-filter__panel { position: absolute; right: 0; top: calc(100% + var(--space-2)); z-index: 30; min-width: 18rem; max-width: min(22rem, calc(100vw - var(--space-6))); display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-md); }
    .data-filter__panel .field { margin-bottom: 0; }

    @media (max-width: 860px) {
      .data-filter__label { display: none; }
    }`;
