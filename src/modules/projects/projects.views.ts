import type { User } from "../../auth/auth.db.ts";
import {
  escapeHtml,
  badge,
  dataTable,
  dataTableBody,
  type DataTableOptions,
  type SelectOption,
  page,
  pageHeader,
  backLink,
  card,
  table,
  textField,
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
import type { Location } from "../locations/locations.db.ts";
import type { Project, ProjectListRow, ProjectStatus } from "./projects.db.ts";
import { PROJECTS_MODULE, PROJECT_STATUSES } from "./projects.rules.ts";

const STATUS = statusMap<ProjectStatus>({
  labels: {
    prospect: "Prospecto",
    active: "Activo",
    on_hold: "En pausa",
    done: "Finalizado",
    cancelled: "Cancelado",
  },
  variants: {
    prospect: "info",
    active: "success",
    on_hold: "warning",
    done: "neutral",
    cancelled: "danger",
  },
  order: PROJECT_STATUSES,
});
const STATUS_OPTIONS = STATUS.options;

export function projectStatusBadge(status: ProjectStatus): string {
  return STATUS.badge(status);
}

interface FormValues {
  code: string;
  name: string;
  companyId: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  description: string;
}

/** The shared fields used by the create and edit forms. */
function projectFields(
  values: FormValues,
  errors: Record<string, string>,
  editable: boolean,
  companyOptions: SelectOption[]
): string {
  return `
    ${textField({
      name: "code",
      label: "Código",
      hint: "(ej: PRJ-01)",
      value: values.code,
      required: true,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="30" style="text-transform:uppercase"',
      error: errors.code,
    })}
    ${textField({
      name: "name",
      label: "Nombre",
      value: values.name,
      required: true,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="120"',
      error: errors.name,
    })}
    ${selectField({
      name: "company_id",
      label: "Compañía",
      options: [{ value: "", label: "— Selecciona compañía —" }, ...companyOptions],
      value: values.companyId,
      disabled: !editable,
      error: errors.company_id,
    })}
    ${selectField({
      name: "status",
      label: "Estado",
      options: STATUS_OPTIONS,
      value: values.status,
      disabled: !editable,
      error: errors.status,
    })}
    ${textField({
      name: "start_date",
      label: "Fecha de inicio",
      type: "date",
      value: values.startDate,
      disabled: !editable,
      error: errors.start_date,
    })}
    ${textField({
      name: "end_date",
      label: "Fecha de fin",
      type: "date",
      value: values.endDate,
      disabled: !editable,
      error: errors.end_date,
    })}
    ${textareaField({
      name: "description",
      label: "Descripción",
      value: values.description,
      disabled: !editable,
      rows: 5,
      attrs: 'maxlength="2000"',
      error: errors.description,
    })}`;
}

/** Search text + filter selections that drive the projects list. */
export interface ProjectFilters {
  q: string;
  status: string;
  company: string;
}

function projectsTableOptions(
  result: Page<ProjectListRow>,
  filters: ProjectFilters,
  companyOptions: SelectOption[]
): DataTableOptions<ProjectListRow> {
  const anyFilter = !!(filters.q || filters.status || filters.company);
  return {
    id: "projects",
    endpoint: "/projects",
    columns: [
      {
        header: "Código",
        cell: (p) => `<code>${escapeHtml(p.code)}</code>`,
        primary: true,
      },
      { header: "Nombre", cell: (p) => escapeHtml(p.name) },
      { header: "Compañía", cell: (p) => escapeHtml(p.company_name) },
      {
        header: "Estado",
        cell: (p) => projectStatusBadge(p.status),
        width: "130px",
      },
    ],
    rows: result.rows,
    rowHref: (p) => `/projects/${p.id}`,
    empty: anyFilter
      ? "Ningún proyecto coincide con los filtros."
      : "No hay proyectos todavía.",
    search: { value: filters.q, placeholder: "Buscar código, nombre o compañía..." },
    filters: [
      {
        name: "status",
        label: "Estado",
        value: filters.status,
        options: STATUS_OPTIONS,
        anyLabel: "Todos",
      },
      {
        name: "company",
        label: "Compañía",
        value: filters.company,
        options: companyOptions,
        anyLabel: "Todas",
      },
    ],
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  };
}

/** Full list page: a searchable, filterable, paginated table of projects. */
export function projectsListPage(
  result: Page<ProjectListRow>,
  filters: ProjectFilters,
  companyOptions: SelectOption[],
  user: User
): string {
  const actions = can(user, PROJECTS_MODULE, "create")
    ? linkButton({ label: "+ Nuevo", href: "/projects/new" })
    : "";

  const body = `
  ${pageHeader("Proyectos", { eyebrow: "CRM", actions })}
  ${dataTable(projectsTableOptions(result, filters, companyOptions))}`;

  return page({ user, current: "/projects", title: "Proyectos", body });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function projectsResults(
  result: Page<ProjectListRow>,
  filters: ProjectFilters,
  companyOptions: SelectOption[]
): string {
  return dataTableBody(projectsTableOptions(result, filters, companyOptions));
}

/** Create page with an empty (or error-repopulated) form. */
export function projectNewPage(
  user: User,
  companyOptions: SelectOption[],
  values: FormValues = {
    code: "",
    name: "",
    companyId: "",
    status: "prospect",
    startDate: "",
    endDate: "",
    description: "",
  },
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${projectFields(values, errors, true, companyOptions)}
    ${formActions(
      button({ label: "Crear" }),
      linkButton({ label: "Cancelar", href: "/projects", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/projects", "← Volver a proyectos")}
  ${pageHeader("Nuevo proyecto")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/projects"' })}`;

  return page({
    user,
    current: "/projects",
    title: "Nuevo proyecto",
    body,
    maxWidth: "620px",
  });
}

/** The editable detail form, rendered standalone as an HTMX swap target. */
export function projectFormFragment(
  project: Project,
  user: User,
  companyOptions: SelectOption[],
  opts: { errors?: Record<string, string>; saved?: boolean } = {}
): string {
  const canUpdate = can(user, PROJECTS_MODULE, "update");
  const values: FormValues = {
    code: project.code,
    name: project.name,
    companyId: String(project.company_id),
    status: project.status,
    startDate: project.start_date,
    endDate: project.end_date,
    description: project.description,
  };
  const errors = opts.errors ?? {};

  const saveBtn = canUpdate ? button({ label: "Guardar" }) : "";
  const savedMsg = savedIndicator(!!opts.saved);
  const readonlyNote = readOnlyNote(canUpdate);

  const formBody = `
    ${readonlyNote}
    ${projectFields(values, errors, canUpdate, companyOptions)}
    ${formActions(saveBtn, savedMsg)}`;

  return card(formBody, {
    as: "form",
    attrs: `id="project-form" hx-put="/projects/${project.id}" hx-target="#project-form" hx-swap="outerHTML"`,
  });
}

/** One linked location plus the current unit count at it. */
export interface ProjectLocationRow {
  location: Location;
  units: number;
}

/**
 * The "Ubicaciones del proyecto" section on the detail page. Rendered as a
 * standalone HTMX swap target (`#project-locations`) so linking/unlinking a
 * location re-renders just this block. Shows each linked location with its
 * current stock, a shortcut to move equipment there (a prefilled transfer), and
 * an unlink control; plus a form to link an unassigned location.
 */
export function projectLocationsSection(
  projectId: number,
  rows: ProjectLocationRow[],
  unassignedOptions: SelectOption[],
  opts: { canManage: boolean; canCreateMovement: boolean }
): string {
  const listBody = table<ProjectLocationRow>({
    columns: [
      {
        header: "Código",
        cell: (r) => `<code>${escapeHtml(r.location.code)}</code>`,
        primary: true,
      },
      { header: "Nombre", cell: (r) => escapeHtml(r.location.name) },
      {
        header: "Equipo",
        cell: (r) => `${r.units} u.`,
        numeric: true,
      },
      {
        header: "Acciones",
        align: "right",
        cell: (r) => {
          const move = opts.canCreateMovement
            ? linkButton({
                label: "Trasladar equipo aquí",
                href: `/movements/new?kind=transfer&destination=${r.location.id}`,
                variant: "secondary",
                size: "sm",
              })
            : "";
          const unlink = opts.canManage
            ? button({
                label: "Quitar",
                variant: "danger",
                size: "sm",
                type: "button",
                attrs: `hx-delete="/projects/${projectId}/locations/${r.location.id}" hx-target="#project-locations" hx-swap="outerHTML" hx-confirm="¿Quitar esta ubicación del proyecto?"`,
              })
            : "";
          return `<div class="row-actions">${move}${unlink}</div>`;
        },
      },
    ],
    rows,
    empty: "Sin ubicaciones vinculadas.",
  });

  const linkForm =
    opts.canManage && unassignedOptions.length > 0
      ? `<form class="project-loc-link" hx-post="/projects/${projectId}/locations" hx-target="#project-locations" hx-swap="outerHTML">
          ${selectField({
            name: "location_id",
            label: "Vincular ubicación",
            options: unassignedOptions,
          })}
          ${formActions(button({ label: "Vincular", size: "sm" }))}
        </form>`
      : opts.canManage
        ? `<p class="muted">No hay ubicaciones activas disponibles para vincular.</p>`
        : "";

  return `<section id="project-locations" class="project-locations">
    <h2 class="section-title">Ubicaciones del proyecto</h2>
    ${listBody}
    ${linkForm}
  </section>`;
}

/** Full detail page: the editable form plus the linked-locations section. */
export function projectDetailPage(
  project: Project,
  companyName: string,
  user: User,
  companyOptions: SelectOption[],
  locationsSection: string,
  visitsSection: string
): string {
  const body = `
  ${backLink("/projects", "← Volver a proyectos")}
  ${pageHeader(escapeHtml(project.code), {
    subtitle: escapeHtml(`${project.name} · ${companyName}`),
    actions: projectStatusBadge(project.status),
  })}
  ${projectFormFragment(project, user, companyOptions)}
  ${locationsSection}
  ${visitsSection}`;

  return page({
    user,
    current: "/projects",
    title: project.code,
    body,
    maxWidth: "760px",
    pageStyles: PAGE_STYLES,
  });
}

/** Module-specific styles for the project detail's locations section. */
const PAGE_STYLES = `
  .project-locations { margin-top: var(--space-6); }
  .section-title { font-family: var(--font-display); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); letter-spacing: -0.01em; margin: 0 0 var(--space-3); }
  .project-loc-link { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border); }
  .row-actions { display: inline-flex; gap: var(--space-2); justify-content: flex-end; flex-wrap: wrap; }
  .related-section { margin-top: var(--space-6); }
  .related-section__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
  .related-section__title { font-family: var(--font-display); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); letter-spacing: -0.01em; margin: 0; }
  .related-section__actions { display: inline-flex; gap: var(--space-2); flex-wrap: wrap; }
`;
