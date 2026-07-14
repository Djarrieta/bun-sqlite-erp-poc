import type { User } from "../auth/auth.db.ts";
import {
  escapeHtml,
  badge,
  type BadgeVariant,
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
} from "../../components/index.ts";
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
import {
  type CalendarView,
  WEEKDAY_LABELS,
  agendaDayLabel,
  groupByDay,
  isSameMonth,
  monthGrid,
  monthTitle,
  nextAnchor,
  prevAnchor,
  toISODate,
  weekDays,
  weekTitle,
} from "./events.calendar.ts";

const STATUS_VARIANT: Record<EventStatus, BadgeVariant> = {
  draft: "warning",
  scheduled: "info",
  done: "success",
  cancelled: "danger",
};

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  done: "Realizado",
  cancelled: "Cancelado",
};

const STATUS_OPTIONS = EVENT_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

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

const RESPONSE_VARIANT: Record<string, BadgeVariant> = {
  accepted: "success",
  declined: "danger",
  pending: "neutral",
};

const RESPONSE_LABEL: Record<string, string> = {
  accepted: "Aceptado",
  declined: "Rechazado",
  pending: "Pendiente",
};

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
  return badge(STATUS_LABEL[status] ?? status, STATUS_VARIANT[status] ?? "neutral");
}

function responseBadge(response: EventResponse | "pending"): string {
  return badge(
    RESPONSE_LABEL[response] ?? response,
    RESPONSE_VARIANT[response] ?? "neutral"
  );
}

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

