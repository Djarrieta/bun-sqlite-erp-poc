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
  Task,
  TaskAssigneeUser,
  TaskListRow,
  TaskPriority,
  TaskResponse,
  TaskResponseRow,
  TaskStatus,
} from "./tasks.db.ts";
import { TASK_PRIORITIES, TASK_STATUSES } from "./tasks.rules.ts";

/** Localized labels + badge variants for the task lifecycle statuses. */
const STATUS = statusMap<TaskStatus>({
  labels: {
    pending: "Pendiente",
    in_progress: "En progreso",
    done: "Hecha",
    cancelled: "Cancelada",
  },
  variants: {
    pending: "neutral",
    in_progress: "info",
    done: "success",
    cancelled: "danger",
  },
  order: TASK_STATUSES,
});
const STATUS_OPTIONS = STATUS.options;

const PRIORITY = statusMap<TaskPriority>({
  labels: { low: "Baja", medium: "Media", high: "Alta" },
  variants: { low: "neutral", medium: "info", high: "warning" },
  order: TASK_PRIORITIES,
});
const PRIORITY_OPTIONS = PRIORITY.options;

const SCOPE_OPTIONS = [
  { value: "created", label: "Creadas por mí" },
  { value: "assigned", label: "Asignadas a mí" },
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
const RESPONSE = statusMap<TaskResponse | "pending">({
  labels: { accepted: "Aceptada", declined: "Rechazada", pending: "Pendiente" },
  variants: { accepted: "success", declined: "danger", pending: "neutral" },
});

/** Only task-specific bits; surfaces, controls and buttons come from base styles. */
const PAGE_STYLES = `
  .task-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:var(--space-4); margin-bottom:var(--space-5); }
  .task-summary__item { display:flex; flex-direction:column; gap:2px; }
  .task-summary__label { font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--text-muted); }
  .task-desc { margin:0; white-space:pre-wrap; line-height:var(--line-height); }
  .task-people { display:flex; flex-wrap:wrap; gap:var(--space-2); }
  .task-section { margin-top:var(--space-5); }
  .task-section__title { font-size:var(--font-size-sm); font-weight:var(--font-weight-semibold); margin:0 0 var(--space-3); }
  .task-responses { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:var(--space-2); }
  .task-responses li { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); font-size:var(--font-size-sm); }
  .task-response { display:flex; flex-wrap:wrap; align-items:center; gap:var(--space-3); }
  .response-actions { display:flex; flex-wrap:wrap; gap:var(--space-2); }
  .assignee-picker { display:flex; flex-direction:column; gap:var(--space-4); margin-bottom:var(--space-3); }
`;

/** Task-specific calendar chip colors; structural CSS lives in layout.ts. */
const CALENDAR_STYLES = `
  .cal-chip--pending { border-left-color:var(--border-strong); }
  .cal-chip--in_progress { border-left-color:var(--accent); }
  .cal-chip--done { border-left-color:var(--success); }
  .cal-chip--cancelled { border-left-color:var(--danger); text-decoration:line-through; opacity:0.7; }
`;

export function taskStatusBadge(status: TaskStatus): string {
  return STATUS.badge(status);
}
export function taskPriorityBadge(priority: TaskPriority): string {
  return PRIORITY.badge(priority);
}
function responseBadge(response: TaskResponse | "pending"): string {
  return RESPONSE.badge(response);
}
function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

/** Compact "inicio → fin" (or a single date) label for the list + detail. */
export function taskWhenLabel(task: { start_at: string; end_at: string }): string {
  const start = task.start_at ? formatDateTime(task.start_at) : "";
  const end = task.end_at ? formatDateTime(task.end_at) : "";
  if (start && end) return `${start} → ${end}`;
  if (start) return start;
  if (end) return end;
  return "—";
}

// --- List -------------------------------------------------------------------

/** Search text + filter selections that drive the tasks list. */
export interface TaskFilters {
  q: string;
  status: string;
  priority: string;
  scope: string;
}

function tasksTableOptions(
  result: Page<TaskListRow>,
  filters: TaskFilters
): DataTableOptions<TaskListRow> {
  const anyFilter = !!(
    filters.q ||
    filters.status ||
    filters.priority ||
    filters.scope
  );
  return {
    id: "tasks",
    endpoint: "/tasks",
    columns: [
      { header: "Título", cell: (t) => escapeHtml(t.title), primary: true },
      { header: "Cuándo", cell: (t) => escapeHtml(taskWhenLabel(t)) },
      {
        header: "Estado",
        cell: (t) => taskStatusBadge(t.status),
        width: "130px",
      },
      {
        header: "Prioridad",
        cell: (t) => taskPriorityBadge(t.priority),
        width: "110px",
      },
      {
        header: "Asignados",
        cell: (t) => String(t.assignee_count),
        align: "right",
        width: "110px",
      },
      { header: "Creada por", cell: (t) => escapeHtml(t.created_by_email) },
    ],
    rows: result.rows,
    rowHref: (t) => `/tasks/${t.id}`,
    empty: anyFilter
      ? "Ninguna tarea coincide con los filtros."
      : "No hay tareas todavía.",
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
        name: "priority",
        label: "Prioridad",
        value: filters.priority,
        options: PRIORITY_OPTIONS,
        anyLabel: "Todas",
      },
      {
        name: "scope",
        label: "Ámbito",
        value: filters.scope,
        options: SCOPE_OPTIONS,
        anyLabel: "Todas las visibles",
      },
    ],
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  };
}

