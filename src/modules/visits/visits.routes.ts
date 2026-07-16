import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { escapeHtml, type SelectOption } from "../../components/index.ts";
import { CompanyRepository } from "../companies/companies.db.ts";
import { ProjectRepository } from "../projects/projects.db.ts";
import { TaskRepository, type TaskInput } from "../tasks/tasks.db.ts";
import { TASKS_MODULE } from "../tasks/tasks.rules.ts";
import { VisitRepository, type Visit } from "./visits.db.ts";
import { VISITS_MODULE, parseVisitForm } from "./visits.rules.ts";
import {
  visitActionItemsSection,
  visitDetailPage,
  visitFormFragment,
  visitNewPage,
  visitsListPage,
  visitsResults,
} from "./visits.views.ts";

/** Directory (shared with the bot via the ./data volume) holding visit audio. */
const AUDIO_DIR = "data/audio";
/** Audio filenames the bot writes: `<uuid>.<ext>`. Validated before serving. */
const AUDIO_NAME = /^[a-zA-Z0-9._-]+\.(ogg|oga|mp3|mpeg|wav|webm|flac|m4a)$/i;
const AUDIO_TYPES: Record<string, string> = {
  ogg: "audio/ogg",
  oga: "audio/ogg",
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  wav: "audio/wav",
  webm: "audio/webm",
  flac: "audio/flac",
  m4a: "audio/mp4",
};

/**
 * Registers the visits (bitácora) module's routes. Web visits carry manual
 * text; audio visits are created by the Telegram bot (transcribed + summarized)
 * and shown read-only here. Action items detected on a visit can be turned into
 * tasks. Visits are shared org-wide; audio is served behind the auth guard.
 */
