import type { User } from "../../auth/auth.db.ts";
import {
  escapeHtml,
  dataTable,
  dataTableBody,
  type DataTableOptions,
  type SelectOption,
  page,
  pageHeader,
  backLink,
  card,
  selectField,
  textareaField,
  formActions,
  button,
  linkButton,
  statusMap,
  savedIndicator,
  readOnlyNote,
} from "../../components/index.ts";
import type { Page } from "../../core/repository.ts";
import { can } from "../../core/permissions.ts";
import type {
  Visit,
  VisitActionItem,
  VisitListRow,
  VisitSource,
  VisitStatus,
} from "./visits.db.ts";
import { VISITS_MODULE } from "./visits.rules.ts";

const SOURCE = statusMap<VisitSource>({
  labels: { web: "Manual", telegram: "Audio" },
  variants: { web: "neutral", telegram: "info" },
});
const STATUS = statusMap<VisitStatus>({
  labels: {
    draft: "Borrador",
    processing: "Procesando",
    ready: "Lista",
    failed: "Falló",
  },
  variants: {
    draft: "neutral",
    processing: "warning",
    ready: "success",
    failed: "danger",
  },
});

/** Badge for a visit's source (Manual/Audio) — reused by related sections. */
export const visitSourceBadge = (source: VisitSource): string =>
  SOURCE.badge(source);
/** Badge for a visit's processing status — reused by related sections. */
export const visitStatusBadge = (status: VisitStatus): string =>
  STATUS.badge(status);

const NO_COMPANY: SelectOption = { value: "", label: "— Sin compañía —" };
const NO_PROJECT: SelectOption = { value: "", label: "— Sin proyecto —" };

interface FormValues {
  companyId: string;
  projectId: string;
  notes: string;
}

/** The company/project/notes fields for the web create + edit forms. */
function visitFields(
  values: FormValues,
  errors: Record<string, string>,
  editable: boolean,
  companyOptions: SelectOption[],
  projectOptions: SelectOption[]
): string {
  return `
    ${selectField({
      name: "company_id",
      label: "Compañía",
      options: [NO_COMPANY, ...companyOptions],
      value: values.companyId,
      disabled: !editable,
      error: errors.company_id,
    })}
    ${selectField({
      name: "project_id",
      label: "Proyecto",
      options: [NO_PROJECT, ...projectOptions],
      value: values.projectId,
      disabled: !editable,
      error: errors.project_id,
    })}
    ${textareaField({
      name: "notes",
      label: "Notas de la visita",
      value: values.notes,
      disabled: !editable,
      rows: 6,
      attrs: 'maxlength="4000"',
      error: errors.notes,
    })}`;
}

/** Search text + filter selections that drive the visits list. */
export interface VisitFilters {
  q: string;
  company: string;
  project: string;
  status: string;
  source: string;
}

function visitSubject(v: VisitListRow): string {
  const code = v.project_code ?? v.company_code;
  return code ? escapeHtml(code) : `#${v.id}`;
}

function visitsTableOptions(
  result: Page<VisitListRow>,
  filters: VisitFilters,
  companyOptions: SelectOption[],
  projectOptions: SelectOption[]
): DataTableOptions<VisitListRow> {
  const anyFilter = !!(
    filters.q ||
    filters.company ||
    filters.project ||
    filters.status ||
    filters.source
  );
  return {
    id: "visits",
    endpoint: "/visits",
    columns: [
      { header: "Visita", cell: (v) => visitSubject(v), primary: true },
      {
        header: "Compañía",
        cell: (v) => (v.company_name ? escapeHtml(v.company_name) : "—"),
      },
      {
        header: "Proyecto",
        cell: (v) => (v.project_name ? escapeHtml(v.project_name) : "—"),
      },
      { header: "Origen", cell: (v) => SOURCE.badge(v.source), width: "110px" },
      { header: "Estado", cell: (v) => STATUS.badge(v.status), width: "120px" },
      {
        header: "Fecha",
        cell: (v) => escapeHtml(v.created_at.slice(0, 10)),
        width: "120px",
      },
    ],
    rows: result.rows,
    rowHref: (v) => `/visits/${v.id}`,
    empty: anyFilter
      ? "Ninguna bitácora coincide con los filtros."
      : "No hay bitácoras todavía.",
    search: { value: filters.q, placeholder: "Buscar en notas o resumen..." },
    filters: [
      {
        name: "company",
        label: "Compañía",
        value: filters.company,
        options: companyOptions,
        anyLabel: "Todas",
      },
      {
        name: "project",
        label: "Proyecto",
        value: filters.project,
        options: projectOptions,
        anyLabel: "Todos",
      },
      {
        name: "source",
        label: "Origen",
        value: filters.source,
        options: SOURCE.options,
        anyLabel: "Todos",
      },
    ],
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  };
}

