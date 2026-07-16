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
  textareaField,
  selectField,
  chipGroup,
  formActions,
  button,
  linkButton,
  statusMap,
  calendarRegion,
  type CalendarView,
} from "../../components/index.ts";
import { formatDateTime, formatTime } from "../../core/dates.ts";
import type { Page } from "../../core/repository.ts";
import type { Role } from "../../core/permissions.ts";
import { USER_ROLES } from "../users/users.rules.ts";
import type {
  Event,
  EventAssigneeUser,
  EventListRow,
  EventResponse,
  EventResponseRow,
  EventStatus,
} from "./events.db.ts";
import { EVENT_STATUSES } from "./events.rules.ts";

/** Localized labels + badge variants for the event lifecycle statuses. */
const STATUS = statusMap<EventStatus>({
  labels: {
    draft: "Borrador",
    scheduled: "Programado",
    done: "Realizado",
    cancelled: "Cancelado",
  },
  variants: {
    draft: "warning",
    scheduled: "info",
    done: "success",
    cancelled: "danger",
  },
  order: EVENT_STATUSES,
});
const STATUS_OPTIONS = STATUS.options;

const SCOPE_OPTIONS = [
  { value: "created", label: "Creados por mí" },
  { value: "assigned", label: "Asignados a mí" },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  sales: "Ventas",
  financial: "Finanzas",
  engineer: "Ingeniería",
  logistic: "Logística",
  member: "Miembro",
};

/** Accept / decline / pending (the implicit state before anyone replies). */
const RESPONSE = statusMap<EventResponse | "pending">({
  labels: {
    accepted: "Aceptado",
    declined: "Rechazado",
    pending: "Pendiente",
  },
  variants: {
    accepted: "success",
    declined: "danger",
    pending: "neutral",
  },
});

/** Only event-specific bits; surfaces, controls and buttons come from base styles. */
const PAGE_STYLES = `
  .event-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:var(--space-4); margin-bottom:var(--space-5); }
  .event-summary__item { display:flex; flex-direction:column; gap:2px; }
  .event-summary__label { font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--text-muted); }
  .event-desc { margin:0; white-space:pre-wrap; line-height:var(--line-height); }
  .event-people { display:flex; flex-wrap:wrap; gap:var(--space-2); }
  .event-section { margin-top:var(--space-5); }
  .event-section__title { font-size:var(--font-size-sm); font-weight:var(--font-weight-semibold); margin:0 0 var(--space-3); }
  .event-responses { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
  .event-responses li { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); font-size:var(--font-size-sm); }
  .event-response { display:flex; flex-wrap:wrap; align-items:center; gap:var(--space-3); }
  .response-actions { display:flex; flex-wrap:wrap; gap:var(--space-2); }
  .assignee-picker { display:flex; flex-direction:column; gap:var(--space-4); margin-bottom:var(--space-3); }
`;

function statusBadge(status: EventStatus): string {
  return STATUS.badge(status);
}

function responseBadge(response: EventResponse | "pending"): string {
  return RESPONSE.badge(response);
}

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

/** Compact when-label for the list: start, plus end time/date when present. */
function whenLabel(event: Event): string {
  const start = formatDateTime(event.start_at);
  if (!event.end_at) return start;
  return `${start} → ${formatDateTime(event.end_at)}`;
}

// --- List -------------------------------------------------------------------

/** Search text + filter selections that drive the events list. */
export interface EventFilters {
  q: string;
  status: string;
  scope: string;
}

/**
 * Column + search + filter + pagination config for the events list, shared by
 * the full page and the HTMX results fragment so both render identically.
 */
function eventsTableOptions(
  result: Page<EventListRow>,
  filters: EventFilters
): DataTableOptions<EventListRow> {
  const anyFilter = !!(filters.q || filters.status || filters.scope);
  return {
    id: "events",
    endpoint: "/events",
    columns: [
      {
        header: "Título",
        cell: (e) => escapeHtml(e.title),
        primary: true,
      },
      { header: "Cuándo", cell: (e) => escapeHtml(whenLabel(e)) },
      { header: "Estado", cell: (e) => statusBadge(e.status), width: "130px" },
      {
        header: "Asignados",
        cell: (e) => String(e.assignee_count),
        align: "right",
        width: "110px",
      },
      { header: "Creado por", cell: (e) => escapeHtml(e.created_by_email) },
    ],
    rows: result.rows,
    rowHref: (e) => `/events/${e.id}`,
    empty: anyFilter
      ? "Ningún evento coincide con los filtros."
      : "No hay eventos todavía.",
    search: { value: filters.q, placeholder: "Buscar por título o descripción..." },
    filters: [
      {
        name: "status",
        label: "Estado",
        value: filters.status,
        options: STATUS_OPTIONS,
        anyLabel: "Todos",
      },
      {
        name: "scope",
        label: "Ámbito",
        value: filters.scope,
        options: SCOPE_OPTIONS,
        anyLabel: "Todos los visibles",
      },
    ],
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  };
}

