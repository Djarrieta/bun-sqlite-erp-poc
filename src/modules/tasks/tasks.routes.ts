import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import {
  escapeHtml,
  type CalendarView,
  isValidView,
  rangeFor,
} from "../../components/index.ts";
import { parseAnchor } from "../../core/dates.ts";
import { UserRepository } from "../../auth/auth.db.ts";
import { CompanyRepository } from "../companies/companies.db.ts";
import { ProjectRepository } from "../projects/projects.db.ts";
import {
  TaskRepository,
  type Task,
  type TaskAssigneeUser,
  type TaskInput,
} from "./tasks.db.ts";
import { TASKS_MODULE, parseTaskForm } from "./tasks.rules.ts";
import {
  EMPTY_TASK_FORM,
  taskDetailPage,
  taskEditFormCard,
  taskEditPage,
  taskNewPage,
  taskResponsePanel,
  tasksCalendarPage,
  tasksCalendarRegion,
  tasksListPage,
  tasksResults,
  type TaskFormValues,
} from "./tasks.views.ts";

/**
 * Registers the tasks module's routes. Tasks are per-viewer (row-scoped): the
 * module-level `can(...)` matrix is permissive (any role may act), so the real
 * authorization is row-level — a user may only see or edit a task they created
 * or were assigned to (directly or via their role). Every handler that touches a
 * specific task therefore guards with `tasks.canView(...)`.
 */