/** Render a stored datetime ("2026-07-14T09:30") as "2026-07-14 · 09:30". */
function formatDateTime(value: string): string {
  if (!value) return "—";
  const [date, time = ""] = value.split("T");
  const hm = time.slice(0, 5);
  return hm ? `${date} · ${hm}` : date;
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
      label: "Calendario",
      href: "/events/calendar",
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

/** Calendar-only styles; all values come from theme tokens. */
const CALENDAR_STYLES = `
  .cal-toolbar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:var(--space-3); margin-bottom:var(--space-4); }
  .cal-nav, .cal-views { display:flex; gap:var(--space-2); }
  .cal-title { flex:1 1 auto; text-align:center; margin:0; font-size:var(--font-size-lg); font-weight:var(--font-weight-semibold); letter-spacing:-0.01em; }

  .cal-weekdays { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--space-1); margin-bottom:var(--space-1); }
  .cal-weekday { text-align:center; padding:var(--space-1) 0; font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--text-muted); }

  .cal-days { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--space-1); }
  .cal-cell { display:flex; flex-direction:column; gap:var(--space-1); min-width:0; min-height:6.5rem; padding:var(--space-1); border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); }
  .cal-cell--muted { background:var(--surface-sunken); }
  .cal-cell--today { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
  .cal-cell__head { display:flex; justify-content:flex-end; }
  .cal-daynum { display:inline-flex; align-items:center; justify-content:center; width:1.6rem; height:1.6rem; border-radius:var(--radius-full); font-size:var(--font-size-xs); font-weight:var(--font-weight-medium); color:var(--text); text-decoration:none; }
  .cal-daynum:hover { background:var(--surface-raised); }
  .cal-cell--muted .cal-daynum { color:var(--text-muted); }
  .cal-cell--today .cal-daynum { background:var(--accent); color:var(--on-accent); }
  .cal-cell__events { display:flex; flex-direction:column; gap:2px; min-width:0; overflow:hidden; }

  .cal-chip { display:block; overflow:hidden; padding:2px var(--space-1); border-left:3px solid var(--border-strong); border-radius:var(--radius-sm); background:var(--surface-sunken); color:var(--text); font-size:var(--font-size-2xs); line-height:1.35; text-decoration:none; white-space:nowrap; text-overflow:ellipsis; }
  .cal-chip:hover { background:var(--surface-raised); }
  .cal-chip--draft { border-left-color:var(--warning); }
  .cal-chip--scheduled { border-left-color:var(--accent); }
  .cal-chip--done { border-left-color:var(--success); }
  .cal-chip--cancelled { border-left-color:var(--danger); text-decoration:line-through; opacity:0.7; }
  .cal-more { padding:0 var(--space-1); color:var(--text-muted); font-size:var(--font-size-2xs); text-decoration:none; }
  .cal-more:hover { color:var(--text); }

  .cal-week { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:var(--space-2); }
  .cal-daycol { display:flex; flex-direction:column; min-width:0; min-height:8rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  .cal-daycol--today { border-color:var(--accent); }
  .cal-daycol__head { display:block; padding:var(--space-2); text-align:center; background:var(--surface-sunken); border-bottom:1px solid var(--border); color:var(--text); font-size:var(--font-size-xs); font-weight:var(--font-weight-medium); text-decoration:none; }
  .cal-daycol__head:hover { background:var(--surface-raised); }
  .cal-daycol--today .cal-daycol__head { background:var(--accent); color:var(--on-accent); }
  .cal-daycol__events { display:flex; flex-direction:column; gap:var(--space-1); padding:var(--space-2); }
  .cal-week .cal-chip { white-space:normal; }
  .cal-empty { padding:var(--space-2); text-align:center; color:var(--text-muted); text-decoration:none; border:1px dashed var(--border); border-radius:var(--radius); }
  .cal-empty:hover { color:var(--text); border-color:var(--text-muted); }

  /* Agenda: a chronological list of days-with-events, used on small screens
     instead of the cramped 7-column month grid. Hidden on wide screens. */
  .cal-agenda { display:none; }
  .cal-agenda__day { border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); overflow:hidden; }
  .cal-agenda__day--today { border-color:var(--accent); }
  .cal-agenda__head { display:block; padding:var(--space-2) var(--space-3); background:var(--surface-sunken); border-bottom:1px solid var(--border); color:var(--text); font-size:var(--font-size-sm); font-weight:var(--font-weight-medium); text-decoration:none; }
  .cal-agenda__head:hover { background:var(--surface-raised); }
  .cal-agenda__day--today .cal-agenda__head { background:var(--accent); color:var(--on-accent); }
  .cal-agenda__events { display:flex; flex-direction:column; gap:var(--space-1); padding:var(--space-2) var(--space-3); }
  .cal-agenda .cal-chip { white-space:normal; }

  @media (max-width: 860px) {
    .cal-title { order:-1; flex-basis:100%; }
  }
  @media (max-width: 640px) {
    /* Month: swap the 7-column grid for the full-width agenda (no truncation). */
    .cal-weekdays, .cal-days { display:none; }
    .cal-agenda { display:flex; flex-direction:column; gap:var(--space-2); }
    /* Week: stack day columns into full-width blocks. */
    .cal-week { grid-template-columns:1fr; }
  }
`;

/** Extract the "HH:MM" from a stored `YYYY-MM-DDTHH:MM` start value. */
function eventTime(value: string): string {
  return (value.split("T")[1] ?? "").slice(0, 5);
}

/** A compact, status-colored event chip linking to its detail page. */
function calChip(event: Event): string {
  const time = eventTime(event.start_at);
  const label = time ? `${time} · ${event.title}` : event.title;
  return `<a class="cal-chip cal-chip--${event.status}" href="/events/${
    event.id
  }" title="${escapeHtml(event.title)}">${escapeHtml(label)}</a>`;
}

/** Month grid: weekday headers + a 6×7 grid of day cells with event chips. */
function renderMonth(anchor: Date, events: Event[]): string {
  const weeks = monthGrid(anchor);
  const byDay = groupByDay(events);
  const today = toISODate(new Date());

  const headers = WEEKDAY_LABELS.map(
    (l) => `<div class="cal-weekday">${l}</div>`
  ).join("");

  const cells = weeks
    .flat()
    .map((day) => {
      const iso = toISODate(day);
      const dayEvents = byDay.get(iso) ?? [];
      const cls = [
        "cal-cell",
        isSameMonth(day, anchor) ? "" : "cal-cell--muted",
        iso === today ? "cal-cell--today" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const shown = dayEvents.slice(0, 3).map(calChip).join("");
      const extra =
        dayEvents.length > 3
          ? `<a class="cal-more" href="/events/calendar?view=week&date=${iso}">+${
              dayEvents.length - 3
            } más</a>`
          : "";
      return `<div class="${cls}">
        <div class="cal-cell__head">
          <a class="cal-daynum" href="/events/new?date=${iso}" title="Nuevo evento">${day.getDate()}</a>
        </div>
        <div class="cal-cell__events">${shown}${extra}</div>
      </div>`;
    })
    .join("");

  return `<div class="cal-weekdays">${headers}</div>
    <div class="cal-days">${cells}</div>
    ${renderMonthAgenda(anchor, events)}`;
}

/**
 * Mobile month layout: a chronological agenda of the visible days that have
 * events (full width, no truncation). Hidden on wide screens via CSS; shown in
 * place of the grid below 640px. Grid days are already in chronological order.
 */
function renderMonthAgenda(anchor: Date, events: Event[]): string {
  const byDay = groupByDay(events);
  const today = toISODate(new Date());
  const days = monthGrid(anchor)
    .flat()
    .filter((day) => byDay.has(toISODate(day)));

  const inner = days.length
    ? days
        .map((day) => {
          const iso = toISODate(day);
          const dayEvents = byDay.get(iso) ?? [];
          const cls =
            iso === today
              ? "cal-agenda__day cal-agenda__day--today"
              : "cal-agenda__day";
          return `<div class="${cls}">
        <a class="cal-agenda__head" href="/events/new?date=${iso}" title="Nuevo evento">${agendaDayLabel(
            day
          )}</a>
        <div class="cal-agenda__events">${dayEvents.map(calChip).join("")}</div>
      </div>`;
        })
        .join("")
    : `<p class="muted">No hay eventos este mes.</p>`;

  return `<div class="cal-agenda">${inner}</div>`;
}

/** Week grid: seven day columns, each listing that day's events. */
function renderWeek(anchor: Date, events: Event[]): string {
  const days = weekDays(anchor);
  const byDay = groupByDay(events);
  const today = toISODate(new Date());

  const cols = days
    .map((day, i) => {
      const iso = toISODate(day);
      const dayEvents = byDay.get(iso) ?? [];
      const cls = iso === today ? "cal-daycol cal-daycol--today" : "cal-daycol";
      const list = dayEvents.length
        ? dayEvents.map(calChip).join("")
        : `<a class="cal-empty" href="/events/new?date=${iso}" title="Nuevo evento">+</a>`;
      return `<div class="${cls}">
        <a class="cal-daycol__head" href="/events/new?date=${iso}" title="Nuevo evento">${
        WEEKDAY_LABELS[i]
      } ${day.getDate()}</a>
        <div class="cal-daycol__events">${list}</div>
      </div>`;
    })
    .join("");

  return `<div class="cal-week">${cols}</div>`;
}

/** The toolbar: prev/today/next, the period title, and the Mes/Semana toggle. */
function calendarToolbar(view: CalendarView, anchor: Date): string {
  const title =
    view === "week" ? weekTitle(weekDays(anchor)) : monthTitle(anchor);
  const todayISO = toISODate(new Date());
  const anchorISO = toISODate(anchor);

  const navBtn = (date: string, label: string, aria: string): string =>
    `<button type="button" class="btn btn--secondary btn--sm" aria-label="${aria}"
      hx-get="/events/calendar?view=${view}&date=${date}" hx-target="#events-calendar"
      hx-swap="outerHTML" hx-push-url="true">${label}</button>`;

  const viewBtn = (v: CalendarView, label: string): string =>
    `<button type="button" class="btn ${
      v === view ? "btn--primary" : "btn--secondary"
    } btn--sm" hx-get="/events/calendar?view=${v}&date=${anchorISO}"
      hx-target="#events-calendar" hx-swap="outerHTML" hx-push-url="true">${label}</button>`;

  return `<div class="cal-toolbar">
    <div class="cal-nav">
      ${navBtn(prevAnchor(view, anchor), "←", "Anterior")}
      ${navBtn(todayISO, "Hoy", "Hoy")}
      ${navBtn(nextAnchor(view, anchor), "→", "Siguiente")}
    </div>
    <h2 class="cal-title">${escapeHtml(title)}</h2>
    <div class="cal-views">
      ${viewBtn("month", "Mes")}
      ${viewBtn("week", "Semana")}
    </div>
  </div>`;
}

/** The swappable calendar region (toolbar + grid) targeted by HTMX nav. */
export function eventsCalendarRegion(data: CalendarData): string {
  const grid =
    data.view === "week"
      ? renderWeek(data.anchor, data.events)
      : renderMonth(data.anchor, data.events);
  return `<div id="events-calendar" class="cal-region">
    ${calendarToolbar(data.view, data.anchor)}
    ${grid}
  </div>`;
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

/** A checkbox "chip" reusing the global data-chip styles from the toolbar filters. */
function chip(
  name: string,
  value: string,
  label: string,
  checked: boolean
): string {
  return `<label class="data-chip">
    <input type="checkbox" name="${name}" value="${escapeHtml(value)}"${
    checked ? " checked" : ""
  } />
    <span>${escapeHtml(label)}</span>
  </label>`;
}

/** Two chip groups to tag users and/or roles on the event. */
function assigneePicker(
  userChoices: EventAssigneeUser[],
  selectedUserIds: number[],
  selectedRoles: string[]
): string {
  const users = new Set(selectedUserIds);
  const roles = new Set(selectedRoles);
  const userChips = userChoices.length
    ? userChoices
        .map((u) => chip("assignee_user", String(u.id), u.email, users.has(u.id)))
        .join("")
    : `<span class="muted">No hay usuarios.</span>`;
  const roleChips = (USER_ROLES as readonly Role[])
    .map((r) => chip("assignee_role", r, roleLabel(r), roles.has(r)))
    .join("");
  return `<div class="assignee-picker">
    <fieldset class="data-filter__group">
      <legend class="field__label">Usuarios asignados</legend>
      <div class="data-chips">${userChips}</div>
    </fieldset>
    <fieldset class="data-filter__group">
      <legend class="field__label">Roles asignados</legend>
      <div class="data-chips">${roleChips}</div>
    </fieldset>
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

/** A labelled `<textarea>` (no shared component exists for multi-line text). */
function textareaField(opts: {
  name: string;
  label: string;
  value: string;
  error?: string;
}): string {
  const err = opts.error
    ? `<span class="field__error">${escapeHtml(opts.error)}</span>`
    : "";
  return `<div class="field">
    <label class="field__label" for="${opts.name}">${escapeHtml(opts.label)}</label>
    <textarea id="${opts.name}" name="${opts.name}" rows="4">${escapeHtml(
    opts.value
  )}</textarea>
    ${err}
  </div>`;
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