/** Full list page: a searchable, filterable, paginated table of visits. */
export function visitsListPage(
  result: Page<VisitListRow>,
  filters: VisitFilters,
  companyOptions: SelectOption[],
  projectOptions: SelectOption[],
  user: User
): string {
  const actions = can(user, VISITS_MODULE, "create")
    ? linkButton({ label: "+ Nueva", href: "/visits/new" })
    : "";
  const body = `
  ${pageHeader("Bitácoras", { eyebrow: "CRM", actions })}
  ${dataTable(visitsTableOptions(result, filters, companyOptions, projectOptions))}`;
  return page({ user, current: "/visits", title: "Bitácoras", body });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function visitsResults(
  result: Page<VisitListRow>,
  filters: VisitFilters,
  companyOptions: SelectOption[],
  projectOptions: SelectOption[]
): string {
  return dataTableBody(
    visitsTableOptions(result, filters, companyOptions, projectOptions)
  );
}

/** Create page (web): pick company/project + write notes. */
export function visitNewPage(
  user: User,
  companyOptions: SelectOption[],
  projectOptions: SelectOption[],
  values: FormValues = { companyId: "", projectId: "", notes: "" },
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${visitFields(values, errors, true, companyOptions, projectOptions)}
    ${formActions(
      button({ label: "Guardar" }),
      linkButton({ label: "Cancelar", href: "/visits", variant: "secondary" })
    )}`;
  const body = `
  ${backLink("/visits", "← Volver a bitácoras")}
  ${pageHeader("Nueva bitácora")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/visits"' })}`;
  return page({
    user,
    current: "/visits",
    title: "Nueva bitácora",
    body,
    maxWidth: "620px",
  });
}

/** The editable web-notes form, an HTMX swap target for inline saves. */
export function visitFormFragment(
  visit: Visit,
  user: User,
  companyOptions: SelectOption[],
  projectOptions: SelectOption[],
  opts: { errors?: Record<string, string>; saved?: boolean } = {}
): string {
  const canUpdate = can(user, VISITS_MODULE, "update");
  const values: FormValues = {
    companyId: visit.company_id ? String(visit.company_id) : "",
    projectId: visit.project_id ? String(visit.project_id) : "",
    notes: visit.notes,
  };
  const errors = opts.errors ?? {};
  const saveBtn = canUpdate ? button({ label: "Guardar" }) : "";
  const formBody = `
    ${readOnlyNote(canUpdate)}
    ${visitFields(values, errors, canUpdate, companyOptions, projectOptions)}
    ${formActions(saveBtn, savedIndicator(!!opts.saved))}`;
  return card(formBody, {
    as: "form",
    attrs: `id="visit-form" hx-put="/visits/${visit.id}" hx-target="#visit-form" hx-swap="outerHTML"`,
  });
}

/** One action item's controls, depending on its state. */
function actionItemRow(
  visitId: number,
  item: VisitActionItem,
  canCreateTask: boolean
): string {
  let control = "";
  if (item.status === "converted" && item.task_id) {
    control = `<a class="visit-action__done" href="/tasks/${item.task_id}">✓ Tarea creada</a>`;
  } else if (item.status === "dismissed") {
    control = `<span class="muted">Descartada</span>`;
  } else if (canCreateTask) {
    control = `${button({
      label: "Crear tarea",
      size: "sm",
      type: "button",
      attrs: `hx-post="/visits/${visitId}/action-items/${item.id}/task" hx-target="#visit-actions" hx-swap="outerHTML"`,
    })}${button({
      label: "Descartar",
      size: "sm",
      variant: "secondary",
      type: "button",
      attrs: `hx-post="/visits/${visitId}/action-items/${item.id}/dismiss" hx-target="#visit-actions" hx-swap="outerHTML"`,
    })}`;
  }
  return `<li class="visit-action">
    <span class="visit-action__text">${escapeHtml(item.text)}</span>
    <span class="visit-action__controls">${control}</span>
  </li>`;
}

/**
 * The "Accionables" section — an HTMX swap target (`#visit-actions`) so creating
 * a task or dismissing an item re-renders just this block.
 */
export function visitActionItemsSection(
  visitId: number,
  items: VisitActionItem[],
  opts: { canCreateTask: boolean }
): string {
  if (items.length === 0) {
    return `<section id="visit-actions"></section>`;
  }
  const anySuggested = items.some((i) => i.status === "suggested");
  const createAll =
    opts.canCreateTask && anySuggested
      ? button({
          label: "Crear todas las tareas",
          size: "sm",
          type: "button",
          attrs: `hx-post="/visits/${visitId}/action-items/tasks" hx-target="#visit-actions" hx-swap="outerHTML"`,
        })
      : "";
  const rows = items
    .map((i) => actionItemRow(visitId, i, opts.canCreateTask))
    .join("");
  return `<section id="visit-actions" class="visit-section">
    <div class="visit-section__head">
      <h2 class="visit-section__title">Accionables</h2>
      ${createAll}
    </div>
    <ul class="visit-actions-list">${rows}</ul>
  </section>`;
}

/** A read-only text block (summary/transcript) shown on the detail page. */
function textBlock(title: string, content: string): string {
  if (!content) return "";
  return `<section class="visit-section">
    <h2 class="visit-section__title">${escapeHtml(title)}</h2>
    <div class="visit-text">${escapeHtml(content)}</div>
  </section>`;
}

export interface VisitDetailOptions {
  companyOptions: SelectOption[];
  projectOptions: SelectOption[];
  contextHtml: string;
  actionItemsSection: string;
}

/** Full detail page: context, audio, summary/transcript, action items, notes. */
export function visitDetailPage(
  visit: Visit,
  user: User,
  opts: VisitDetailOptions
): string {
  const title =
    visit.source === "telegram" ? `Bitácora de audio #${visit.id}` : `Bitácora #${visit.id}`;

  const audio = visit.audio_path
    ? `<section class="visit-section">
        <h2 class="visit-section__title">Audio</h2>
        <audio controls preload="none" src="/visits/${visit.id}/audio"></audio>
      </section>`
    : "";

  // Web visits get the editable notes form; audio visits show transcript/summary.
  const notesBlock =
    visit.source === "web"
      ? `<section class="visit-section">
          <h2 class="visit-section__title">Notas</h2>
          ${visitFormFragment(visit, user, opts.companyOptions, opts.projectOptions)}
        </section>`
      : textBlock("Notas", visit.notes);

  const body = `
  ${backLink("/visits", "← Volver a bitácoras")}
  ${pageHeader(escapeHtml(title), {
    subtitle: escapeHtml(visit.created_at.slice(0, 16).replace("T", " ")),
    actions: `${SOURCE.badge(visit.source)} ${STATUS.badge(visit.status)}`,
  })}
  ${opts.contextHtml}
  ${textBlock("Resumen", visit.summary)}
  ${opts.actionItemsSection}
  ${audio}
  ${textBlock("Transcripción", visit.transcript)}
  ${notesBlock}`;

  return page({
    user,
    current: "/visits",
    title,
    body,
    maxWidth: "720px",
    pageStyles: VISIT_PAGE_STYLES,
  });
}

/** Styles for the visit detail page sections. */
const VISIT_PAGE_STYLES = `
  .visit-section { margin-top: var(--space-6); }
  .visit-section__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
  .visit-section__title { font-family: var(--font-display); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); letter-spacing: -0.01em; margin: 0 0 var(--space-2); }
  .visit-text { white-space: pre-wrap; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-3) var(--space-4); font-size: var(--font-size-sm); line-height: 1.5; }
  .visit-actions-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
  .visit-action { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) var(--space-3); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  .visit-action__text { font-size: var(--font-size-sm); }
  .visit-action__controls { display: inline-flex; gap: var(--space-2); flex: 0 0 auto; }
  .visit-action__done { color: var(--success); font-size: var(--font-size-sm); text-decoration: none; }
  .visit-detail audio, .visit-section audio { width: 100%; }
`;