export function registerTaskRoutes(router: Router): void {
  const tasks = new TaskRepository();
  const users = new UserRepository();
  const companies = new CompanyRepository();
  const projects = new ProjectRepository();

  /** All users as assignee choices for the pickers. */
  const userChoices = (): TaskAssigneeUser[] =>
    users.list().map((u) => ({ id: u.id, email: u.email }));

  /** Set of valid user ids, to reject tampered assignee submissions. */
  const validUserIds = (): Set<number> =>
    new Set(users.list().map((u) => u.id));

  /** Map a parsed input back into form values for error re-rendering. */
  const toFormValues = (input: TaskInput): TaskFormValues => ({
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    startAt: input.startAt,
    endAt: input.endAt,
    assigneeUserIds: input.assigneeUserIds,
    assigneeRoles: input.assigneeRoles,
  });

  /** Current form values for an existing task (edit form + error re-render). */
  const formValuesOf = (task: Task): TaskFormValues => ({
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    startAt: task.start_at,
    endAt: task.end_at,
    assigneeUserIds: tasks.assigneeUsers(task.id).map((u) => u.id),
    assigneeRoles: tasks.assigneeRoles(task.id),
  });

  /** CRM context links (company/project/visit) shown on the detail page. */
  const contextHtml = (task: Task): string => {
    const links: string[] = [];
    if (task.company_id) {
      const c = companies.get(task.company_id);
      if (c)
        links.push(
          `<a href="/companies/${c.id}">Compañía: ${escapeHtml(c.code)}</a>`
        );
    }
    if (task.project_id) {
      const p = projects.get(task.project_id);
      if (p)
        links.push(
          `<a href="/projects/${p.id}">Proyecto: ${escapeHtml(p.code)}</a>`
        );
    }
    if (task.visit_id) {
      links.push(
        `<a href="/visits/${task.visit_id}">Bitácora #${task.visit_id}</a>`
      );
    }
    return links.length
      ? `<p class="muted">Origen · ${links.join(" · ")}</p>`
      : "";
  };

  // List — ?q=&status=&priority=&scope=&page=. HTMX asks for just the results
  // fragment; a normal navigation gets the full page. Always scoped to the viewer.
  router.get("/tasks", ({ req, url, user }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "view")) return forbidden();
    const filters = {
      q: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "",
      priority: url.searchParams.get("priority") ?? "",
      scope: url.searchParams.get("scope") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = tasks.list({
      userId: user.id,
      role: user.role,
      q: filters.q,
      status: filters.status,
      priority: filters.priority,
      scope: filters.scope,
      page,
    });
    if (req.headers.get("HX-Request") === "true") {
      return html(tasksResults(result, filters));
    }
    return html(tasksListPage(result, filters, user));
  });

  // New form — registered before "/tasks/:id" so it isn't captured as an id.
  // An optional ?date=YYYY-MM-DD (from clicking a calendar day) prefills the start.
  router.get("/tasks/new", ({ url, user }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "create")) return forbidden();
    const date = url.searchParams.get("date");
    const values =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? { ...EMPTY_TASK_FORM, startAt: `${date}T09:00` }
        : EMPTY_TASK_FORM;
    return html(taskNewPage(user, userChoices(), values));
  });

  // Calendar — month/week grid of visible dated tasks. Registered before
  // "/tasks/:id" so "calendar" isn't captured as an id. HTMX nav swaps the grid.
  router.get("/tasks/calendar", ({ req, url, user }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "view")) return forbidden();
    const viewParam = url.searchParams.get("view");
    const view: CalendarView = isValidView(viewParam) ? viewParam : "month";
    const anchor = parseAnchor(url.searchParams.get("date"));
    const { start, endExclusive } = rangeFor(view, anchor);
    const rows = tasks.rangeList({
      userId: user.id,
      role: user.role,
      startDate: start,
      endDate: endExclusive,
    });
    const data = { view, anchor, tasks: rows };
    if (req.headers.get("HX-Request") === "true") {
      return html(tasksCalendarRegion(data));
    }
    return html(tasksCalendarPage(user, data));
  });

  // Create
  router.post("/tasks", async ({ req, user }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "create")) return forbidden();
    const { input, errors } = parseTaskForm(await req.formData(), validUserIds());
    if (Object.keys(errors).length > 0) {
      return html(taskNewPage(user, userChoices(), toFormValues(input), errors), 400);
    }
    const task = tasks.create(input, user.id);
    return redirect(`/tasks/${task.id}`);
  });

  // Detail — only visible to the creator or an assignee.
  router.get("/tasks/:id", ({ user, params }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "read")) return forbidden();
    const id = Number(params.id);
    const task = tasks.get(id);
    // Treat "not visible to you" as "not found" so existence never leaks.
    if (!task || !tasks.canView(user.id, user.role, id)) return notFound();

    const assigneeUsers = tasks.assigneeUsers(id);
    const assigneeRoles = tasks.assigneeRoles(id);
    const isAssignee =
      assigneeUsers.some((u) => u.id === user.id) ||
      assigneeRoles.includes(user.role);
    return html(
      taskDetailPage(user, task, {
        createdByEmail: users.findById(task.created_by)?.email ?? "—",
        assigneeUsers,
        assigneeRoles,
        responses: tasks.listResponses(id),
        myResponse: tasks.responseOf(id, user.id),
        isAssignee,
        // Creator or assignee may edit — the same set that may view.
        canEdit: task.created_by === user.id || isAssignee,
        contextHtml: contextHtml(task),
      })
    );
  });

  // Edit form
  router.get("/tasks/:id/edit", ({ user, params }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const task = tasks.get(id);
    if (!task || !tasks.canView(user.id, user.role, id)) return notFound();
    return html(taskEditPage(user, task, formValuesOf(task), userChoices()));
  });

  // Update — HTMX PUT from the edit form; success redirects to the detail page.
  router.put("/tasks/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const existing = tasks.get(id);
    if (!existing || !tasks.canView(user.id, user.role, id)) return notFound();

    const { input, errors } = parseTaskForm(await req.formData(), validUserIds());
    if (Object.keys(errors).length > 0) {
      return html(
        taskEditFormCard(existing, toFormValues(input), userChoices(), errors),
        400
      );
    }
    tasks.update(id, input);
    return html("", 200, { "HX-Redirect": `/tasks/${id}` });
  });

  // Delete — creator or assignee only; navigate back to the list.
  router.delete("/tasks/:id", ({ user, params }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "delete")) return forbidden();
    const id = Number(params.id);
    const task = tasks.get(id);
    if (!task || !tasks.canView(user.id, user.role, id)) return notFound();
    tasks.delete(id);
    return html("", 200, { "HX-Redirect": "/tasks" });
  });

  // Personal response — any viewer may accept/decline; returns the panel.
  router.post("/tasks/:id/response", async ({ req, user, params }: RouteContext) => {
    const id = Number(params.id);
    const task = tasks.get(id);
    if (!task || !tasks.canView(user.id, user.role, id)) return notFound();
    const value = String((await req.formData()).get("response") ?? "");
    if (value !== "accepted" && value !== "declined") {
      return html(taskResponsePanel(id, tasks.responseOf(id, user.id)), 400);
    }
    tasks.setResponse(id, user.id, value);
    return html(taskResponsePanel(id, value));
  });
}