/** Full list page: a searchable, filterable, paginated table of tasks. */
export function tasksListPage(
  result: Page<TaskListRow>,
  filters: TaskFilters,
  user: User
): string {
  const body = `
  ${pageHeader("Tareas", {
    eyebrow: "Trabajo",
    actions: `${linkButton({
      label: "Calendario",
      href: "/tasks/calendar",
      variant: "secondary",
    })} ${linkButton({ label: "+ Nueva", href: "/tasks/new" })}`,
  })}
  ${dataTable(tasksTableOptions(result, filters))}`;

  return page({
    user,
    current: "/tasks",
    title: "Tareas",
    body,
    pageStyles: PAGE_STYLES,
  });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function tasksResults(
  result: Page<TaskListRow>,
  filters: TaskFilters
): string {
  return dataTableBody(tasksTableOptions(result, filters));
}

// --- Calendar ---------------------------------------------------------------

/** Everything the calendar page/fragment needs. */
export interface CalendarData {
  view: CalendarView;
  /** The day anchoring the visible period (local midnight). */
  anchor: Date;
  /** Visible dated tasks whose start/end falls inside the period. */
  tasks: Task[];
}

/** A compact, status-colored task chip linking to its detail page. */
function calChip(task: Task): string {
  const when = task.start_at || task.end_at;
  const time = when ? formatTime(when) : "";
  const label = time ? `${time} · ${task.title}` : task.title;
  return `<a class="cal-chip cal-chip--${task.status}" href="/tasks/${
    task.id
  }" title="${escapeHtml(task.title)}">${escapeHtml(label)}</a>`;
}

/** The swappable calendar region (toolbar + grid) targeted by HTMX nav. */
export function tasksCalendarRegion(data: CalendarData): string {
  return calendarRegion<Task>({
    id: "tasks-calendar",
    endpoint: "/tasks/calendar",
    view: data.view,
    anchor: data.anchor,
    items: data.tasks,
    getDate: (t) => t.start_at || t.end_at,
    renderItem: calChip,
    dayHref: (iso) => `/tasks/new?date=${iso}`,
    dayTitle: "Nueva tarea",
    labels: { agendaEmpty: "No hay tareas en este periodo." },
  });
}

/** Full calendar page: header actions plus the swappable calendar region. */
export function tasksCalendarPage(user: User, data: CalendarData): string {
  const body = `
  ${pageHeader("Tareas", {
    eyebrow: "Calendario",
    actions: `${linkButton({
      label: "Lista",
      href: "/tasks",
      variant: "secondary",
    })} ${linkButton({ label: "+ Nueva", href: "/tasks/new" })}`,
  })}
  ${tasksCalendarRegion(data)}`;

  return page({
    user,
    current: "/tasks",
    title: "Calendario de tareas",
    body,
    pageStyles: `${PAGE_STYLES}${CALENDAR_STYLES}`,
  });
}

// --- Create / edit form -----------------------------------------------------

/** The editable shape shared by the create and edit forms. */
export interface TaskFormValues {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  startAt: string;
  endAt: string;
  assigneeUserIds: number[];
  assigneeRoles: string[];
}

export const EMPTY_TASK_FORM: TaskFormValues = {
  title: "",
  description: "",
  status: "pending",
  priority: "medium",
  startAt: "",
  endAt: "",
  assigneeUserIds: [],
  assigneeRoles: [],
};

/** Two chip groups to tag users and/or roles on the task. */
function assigneePicker(
  userChoices: TaskAssigneeUser[],
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

/** The title/description/date/status/priority fields + assignee pickers. */
function taskFields(
  values: TaskFormValues,
  errors: Record<string, string>,
  userChoices: TaskAssigneeUser[]
): string {
  return `
    ${textField({
      name: "title",
      label: "Título",
      value: values.title,
      required: true,
      autocomplete: "off",
      attrs: 'maxlength="160"',
      error: errors.title,
    })}
    ${textareaField({
      name: "description",
      label: "Descripción",
      value: values.description,
      attrs: 'maxlength="2000"',
      error: errors.description,
    })}
    ${textField({
      name: "start_at",
      label: "Inicio",
      hint: "(opcional)",
      type: "datetime-local",
      value: values.startAt,
      error: errors.start_at,
    })}
    ${textField({
      name: "end_at",
      label: "Fin / límite",
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
    ${selectField({
      name: "priority",
      label: "Prioridad",
      options: PRIORITY_OPTIONS,
      value: values.priority,
      error: errors.priority,
    })}
    ${assigneePicker(userChoices, values.assigneeUserIds, values.assigneeRoles)}`;
}

/** Create page with an empty (or error-repopulated) form. */
export function taskNewPage(
  user: User,
  userChoices: TaskAssigneeUser[],
  values: TaskFormValues = EMPTY_TASK_FORM,
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${taskFields(values, errors, userChoices)}
    ${formActions(
      button({ label: "Crear" }),
      linkButton({ label: "Cancelar", href: "/tasks", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/tasks", "← Volver a tareas")}
  ${pageHeader("Nueva tarea")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/tasks"' })}`;

  return page({
    user,
    current: "/tasks",
    title: "Nueva tarea",
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
export function taskEditFormCard(
  task: Task,
  values: TaskFormValues,
  userChoices: TaskAssigneeUser[],
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${taskFields(values, errors, userChoices)}
    ${formActions(
      button({ label: "Guardar" }),
      linkButton({
        label: "Cancelar",
        href: `/tasks/${task.id}`,
        variant: "secondary",
      })
    )}`;
  return card(formBody, {
    as: "form",
    attrs: `id="task-form" hx-put="/tasks/${task.id}" hx-target="#task-form" hx-swap="outerHTML"`,
  });
}

/** Full edit page wrapping the editable form. */
export function taskEditPage(
  user: User,
  task: Task,
  values: TaskFormValues,
  userChoices: TaskAssigneeUser[],
  errors: Record<string, string> = {}
): string {
  const body = `
  ${backLink(`/tasks/${task.id}`, "← Volver a la tarea")}
  ${pageHeader("Editar tarea")}
  ${taskEditFormCard(task, values, userChoices, errors)}`;

  return page({
    user,
    current: "/tasks",
    title: "Editar tarea",
    body,
    maxWidth: "680px",
    pageStyles: PAGE_STYLES,
  });
}

// --- Detail -----------------------------------------------------------------

/** Everything the detail page needs beyond the task row itself. */
export interface TaskDetailData {
  /** Email of the task's creator, for the header eyebrow. */
  createdByEmail: string;
  assigneeUsers: TaskAssigneeUser[];
  assigneeRoles: string[];
  responses: TaskResponseRow[];
  myResponse: TaskResponse | null;
  /** The viewer is tagged (directly or by role) — may accept/decline. */
  isAssignee: boolean;
  /** The viewer may edit/delete (creator or assignee). */
  canEdit: boolean;
  /** CRM context links (company/project/visit), prebuilt HTML, may be "". */
  contextHtml: string;
}

/** The accept/decline panel — an HTMX swap target re-rendered on each reply. */
export function taskResponsePanel(
  taskId: number,
  myResponse: TaskResponse | null
): string {
  const current: TaskResponse | "pending" = myResponse ?? "pending";
  const hx = (value: TaskResponse) =>
    `hx-post="/tasks/${taskId}/response" hx-vals='{"response":"${value}"}' ` +
    `hx-target="#task-response" hx-swap="outerHTML"`;
  return `<div id="task-response" class="task-response">
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

function peopleChips(users: TaskAssigneeUser[], roles: string[]): string {
  if (users.length === 0 && roles.length === 0) {
    return `<span class="muted">Sin asignados.</span>`;
  }
  const userBadges = users.map((u) => badge(escapeHtml(u.email), "neutral"));
  const roleBadges = roles.map((r) => badge(roleLabel(r), "info"));
  return `<div class="task-people">${[...userBadges, ...roleBadges].join(
    " "
  )}</div>`;
}

/** Roster of other people's replies (the viewer's own reply lives in the panel). */
function responsesRoster(
  responses: TaskResponseRow[],
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
  return `<ul class="task-responses">${items}</ul>`;
}

/** Full detail page: summary, assignees, personal response, and edit controls. */
export function taskDetailPage(
  user: User,
  task: Task,
  data: TaskDetailData
): string {
  const editActions = data.canEdit
    ? [
        linkButton({ label: "Editar", href: `/tasks/${task.id}/edit` }),
        button({
          label: "Eliminar",
          variant: "danger",
          type: "button",
          attrs: `hx-delete="/tasks/${task.id}" hx-confirm="¿Eliminar esta tarea?"`,
        }),
      ]
    : [];

  const dateOrDash = (value: string) =>
    value ? escapeHtml(formatDateTime(value)) : "—";

  const summary = `
  <div class="task-summary">
    <div class="task-summary__item">
      <span class="task-summary__label">Inicio</span>
      <span>${dateOrDash(task.start_at)}</span>
    </div>
    <div class="task-summary__item">
      <span class="task-summary__label">Fin / límite</span>
      <span>${dateOrDash(task.end_at)}</span>
    </div>
    <div class="task-summary__item">
      <span class="task-summary__label">Estado</span>
      <span>${taskStatusBadge(task.status)}</span>
    </div>
    <div class="task-summary__item">
      <span class="task-summary__label">Prioridad</span>
      <span>${taskPriorityBadge(task.priority)}</span>
    </div>
  </div>`;

  const description = task.description
    ? `<p class="task-desc">${escapeHtml(task.description)}</p>`
    : `<p class="muted">Sin descripción.</p>`;

  const responsePanel = data.isAssignee
    ? `<div class="task-section">
        <h2 class="task-section__title">Tu asistencia</h2>
        ${taskResponsePanel(task.id, data.myResponse)}
      </div>`
    : "";

  const cardBody = `
    ${summary}
    ${description}
    ${data.contextHtml}
    <div class="task-section">
      <h2 class="task-section__title">Asignados</h2>
      ${peopleChips(data.assigneeUsers, data.assigneeRoles)}
    </div>
    ${responsePanel}
    <div class="task-section">
      <h2 class="task-section__title">Respuestas</h2>
      ${responsesRoster(data.responses, user.id)}
    </div>
    ${
      editActions.length
        ? `<div class="task-section">${formActions(...editActions)}</div>`
        : ""
    }`;

  const body = `
  ${backLink("/tasks", "← Volver a tareas")}
  ${pageHeader(escapeHtml(task.title), {
    eyebrow: `Creada por ${escapeHtml(data.createdByEmail)}`,
    actions: `${taskStatusBadge(task.status)} ${taskPriorityBadge(task.priority)}`,
  })}
  ${card(cardBody)}`;

  return page({
    user,
    current: "/tasks",
    title: task.title,
    body,
    maxWidth: "680px",
    pageStyles: PAGE_STYLES,
  });
}
