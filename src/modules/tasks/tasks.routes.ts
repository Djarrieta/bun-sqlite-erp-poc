import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { escapeHtml, type SelectOption } from "../../components/index.ts";
import { UserRepository } from "../../auth/auth.db.ts";
import { CompanyRepository } from "../companies/companies.db.ts";
import { ProjectRepository } from "../projects/projects.db.ts";
import { TaskRepository, type Task } from "./tasks.db.ts";
import { TASKS_MODULE, parseTaskForm } from "./tasks.rules.ts";
import {
  taskDetailPage,
  taskFormFragment,
  taskNewPage,
  tasksListPage,
  tasksResults,
} from "./tasks.views.ts";

/**
 * Registers the tasks module's routes. Tasks are per-viewer (row-scoped): a
 * user only sees and edits tasks they created or were assigned to. The
 * module-level matrix is permissive; the real gate is the repository's
 * `canView`, enforced on every detail/update route.
 */
export function registerTaskRoutes(router: Router): void {
  const tasks = new TaskRepository();
  const users = new UserRepository();
  const companies = new CompanyRepository();
  const projects = new ProjectRepository();

  const assigneeOptions = (): SelectOption[] =>
    users.list().map((u) => ({ value: String(u.id), label: u.email }));

  const validUserIds = (): Set<number> =>
    new Set(users.list().map((u) => u.id));

  /** CRM context links (company/project/visit) shown above the task form. */
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
      links.push(`<a href="/visits/${task.visit_id}">Bitácora #${task.visit_id}</a>`);
    }
    return links.length
      ? `<p class="muted">Origen · ${links.join(" · ")}</p>`
      : "";
  };

  // List — supports ?q=&status=&priority=&scope=&page=. HTMX asks for the
  // results fragment; a normal navigation gets the full page.
  router.get("/tasks", ({ req, url, user }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "view")) return forbidden();
    const filters = {
      q: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "",
      priority: url.searchParams.get("priority") ?? "",
      scope: url.searchParams.get("scope") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = tasks.list({ ...filters, userId: user.id, page });
    if (req.headers.get("HX-Request") === "true") {
      return html(tasksResults(result, filters));
    }
    return html(tasksListPage(result, filters, user));
  });

  // New form — registered before "/tasks/:id" so it isn't captured as an id.
  router.get("/tasks/new", ({ user }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "create")) return forbidden();
    return html(taskNewPage(user, assigneeOptions()));
  });

  // Create
  router.post("/tasks", async ({ req, user }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "create")) return forbidden();
    const { input, errors } = parseTaskForm(await req.formData(), validUserIds());
    if (Object.keys(errors).length > 0) {
      return html(
        taskNewPage(
          user,
          assigneeOptions(),
          {
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            dueDate: input.dueDate,
            assigneeId: input.assigneeId ? String(input.assigneeId) : "",
          },
          errors
        ),
        400
      );
    }
    const task = tasks.create(input, user.id);
    return redirect(`/tasks/${task.id}`);
  });

  // Detail — row-scoped: only the creator or assignee may see the task.
  router.get("/tasks/:id", ({ user, params }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "read")) return forbidden();
    const id = Number(params.id);
    const task = tasks.get(id);
    if (!task) return notFound();
    if (!tasks.canView(user.id, id)) return forbidden();
    return html(
      taskDetailPage(task, user, assigneeOptions(), true, contextHtml(task))
    );
  });

  // Update — row-scoped.
  router.put("/tasks/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, TASKS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const existing = tasks.get(id);
    if (!existing) return notFound();
    if (!tasks.canView(user.id, id)) return forbidden();

    const { input, errors } = parseTaskForm(await req.formData(), validUserIds());
    if (Object.keys(errors).length > 0) {
      const withEdits = {
        ...existing,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        due_date: input.dueDate,
        assignee_id: input.assigneeId,
      };
      return html(
        taskFormFragment(withEdits, user, assigneeOptions(), true, { errors }),
        400
      );
    }

    const updated = tasks.update(id, input) ?? existing;
    return html(
      taskFormFragment(updated, user, assigneeOptions(), true, { saved: true })
    );
  });
}
