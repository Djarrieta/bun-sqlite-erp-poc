import type { User } from "../../auth/auth.db.ts";
import {
  escapeHtml,
  badge,
  dataTable,
  dataTableBody,
  type DataTableOptions,
  page,
  pageHeader,
  backLink,
  card,
  textField,
  selectField,
  formActions,
  button,
  linkButton,
  statusMap,
  savedIndicator,
  readOnlyNote,
} from "../../components/index.ts";
import type { Page } from "../../core/repository.ts";
import { can } from "../../core/permissions.ts";
import type { Location, LocationKind } from "./locations.db.ts";
import { LOCATIONS_MODULE, LOCATION_KINDS } from "./locations.rules.ts";

const KIND = statusMap<LocationKind>({
  labels: { warehouse: "Bodega", store: "Tienda", transit: "Tránsito" },
  variants: { warehouse: "info", store: "success", transit: "warning" },
  order: LOCATION_KINDS,
});
const KIND_OPTIONS = KIND.options;

/** Yes/No options for the boolean "active" flag (no checkbox component). */
const BOOL_OPTIONS = [
  { value: "1", label: "Activa" },
  { value: "0", label: "Archivada" },
];

interface FormValues {
  code: string;
  name: string;
  kind: LocationKind;
  isActive: boolean;
}

function kindBadge(kind: LocationKind): string {
  return KIND.badge(kind);
}

function activeBadge(isActive: number): string {
  return isActive
    ? badge("Activa", "success")
    : badge("Archivada", "neutral");
}

/** The code/name/kind/active fields, shared by the create and edit forms. */
function locationFields(
  values: FormValues,
  errors: Record<string, string>,
  editable: boolean
): string {
  return `
    ${textField({
      name: "code",
      label: "Código",
      hint: "(ej: BOD-01)",
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
      name: "kind",
      label: "Tipo",
      options: KIND_OPTIONS,
      value: values.kind,
      disabled: !editable,
      error: errors.kind,
    })}
    ${selectField({
      name: "is_active",
      label: "Estado",
      options: BOOL_OPTIONS,
      value: values.isActive ? "1" : "0",
      disabled: !editable,
    })}`;
}

/** Search text + filter selections that drive the locations list. */
export interface LocationFilters {
  q: string;
  kind: string;
  active: string;
}

/**
 * Column + search + filter + pagination config for the locations list, shared
 * by the full page and the HTMX results fragment so both render identically.
 */
function locationsTableOptions(
  result: Page<Location>,
  filters: LocationFilters
): DataTableOptions<Location> {
  const anyFilter = !!(filters.q || filters.kind || filters.active);
  return {
    id: "locations",
    endpoint: "/locations",
    columns: [
      {
        header: "Código",
        cell: (l) => `<code>${escapeHtml(l.code)}</code>`,
        primary: true,
      },
      { header: "Nombre", cell: (l) => escapeHtml(l.name) },
      { header: "Tipo", cell: (l) => kindBadge(l.kind), width: "130px" },
      { header: "Estado", cell: (l) => activeBadge(l.is_active), width: "130px" },
    ],
    rows: result.rows,
    rowHref: (l) => `/locations/${l.id}`,
    empty: anyFilter
      ? "Ninguna ubicación coincide con los filtros."
      : "No hay ubicaciones todavía.",
    search: { value: filters.q, placeholder: "Buscar código o nombre..." },
    filters: [
      {
        name: "kind",
        label: "Tipo",
        value: filters.kind,
        options: KIND_OPTIONS,
        anyLabel: "Todos",
      },
      {
        name: "active",
        label: "Estado",
        value: filters.active,
        options: BOOL_OPTIONS,
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

/** Full list page: a searchable, filterable, paginated table of locations. */
export function locationsListPage(
  result: Page<Location>,
  filters: LocationFilters,
  user: User
): string {
  const actions = can(user, LOCATIONS_MODULE, "create")
    ? linkButton({ label: "+ Nueva", href: "/locations/new" })
    : "";

  const body = `
  ${pageHeader("Ubicaciones", { eyebrow: "Logística", actions })}
  ${dataTable(locationsTableOptions(result, filters))}`;

  return page({
    user,
    current: "/locations",
    title: "Ubicaciones",
    body,
  });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function locationsResults(
  result: Page<Location>,
  filters: LocationFilters
): string {
  return dataTableBody(locationsTableOptions(result, filters));
}

/** Create page with an empty (or error-repopulated) form. */
export function locationNewPage(
  user: User,
  values: FormValues = {
    code: "",
    name: "",
    kind: "warehouse",
    isActive: true,
  },
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${locationFields(values, errors, true)}
    ${formActions(
      button({ label: "Crear" }),
      linkButton({ label: "Cancelar", href: "/locations", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/locations", "← Volver a ubicaciones")}
  ${pageHeader("Nueva ubicación")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/locations"' })}`;

  return page({
    user,
    current: "/locations",
    title: "Nueva ubicación",
    body,
    maxWidth: "620px",
  });
}

/**
 * The editable detail form, rendered standalone as an HTMX swap target so that
 * updates re-render just this fragment. Controls appear only when the user's
 * business rules permit them.
 */
export function locationFormFragment(
  location: Location,
  user: User,
  opts: { errors?: Record<string, string>; saved?: boolean } = {}
): string {
  const canUpdate = can(user, LOCATIONS_MODULE, "update");
  const values: FormValues = {
    code: location.code,
    name: location.name,
    kind: location.kind,
    isActive: location.is_active === 1,
  };
  const errors = opts.errors ?? {};

  const saveBtn = canUpdate ? button({ label: "Guardar" }) : "";
  const savedMsg = savedIndicator(!!opts.saved);
  const readonlyNote = readOnlyNote(canUpdate);

  const formBody = `
    ${readonlyNote}
    ${locationFields(values, errors, canUpdate)}
    ${formActions(saveBtn, savedMsg)}`;

  return card(formBody, {
    as: "form",
    attrs: `id="location-form" hx-put="/locations/${location.id}" hx-target="#location-form" hx-swap="outerHTML"`,
  });
}

/** Full detail page wrapping the editable form. */
export function locationDetailPage(location: Location, user: User): string {
  const headerActions = [
    kindBadge(location.kind),
    activeBadge(location.is_active),
  ].join(" ");
  const body = `
  ${backLink("/locations", "← Volver a ubicaciones")}
  ${pageHeader(escapeHtml(location.code), {
    subtitle: escapeHtml(location.name),
    actions: headerActions,
  })}
  ${locationFormFragment(location, user)}`;

  return page({
    user,
    current: "/locations",
    title: location.code,
    body,
    maxWidth: "620px",
  });
}
