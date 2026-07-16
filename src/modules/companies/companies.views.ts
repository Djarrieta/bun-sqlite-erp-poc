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
  textareaField,
  formActions,
  button,
  linkButton,
  savedIndicator,
  readOnlyNote,
} from "../../components/index.ts";
import type { Page } from "../../core/repository.ts";
import { can } from "../../core/permissions.ts";
import type { Company } from "./companies.db.ts";
import { COMPANIES_MODULE } from "./companies.rules.ts";

/** Yes/No options for the boolean "active" flag (no checkbox component). */
const BOOL_OPTIONS = [
  { value: "1", label: "Activa" },
  { value: "0", label: "Archivada" },
];

interface FormValues {
  code: string;
  name: string;
  industry: string;
  website: string;
  phone: string;
  email: string;
  isActive: boolean;
  notes: string;
}

export function companyActiveBadge(isActive: number): string {
  return isActive
    ? badge("Activa", "success")
    : badge("Archivada", "neutral");
}

/** The shared fields used by the create and edit forms. */
function companyFields(
  values: FormValues,
  errors: Record<string, string>,
  editable: boolean
): string {
  return `
    ${textField({
      name: "code",
      label: "Código",
      hint: "(ej: ACME)",
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
    ${textField({
      name: "industry",
      label: "Industria",
      value: values.industry,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="80"',
      error: errors.industry,
    })}
    ${textField({
      name: "website",
      label: "Sitio web",
      value: values.website,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="200"',
      error: errors.website,
    })}
    ${textField({
      name: "phone",
      label: "Teléfono",
      value: values.phone,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="40"',
      error: errors.phone,
    })}
    ${textField({
      name: "email",
      label: "Correo",
      type: "email",
      value: values.email,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="160"',
      error: errors.email,
    })}
    ${selectField({
      name: "is_active",
      label: "Estado",
      options: BOOL_OPTIONS,
      value: values.isActive ? "1" : "0",
      disabled: !editable,
    })}
    ${textareaField({
      name: "notes",
      label: "Notas",
      value: values.notes,
      disabled: !editable,
      attrs: 'maxlength="1000"',
      error: errors.notes,
    })}`;
}

/** Search text + filter selections that drive the companies list. */
export interface CompanyFilters {
  q: string;
  active: string;
}

/**
 * Column + search + filter + pagination config for the companies list, shared
 * by the full page and the HTMX results fragment so both render identically.
 */
function companiesTableOptions(
  result: Page<Company>,
  filters: CompanyFilters
): DataTableOptions<Company> {
  const anyFilter = !!(filters.q || filters.active);
  return {
    id: "companies",
    endpoint: "/companies",
    columns: [
      {
        header: "Código",
        cell: (c) => `<code>${escapeHtml(c.code)}</code>`,
        primary: true,
      },
      { header: "Nombre", cell: (c) => escapeHtml(c.name) },
      {
        header: "Industria",
        cell: (c) => (c.industry ? escapeHtml(c.industry) : "—"),
      },
      {
        header: "Estado",
        cell: (c) => companyActiveBadge(c.is_active),
        width: "130px",
      },
    ],
    rows: result.rows,
    rowHref: (c) => `/companies/${c.id}`,
    empty: anyFilter
      ? "Ninguna compañía coincide con los filtros."
      : "No hay compañías todavía.",
    search: { value: filters.q, placeholder: "Buscar código, nombre o industria..." },
    filters: [
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

/** Full list page: a searchable, filterable, paginated table of companies. */
export function companiesListPage(
  result: Page<Company>,
  filters: CompanyFilters,
  user: User
): string {
  const actions = can(user, COMPANIES_MODULE, "create")
    ? linkButton({ label: "+ Nueva", href: "/companies/new" })
    : "";

  const body = `
  ${pageHeader("Compañías", { eyebrow: "CRM", actions })}
  ${dataTable(companiesTableOptions(result, filters))}`;

  return page({
    user,
    current: "/companies",
    title: "Compañías",
    body,
  });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function companiesResults(
  result: Page<Company>,
  filters: CompanyFilters
): string {
  return dataTableBody(companiesTableOptions(result, filters));
}

/** Create page with an empty (or error-repopulated) form. */
export function companyNewPage(
  user: User,
  values: FormValues = {
    code: "",
    name: "",
    industry: "",
    website: "",
    phone: "",
    email: "",
    isActive: true,
    notes: "",
  },
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${companyFields(values, errors, true)}
    ${formActions(
      button({ label: "Crear" }),
      linkButton({ label: "Cancelar", href: "/companies", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/companies", "← Volver a compañías")}
  ${pageHeader("Nueva compañía")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/companies"' })}`;

  return page({
    user,
    current: "/companies",
    title: "Nueva compañía",
    body,
    maxWidth: "620px",
  });
}

/**
 * The editable detail form, rendered standalone as an HTMX swap target so that
 * updates re-render just this fragment. Controls appear only when the user's
 * business rules permit them.
 */
export function companyFormFragment(
  company: Company,
  user: User,
  opts: { errors?: Record<string, string>; saved?: boolean } = {}
): string {
  const canUpdate = can(user, COMPANIES_MODULE, "update");
  const values: FormValues = {
    code: company.code,
    name: company.name,
    industry: company.industry,
    website: company.website,
    phone: company.phone,
    email: company.email,
    isActive: company.is_active === 1,
    notes: company.notes,
  };
  const errors = opts.errors ?? {};

  const saveBtn = canUpdate ? button({ label: "Guardar" }) : "";
  const savedMsg = savedIndicator(!!opts.saved);
  const readonlyNote = readOnlyNote(canUpdate);

  const formBody = `
    ${readonlyNote}
    ${companyFields(values, errors, canUpdate)}
    ${formActions(saveBtn, savedMsg)}`;

  return card(formBody, {
    as: "form",
    attrs: `id="company-form" hx-put="/companies/${company.id}" hx-target="#company-form" hx-swap="outerHTML"`,
  });
}

/** Full detail page wrapping the editable form and any related sections. */
export function companyDetailPage(
  company: Company,
  user: User,
  relatedSections = ""
): string {
  const body = `
  ${backLink("/companies", "← Volver a compañías")}
  ${pageHeader(escapeHtml(company.code), {
    subtitle: escapeHtml(company.name),
    actions: companyActiveBadge(company.is_active),
  })}
  ${companyFormFragment(company, user)}
  ${relatedSections}`;

  return page({
    user,
    current: "/companies",
    title: company.code,
    body,
    maxWidth: "720px",
    pageStyles: COMPANY_PAGE_STYLES,
  });
}

/** Styles for the related contacts/projects sections on the detail page. */
export const COMPANY_PAGE_STYLES = `
  .related-section { margin-top: var(--space-6); }
  .related-section__head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
  .related-section__title { font-family: var(--font-display); font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); letter-spacing: -0.01em; margin: 0; }
  .related-section__actions { display: inline-flex; gap: var(--space-2); flex-wrap: wrap; }
`;
