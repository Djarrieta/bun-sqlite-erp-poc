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
import type { Task, TaskListRow, TaskPriority, TaskStatus } from "./tasks.db.ts";
import { TASK_PRIORITIES, TASK_STATUSES } from "./tasks.rules.ts";

const STATUS = statusMap<TaskStatus>({
  labels: { pending: "Pendiente", in_progress: "En progreso", done: "Hecha" },
  variants: { pending: "neutral", in_progress: "info", done: "success" },
  order: TASK_STATUSES,
});
const STATUS_OPTIONS = STATUS.options;

const PRIORITY = statusMap<TaskPriority>({
  labels: { low: "Baja", medium: "Media", high: "Alta" },
  variants: { low: "neutral", medium: "info", high: "warning" },
  order: TASK_PRIORITIES,
});
const PRIORITY_OPTIONS = PRIORITY.options;

/** The "— Sin asignar —" choice prepended to the assignee select. */
const NO_ASSIGNEE: SelectOption = { value: "", label: "— Sin asignar —" };

export function taskStatusBadge(status: TaskStatus): string {
  return STATUS.badge(status);
}
export function taskPriorityBadge(priority: TaskPriority): string {
  return PRIORITY.badge(priority);
}

interface FormValues {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: string;
}

/** The shared fields used by the create and edit forms. */
function taskFields(
  values: FormValues,
  errors: Record<string, string>,
  editable: boolean,
  assigneeOptions: SelectOption[]
): string {
  return `
    ${textField({
      name: "title",
      label: "Título",
      value: values.title,
      required: true,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="160"',
      error: errors.title,
    })}
    ${textareaField({
      name: "description",
      label: "Descripción",
      value: values.description,
      disabled: !editable,
      rows: 4,
      attrs: 'maxlength="2000"',
      error: errors.description,
    })}
    ${selectField({
      name: "status",
      label: "Estado",
      options: STATUS_OPTIONS,
      value: values.status,
      disabled: !editable,
      error: errors.status,
    })}
    ${selectField({
      name: "priority",
      label: "Prioridad",
      options: PRIORITY_OPTIONS,
      value: values.priority,
      disabled: !editable,
      error: errors.priority,
    })}
    ${textField({
      name: "due_date",
      label: "Fecha límite",
      type: "date",
      value: values.dueDate,
      disabled: !editable,
      error: errors.due_date,
    })}
    ${selectField({
      name: "assignee_id",
      label: "Asignado a",
      options: [NO_ASSIGNEE, ...assigneeOptions],
      value: values.assigneeId,
      disabled: !editable,
      error: errors.assignee_id,
    })}`;
}

/** Search text + filter selections that drive the tasks list. */
export interface TaskFilters {
  q: string;
  status: string;
  priority: string;
  scope: string;
}

const SCOPE_OPTIONS = [
  { value: "created", label: "Creadas por mí" },
  { value: "assigned", label: "Asignadas a mí" },
];

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
        header: "Límite",
        cell: (t) => (t.due_date ? escapeHtml(t.due_date) : "—"),
        width: "130px",
      },
      {
        header: "Asignado",
        cell: (t) => (t.assignee_email ? escapeHtml(t.assignee_email) : "—"),
      },
    ],
    rows: result.rows,
    rowHref: (t) => `/tasks/${t.id}`,
    empty: anyFilter
      ? "Ninguna tarea coincide con los filtros."
      : "No hay tareas todavía.",
    search: { value: filters.q, placeholder: "Buscar tareas..." },
    filters: [
      {
        name: "scope",
        label: "Ámbito",
        value: filters.scope,
        options: SCOPE_OPTIONS,
        anyLabel: "Todas",
      },
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
  const actions = linkButton({ label: "+ Nueva", href: "/tasks/new" });
  const body = `
  ${pageHeader("Tareas", { eyebrow: "Trabajo", actions })}
  ${dataTable(tasksTableOptions(result, filters))}`;
  return page({ user, current: "/tasks", title: "Tareas", body });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function tasksResults(
  result: Page<TaskListRow>,
  filters: TaskFilters
): string {
  return dataTableBody(tasksTableOptions(result, filters));
}

/** Create page with an empty (or error-repopulated) form. */
export function taskNewPage(
  user: User,
  assigneeOptions: SelectOption[],
  values: FormValues = {
    title: "",
    description: "",
    status: "pending",
    priority: "medium",
    dueDate: "",
    assigneeId: "",
  },
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${taskFields(values, errors, true, assigneeOptions)}
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
    maxWidth: "620px",
  });
}

/** The editable detail form, rendered standalone as an HTMX swap target. */
export function taskFormFragment(
  task: Task,
  user: User,
  assigneeOptions: SelectOption[],
  canEdit: boolean,
  opts: { errors?: Record<string, string>; saved?: boolean } = {}
): string {
  const values: FormValues = {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.due_date,
    assigneeId: task.assignee_id ? String(task.assignee_id) : "",
  };
  const errors = opts.errors ?? {};

  const saveBtn = canEdit ? button({ label: "Guardar" }) : "";
  const savedMsg = savedIndicator(!!opts.saved);
  const readonlyNote = readOnlyNote(canEdit);

  const formBody = `
    ${readonlyNote}
    ${taskFields(values, errors, canEdit, assigneeOptions)}
    ${formActions(saveBtn, savedMsg)}`;

  return card(formBody, {
    as: "form",
    attrs: `id="task-form" hx-put="/tasks/${task.id}" hx-target="#task-form" hx-swap="outerHTML"`,
  });
}

/** Full detail page: the editable form plus any CRM context links. */
export function taskDetailPage(
  task: Task,
  user: User,
  assigneeOptions: SelectOption[],
  canEdit: boolean,
  contextHtml = ""
): string {
  const body = `
  ${backLink("/tasks", "← Volver a tareas")}
  ${pageHeader(escapeHtml(task.title), {
    actions: `${taskStatusBadge(task.status)} ${taskPriorityBadge(task.priority)}`,
  })}
  ${contextHtml}
  ${taskFormFragment(task, user, assigneeOptions, canEdit)}`;

  return page({
    user,
    current: "/tasks",
    title: task.title,
    body,
    maxWidth: "620px",
  });
}
