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
import type { Contact, ContactListRow } from "./contacts.db.ts";
import { CONTACTS_MODULE } from "./contacts.rules.ts";

const BOOL_OPTIONS = [
  { value: "1", label: "Activo" },
  { value: "0", label: "Archivado" },
];

/** The "— Sin compañía —" choice prepended to the company select. */
const NO_COMPANY: SelectOption = { value: "", label: "— Sin compañía —" };

interface FormValues {
  name: string;
  title: string;
  email: string;
  phone: string;
  companyId: string;
  isActive: boolean;
  notes: string;
}

function contactActiveBadge(isActive: number): string {
  return isActive ? badge("Activo", "success") : badge("Archivado", "neutral");
}

/** The shared fields used by the create and edit forms. */
function contactFields(
  values: FormValues,
  errors: Record<string, string>,
  editable: boolean,
  companyOptions: SelectOption[]
): string {
  return `
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
      name: "title",
      label: "Cargo",
      value: values.title,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="80"',
      error: errors.title,
    })}
    ${selectField({
      name: "company_id",
      label: "Compañía",
      options: [NO_COMPANY, ...companyOptions],
      value: values.companyId,
      disabled: !editable,
      error: errors.company_id,
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
    ${textField({
      name: "phone",
      label: "Teléfono",
      value: values.phone,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="40"',
      error: errors.phone,
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

/** Search text + filter selections that drive the contacts list. */
export interface ContactFilters {
  q: string;
  active: string;
  company: string;
}

function contactsTableOptions(
  result: Page<ContactListRow>,
  filters: ContactFilters,
  companyOptions: SelectOption[]
): DataTableOptions<ContactListRow> {
  const anyFilter = !!(filters.q || filters.active || filters.company);
  return {
    id: "contacts",
    endpoint: "/contacts",
    columns: [
      { header: "Nombre", cell: (c) => escapeHtml(c.name), primary: true },
      { header: "Cargo", cell: (c) => (c.title ? escapeHtml(c.title) : "—") },
      {
        header: "Compañía",
        cell: (c) => (c.company_name ? escapeHtml(c.company_name) : "—"),
      },
      { header: "Correo", cell: (c) => (c.email ? escapeHtml(c.email) : "—") },
      {
        header: "Estado",
        cell: (c) => contactActiveBadge(c.is_active),
        width: "120px",
      },
    ],
    rows: result.rows,
    rowHref: (c) => `/contacts/${c.id}`,
    empty: anyFilter
      ? "Ningún contacto coincide con los filtros."
      : "No hay contactos todavía.",
    search: { value: filters.q, placeholder: "Buscar nombre, correo o teléfono..." },
    filters: [
      {
        name: "company",
        label: "Compañía",
        value: filters.company,
        options: companyOptions,
        anyLabel: "Todas",
      },
      {
        name: "active",
        label: "Estado",
        value: filters.active,
        options: BOOL_OPTIONS,
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

/** Full list page: a searchable, filterable, paginated table of contacts. */
export function contactsListPage(
  result: Page<ContactListRow>,
  filters: ContactFilters,
  companyOptions: SelectOption[],
  user: User
): string {
  const actions = can(user, CONTACTS_MODULE, "create")
    ? linkButton({ label: "+ Nuevo", href: "/contacts/new" })
    : "";

  const body = `
  ${pageHeader("Contactos", { eyebrow: "CRM", actions })}
  ${dataTable(contactsTableOptions(result, filters, companyOptions))}`;

  return page({ user, current: "/contacts", title: "Contactos", body });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function contactsResults(
  result: Page<ContactListRow>,
  filters: ContactFilters,
  companyOptions: SelectOption[]
): string {
  return dataTableBody(contactsTableOptions(result, filters, companyOptions));
}

const EMPTY_VALUES: FormValues = {
  name: "",
  title: "",
  email: "",
  phone: "",
  companyId: "",
  isActive: true,
  notes: "",
};

/** Create page with an empty (or error-repopulated) form. */
export function contactNewPage(
  user: User,
  companyOptions: SelectOption[],
  values: FormValues = EMPTY_VALUES,
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${contactFields(values, errors, true, companyOptions)}
    ${formActions(
      button({ label: "Crear" }),
      linkButton({ label: "Cancelar", href: "/contacts", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/contacts", "← Volver a contactos")}
  ${pageHeader("Nuevo contacto")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/contacts"' })}`;

  return page({
    user,
    current: "/contacts",
    title: "Nuevo contacto",
    body,
    maxWidth: "620px",
  });
}

/**
 * The editable detail form, rendered standalone as an HTMX swap target so that
 * updates re-render just this fragment.
 */
export function contactFormFragment(
  contact: Contact,
  user: User,
  companyOptions: SelectOption[],
  opts: { errors?: Record<string, string>; saved?: boolean } = {}
): string {
  const canUpdate = can(user, CONTACTS_MODULE, "update");
  const values: FormValues = {
    name: contact.name,
    title: contact.title,
    email: contact.email,
    phone: contact.phone,
    companyId: contact.company_id ? String(contact.company_id) : "",
    isActive: contact.is_active === 1,
    notes: contact.notes,
  };
  const errors = opts.errors ?? {};

  const saveBtn = canUpdate ? button({ label: "Guardar" }) : "";
  const savedMsg = savedIndicator(!!opts.saved);
  const readonlyNote = readOnlyNote(canUpdate);

  const formBody = `
    ${readonlyNote}
    ${contactFields(values, errors, canUpdate, companyOptions)}
    ${formActions(saveBtn, savedMsg)}`;

  return card(formBody, {
    as: "form",
    attrs: `id="contact-form" hx-put="/contacts/${contact.id}" hx-target="#contact-form" hx-swap="outerHTML"`,
  });
}

/** Full detail page wrapping the editable form. */
export function contactDetailPage(
  contact: Contact,
  companyName: string | null,
  user: User,
  companyOptions: SelectOption[]
): string {
  const subtitle = companyName
    ? escapeHtml(companyName)
    : contact.title
      ? escapeHtml(contact.title)
      : "Sin compañía";
  const body = `
  ${backLink("/contacts", "← Volver a contactos")}
  ${pageHeader(escapeHtml(contact.name), {
    subtitle,
    actions: contactActiveBadge(contact.is_active),
  })}
  ${contactFormFragment(contact, user, companyOptions)}`;

  return page({
    user,
    current: "/contacts",
    title: contact.name,
    body,
    maxWidth: "620px",
  });
}