/** Full list page: a searchable, filterable, paginated table of events. */
export function eventsListPage(
  result: Page<EventListRow>,
  filters: EventFilters,
  user: User
): string {
  const body = `
  ${pageHeader("Eventos", {
    eyebrow: "Agenda",
    actions: `${linkButton({
      label: "Agenda",
      href: "/calendar",
      variant: "secondary",
    })} ${linkButton({ label: "+ Nuevo", href: "/events/new" })}`,
  })}
  ${dataTable(eventsTableOptions(result, filters))}`;

  return page({
    user,
    current: "/events",
    title: "Eventos",
    body,
    pageStyles: PAGE_STYLES,
  });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function eventsResults(
  result: Page<EventListRow>,
  filters: EventFilters
): string {
  return dataTableBody(eventsTableOptions(result, filters));
}

// --- Calendar ---------------------------------------------------------------

/** Everything the calendar page/fragment needs. */
export interface CalendarData {
  view: CalendarView;
  /** The day anchoring the visible period (local midnight). */
  anchor: Date;
  /** Visible events whose start falls inside the period, soonest first. */
  events: Event[];
}

/** Event-specific chip colors; the calendar's structural CSS lives in layout.ts. */
const CALENDAR_STYLES = `
  .cal-chip--draft { border-left-color:var(--warning); }
  .cal-chip--scheduled { border-left-color:var(--accent); }
  .cal-chip--done { border-left-color:var(--success); }
  .cal-chip--cancelled { border-left-color:var(--danger); text-decoration:line-through; opacity:0.7; }
`;

/** A compact, status-colored event chip linking to its detail page. */
function calChip(event: Event): string {
  const time = formatTime(event.start_at);
  const label = time ? `${time} · ${event.title}` : event.title;
  return `<a class="cal-chip cal-chip--${event.status}" href="/events/${
    event.id
  }" title="${escapeHtml(event.title)}">${escapeHtml(label)}</a>`;
}

/** The swappable calendar region (toolbar + grid) targeted by HTMX nav. */
export function eventsCalendarRegion(data: CalendarData): string {
  return calendarRegion<Event>({
    id: "events-calendar",
    endpoint: "/events/calendar",
    view: data.view,
    anchor: data.anchor,
    items: data.events,
    getDate: (e) => e.start_at,
    renderItem: calChip,
    dayHref: (iso) => `/events/new?date=${iso}`,
    dayTitle: "Nuevo evento",
  });
}

/** Full calendar page: header actions plus the swappable calendar region. */
export function eventsCalendarPage(user: User, data: CalendarData): string {
  const body = `
  ${pageHeader("Eventos", {
    eyebrow: "Agenda",
    actions: `${linkButton({
      label: "Lista",
      href: "/events",
      variant: "secondary",
    })} ${linkButton({ label: "+ Nuevo", href: "/events/new" })}`,
  })}
  ${eventsCalendarRegion(data)}`;

  return page({
    user,
    current: "/events",
    title: "Calendario de eventos",
    body,
    pageStyles: `${PAGE_STYLES}${CALENDAR_STYLES}`,
  });
}

// --- Create / edit form -----------------------------------------------------

/** The editable shape shared by the create and edit forms. */
export interface EventFormValues {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  status: EventStatus;
  assigneeUserIds: number[];
  assigneeRoles: string[];
}

export const EMPTY_EVENT_FORM: EventFormValues = {
  title: "",
  description: "",
  startAt: "",
  endAt: "",
  status: "draft",
  assigneeUserIds: [],
  assigneeRoles: [],
};

/** Two chip groups to tag users and/or roles on the event. */
function assigneePicker(
  userChoices: EventAssigneeUser[],
  selectedUserIds: number[],
  selectedRoles: string[]
): string {
  return `<div class="assignee-picker">
    ${chipGroup({
      legend: "Usuarios asignados",
      name: "assignee_user",
      options: userChoices.map((u) => ({ value: String(u.id), label: u.email })),
      values: selectedUserIds.map(String),
      empty: "No hay usuarios.",
    })}
    ${chipGroup({
      legend: "Roles asignados",
      name: "assignee_role",
      options: (USER_ROLES as readonly Role[]).map((r) => ({
        value: r,
        label: roleLabel(r),
      })),
      values: selectedRoles,
    })}
  </div>`;
}

/** The title/description/date/status fields + assignee pickers, shared by both forms. */
function eventFields(
  values: EventFormValues,
  errors: Record<string, string>,
  userChoices: EventAssigneeUser[]
): string {
  return `
    ${textField({
      name: "title",
      label: "Título",
      value: values.title,
      required: true,
      autocomplete: "off",
      attrs: 'maxlength="200"',
      error: errors.title,
    })}
    ${textareaField({
      name: "description",
      label: "Descripción",
      value: values.description,
      error: errors.description,
    })}
    ${textField({
      name: "start_at",
      label: "Inicio",
      type: "datetime-local",
      value: values.startAt,
      required: true,
      error: errors.start_at,
    })}
    ${textField({
      name: "end_at",
      label: "Fin",
      hint: "(opcional)",
      type: "datetime-local",
      value: values.endAt,
      error: errors.end_at,
    })}
    ${selectField({
      name: "status",
      label: "Estado",
      options: STATUS_OPTIONS,
      value: values.status,
      error: errors.status,
    })}
    ${assigneePicker(userChoices, values.assigneeUserIds, values.assigneeRoles)}`;
}

/** Create page with an empty (or error-repopulated) form. */
export function eventNewPage(
  user: User,
  userChoices: EventAssigneeUser[],
  values: EventFormValues = EMPTY_EVENT_FORM,
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${eventFields(values, errors, userChoices)}
    ${formActions(
      button({ label: "Crear" }),
      linkButton({ label: "Cancelar", href: "/events", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/events", "← Volver a eventos")}
  ${pageHeader("Nuevo evento")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/events"' })}`;

  return page({
    user,
    current: "/events",
    title: "Nuevo evento",
    body,
    maxWidth: "680px",
    pageStyles: PAGE_STYLES,
  });
}

/**
 * The edit form card, rendered as an HTMX swap target so validation errors
 * re-render just this fragment. On success the route sends an `HX-Redirect` to
 * the detail page.
 */
export function eventEditFormCard(
  event: Event,
  values: EventFormValues,
  userChoices: EventAssigneeUser[],
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${eventFields(values, errors, userChoices)}
    ${formActions(
      button({ label: "Guardar" }),
      linkButton({
        label: "Cancelar",
        href: `/events/${event.id}`,
        variant: "secondary",
      })
    )}`;
  return card(formBody, {
    as: "form",
    attrs: `id="event-form" hx-put="/events/${event.id}" hx-target="#event-form" hx-swap="outerHTML"`,
  });
}

/** Full edit page wrapping the editable form. */
export function eventEditPage(
  user: User,
  event: Event,
  values: EventFormValues,
  userChoices: EventAssigneeUser[],
  errors: Record<string, string> = {}
): string {
  const body = `
  ${backLink(`/events/${event.id}`, "← Volver al evento")}
  ${pageHeader("Editar evento")}
  ${eventEditFormCard(event, values, userChoices, errors)}`;

  return page({
    user,
    current: "/events",
    title: "Editar evento",
    body,
    maxWidth: "680px",
    pageStyles: PAGE_STYLES,
  });
}

// --- Detail -----------------------------------------------------------------

/** Everything the detail page needs beyond the event row itself. */
export interface EventDetailData {
  /** Email of the event's creator, for the header eyebrow. */
  createdByEmail: string;
  assigneeUsers: EventAssigneeUser[];
  assigneeRoles: string[];
  responses: EventResponseRow[];
  myResponse: EventResponse | null;
  /** The viewer is tagged (directly or by role) — may accept/decline. */
  isAssignee: boolean;
  /** The viewer may edit/delete (creator or assignee). */
  canEdit: boolean;
  /** Cross-listed tasks linked to this event (prebuilt HTML, may be ""). */
  tasksSection: string;
}

/** The accept/decline panel — an HTMX swap target re-rendered on each reply. */
export function eventResponsePanel(
  eventId: number,
  myResponse: EventResponse | null
): string {
  const current: EventResponse | "pending" = myResponse ?? "pending";
  const hx = (value: EventResponse) =>
    `hx-post="/events/${eventId}/response" hx-vals='{"response":"${value}"}' ` +
    `hx-target="#event-response" hx-swap="outerHTML"`;
  return `<div id="event-response" class="event-response">
    <span>Tu respuesta: ${responseBadge(current)}</span>
    <div class="response-actions">
      ${button({
        label: "Aceptar",
        variant: myResponse === "accepted" ? "primary" : "secondary",
        size: "sm",
        type: "button",
        attrs: hx("accepted"),
      })}
      ${button({
        label: "Rechazar",
        variant: myResponse === "declined" ? "danger" : "secondary",
        size: "sm",
        type: "button",
        attrs: hx("declined"),
      })}
    </div>
  </div>`;
}

function peopleChips(users: EventAssigneeUser[], roles: string[]): string {
  if (users.length === 0 && roles.length === 0) {
    return `<span class="muted">Sin asignados.</span>`;
  }
  const userBadges = users.map((u) => badge(escapeHtml(u.email), "neutral"));
  const roleBadges = roles.map((r) => badge(roleLabel(r), "info"));
  return `<div class="event-people">${[...userBadges, ...roleBadges].join(
    " "
  )}</div>`;
}

/** Roster of other people's replies (the viewer's own reply lives in the panel). */
function responsesRoster(
  responses: EventResponseRow[],
  viewerId: number
): string {
  const others = responses.filter((r) => r.user_id !== viewerId);
  if (others.length === 0) {
    return `<p class="muted">Nadie más ha respondido todavía.</p>`;
  }
  const items = others
    .map(
      (r) =>
        `<li><span>${escapeHtml(r.email)}</span>${responseBadge(
          r.response
        )}</li>`
    )
    .join("");
  return `<ul class="event-responses">${items}</ul>`;
}

/** Full detail page: summary, assignees, personal response, and edit controls. */
export function eventDetailPage(
  user: User,
  event: Event,
  data: EventDetailData
): string {
  const editActions = data.canEdit
    ? [
        linkButton({ label: "Editar", href: `/events/${event.id}/edit` }),
        button({
          label: "Eliminar",
          variant: "danger",
          type: "button",
          attrs: `hx-delete="/events/${event.id}" hx-confirm="¿Eliminar este evento?"`,
        }),
      ]
    : [];

  const summary = `
  <div class="event-summary">
    <div class="event-summary__item">
      <span class="event-summary__label">Inicio</span>
      <span>${escapeHtml(formatDateTime(event.start_at))}</span>
    </div>
    <div class="event-summary__item">
      <span class="event-summary__label">Fin</span>
      <span>${escapeHtml(formatDateTime(event.end_at))}</span>
    </div>
    <div class="event-summary__item">
      <span class="event-summary__label">Estado</span>
      <span>${statusBadge(event.status)}</span>
    </div>
  </div>`;

  const description = event.description
    ? `<p class="event-desc">${escapeHtml(event.description)}</p>`
    : `<p class="muted">Sin descripción.</p>`;

  const responsePanel = data.isAssignee
    ? `<div class="event-section">
        <h2 class="event-section__title">Tu asistencia</h2>
        ${eventResponsePanel(event.id, data.myResponse)}
      </div>`
    : "";

  const cardBody = `
    ${summary}
    ${description}
    <div class="event-section">
      <h2 class="event-section__title">Asignados</h2>
      ${peopleChips(data.assigneeUsers, data.assigneeRoles)}
    </div>
    ${data.tasksSection}
    ${responsePanel}
    <div class="event-section">
      <h2 class="event-section__title">Respuestas</h2>
      ${responsesRoster(data.responses, user.id)}
    </div>
    ${
      editActions.length
        ? `<div class="event-section">${formActions(...editActions)}</div>`
        : ""
    }`;

  const body = `
  ${backLink("/events", "← Volver a eventos")}
  ${pageHeader(escapeHtml(event.title), {
    eyebrow: `Creado por ${escapeHtml(data.createdByEmail)}`,
    actions: statusBadge(event.status),
  })}
  ${card(cardBody)}`;

  return page({
    user,
    current: "/events",
    title: event.title,
    body,
    maxWidth: "680px",
    pageStyles: PAGE_STYLES,
  });
}