export function registerVisitRoutes(router: Router): void {
  const visits = new VisitRepository();
  const companies = new CompanyRepository();
  const projects = new ProjectRepository();
  const tasks = new TaskRepository();

  const companyOptions = (currentId?: number | null): SelectOption[] => {
    const list = companies.activeList();
    const opts = list.map((c) => ({
      value: String(c.id),
      label: `${c.code} · ${c.name}`,
    }));
    if (currentId && !list.some((c) => c.id === currentId)) {
      const current = companies.get(currentId);
      if (current)
        opts.unshift({
          value: String(current.id),
          label: `${current.code} · ${current.name}`,
        });
    }
    return opts;
  };

  const projectOptions = (): SelectOption[] =>
    projects
      .selectList()
      .map((p) => ({ value: String(p.id), label: `${p.code} · ${p.name}` }));

  /** Context links (company/project) shown above the visit body. */
  const contextHtml = (visit: Visit): string => {
    const links: string[] = [];
    if (visit.company_id) {
      const c = companies.get(visit.company_id);
      if (c)
        links.push(`<a href="/companies/${c.id}">Compañía: ${escapeHtml(c.code)}</a>`);
    }
    if (visit.project_id) {
      const p = projects.get(visit.project_id);
      if (p)
        links.push(`<a href="/projects/${p.id}">Proyecto: ${escapeHtml(p.code)}</a>`);
    }
    return links.length ? `<p class="muted">${links.join(" · ")}</p>` : "";
  };

  /** Re-render the action-items section fragment. */
  const actionsSection = (visitId: number, user: RouteContext["user"]) =>
    visitActionItemsSection(visitId, visits.listActionItems(visitId), {
      canCreateTask: can(user, TASKS_MODULE, "create"),
    });

  /** Create a task from one action item and mark it converted. */
  const taskFromItem = (
    visit: Visit,
    item: { id: number; text: string },
    userId: number
  ): void => {
    const input: TaskInput = {
      title: item.text.slice(0, 160),
      description: "",
      status: "pending",
      priority: "medium",
      startAt: "",
      endAt: "",
      assigneeUserIds: [visit.created_by],
      assigneeRoles: [],
    };
    const task = tasks.create(input, userId, {
      companyId: visit.company_id,
      projectId: visit.project_id,
      visitId: visit.id,
    });
    visits.convertActionItem(item.id, task.id);
  };

  // List — supports ?q=&company=&project=&status=&source=&page=.
  router.get("/visits", ({ req, url, user }: RouteContext) => {
    if (!can(user, VISITS_MODULE, "view")) return forbidden();
    const filters = {
      q: url.searchParams.get("q") ?? "",
      company: url.searchParams.get("company") ?? "",
      project: url.searchParams.get("project") ?? "",
      status: url.searchParams.get("status") ?? "",
      source: url.searchParams.get("source") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = visits.list({
      q: filters.q,
      companyId: filters.company ? Number(filters.company) : undefined,
      projectId: filters.project ? Number(filters.project) : undefined,
      status: filters.status,
      source: filters.source,
      page,
    });
    if (req.headers.get("HX-Request") === "true") {
      return html(visitsResults(result, filters, companyOptions(), projectOptions()));
    }
    return html(
      visitsListPage(result, filters, companyOptions(), projectOptions(), user)
    );
  });

  // New form (web) — registered before "/visits/:id". Supports ?company=<id>
  // and ?project=<id> to prefill (e.g. from a company/project detail page).
  router.get("/visits/new", ({ url, user }: RouteContext) => {
    if (!can(user, VISITS_MODULE, "create")) return forbidden();
    const companyParam = Number(url.searchParams.get("company") ?? "");
    const projectParam = Number(url.searchParams.get("project") ?? "");
    const companyId =
      Number.isInteger(companyParam) && companies.get(companyParam)
        ? companyParam
        : 0;
    const projectId =
      Number.isInteger(projectParam) && projects.get(projectParam)
        ? projectParam
        : 0;
    return html(
      visitNewPage(user, companyOptions(companyId || undefined), projectOptions(), {
        companyId: companyId ? String(companyId) : "",
        projectId: projectId ? String(projectId) : "",
        notes: "",
      })
    );
  });

  // Create (web)
  router.post("/visits", async ({ req, user }: RouteContext) => {
    if (!can(user, VISITS_MODULE, "create")) return forbidden();
    const { input, errors } = parseVisitForm(await req.formData());
    if (input.companyId && !companies.get(input.companyId))
      errors.company_id = "La compañía seleccionada no existe.";
    if (input.projectId && !projects.get(input.projectId))
      errors.project_id = "El proyecto seleccionado no existe.";
    if (Object.keys(errors).length > 0) {
      return html(
        visitNewPage(
          user,
          companyOptions(input.companyId),
          projectOptions(),
          {
            companyId: input.companyId ? String(input.companyId) : "",
            projectId: input.projectId ? String(input.projectId) : "",
            notes: input.notes,
          },
          errors
        ),
        400
      );
    }
    const visit = visits.createWeb(input, user.id);
    return redirect(`/visits/${visit.id}`);
  });

  // Serve a visit's audio (auth-guarded, strict filename check).
  router.get("/visits/:id/audio", async ({ user, params }: RouteContext) => {
    if (!can(user, VISITS_MODULE, "read")) return forbidden();
    const visit = visits.get(Number(params.id));
    if (!visit || !visit.audio_path) return notFound();
    const name = visit.audio_path;
    if (!AUDIO_NAME.test(name)) return notFound();
    const file = Bun.file(`${AUDIO_DIR}/${name}`);
    if (!(await file.exists())) return notFound();
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return new Response(file, {
      headers: {
        "content-type": AUDIO_TYPES[ext] ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
      },
    });
  });

  // Detail
  router.get("/visits/:id", ({ user, params }: RouteContext) => {
    if (!can(user, VISITS_MODULE, "read")) return forbidden();
    const visit = visits.get(Number(params.id));
    if (!visit) return notFound();
    return html(
      visitDetailPage(visit, user, {
        companyOptions: companyOptions(visit.company_id),
        projectOptions: projectOptions(),
        contextHtml: contextHtml(visit),
        actionItemsSection: actionsSection(visit.id, user),
      })
    );
  });

  // Update (web notes/company/project)
  router.put("/visits/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, VISITS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const existing = visits.get(id);
    if (!existing) return notFound();

    const { input, errors } = parseVisitForm(await req.formData());
    if (input.companyId && !companies.get(input.companyId))
      errors.company_id = "La compañía seleccionada no existe.";
    if (input.projectId && !projects.get(input.projectId))
      errors.project_id = "El proyecto seleccionado no existe.";
    if (Object.keys(errors).length > 0) {
      const withEdits = {
        ...existing,
        company_id: input.companyId,
        project_id: input.projectId,
        notes: input.notes,
      };
      return html(
        visitFormFragment(
          withEdits,
          user,
          companyOptions(input.companyId),
          projectOptions(),
          { errors }
        ),
        400
      );
    }
    const updated = visits.updateWeb(id, input) ?? existing;
    return html(
      visitFormFragment(
        updated,
        user,
        companyOptions(updated.company_id),
        projectOptions(),
        { saved: true }
      )
    );
  });

  // Create a task from one action item.
  router.post(
    "/visits/:id/action-items/:aid/task",
    ({ user, params }: RouteContext) => {
      if (!can(user, VISITS_MODULE, "read")) return forbidden();
      if (!can(user, TASKS_MODULE, "create")) return forbidden();
      const id = Number(params.id);
      const visit = visits.get(id);
      if (!visit) return notFound();
      const item = visits.getActionItem(Number(params.aid));
      if (item && item.visit_id === id && item.status === "suggested") {
        taskFromItem(visit, item, user.id);
      }
      return html(actionsSection(id, user));
    }
  );

  // Create tasks from every suggested action item.
  router.post(
    "/visits/:id/action-items/tasks",
    ({ user, params }: RouteContext) => {
      if (!can(user, VISITS_MODULE, "read")) return forbidden();
      if (!can(user, TASKS_MODULE, "create")) return forbidden();
      const id = Number(params.id);
      const visit = visits.get(id);
      if (!visit) return notFound();
      for (const item of visits.listActionItems(id)) {
        if (item.status === "suggested") taskFromItem(visit, item, user.id);
      }
      return html(actionsSection(id, user));
    }
  );

  // Dismiss an action item.
  router.post(
    "/visits/:id/action-items/:aid/dismiss",
    ({ user, params }: RouteContext) => {
      if (!can(user, VISITS_MODULE, "read")) return forbidden();
      const id = Number(params.id);
      if (!visits.get(id)) return notFound();
      const item = visits.getActionItem(Number(params.aid));
      if (item && item.visit_id === id && item.status === "suggested") {
        visits.dismissActionItem(item.id);
      }
      return html(actionsSection(id, user));
    }
  );
}
