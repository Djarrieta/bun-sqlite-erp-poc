import type { User } from "../../auth/auth.db.ts";
import {
  escapeHtml,
  table,
  linkButton,
  type Column,
} from "../../components/index.ts";
import { can } from "../../core/permissions.ts";
import { VisitRepository, type VisitListRow } from "./visits.db.ts";
import { VISITS_MODULE } from "./visits.rules.ts";
import { visitSourceBadge, visitStatusBadge } from "./visits.views.ts";

const visits = new VisitRepository();

/** A short, human-readable preview of a visit for the related list. */
function visitPreview(v: VisitListRow): string {
  const text = (v.summary || v.notes || v.transcript || "").trim();
  if (!text) return `Bitácora #${v.id}`;
  return escapeHtml(text.length > 80 ? `${text.slice(0, 80)}…` : text);
}

interface VisitsSectionOptions {
  /** Adds a "Proyecto" column (used on the company page, where it varies). */
  showProject: boolean;
  /** Query scoping "Ver todas" + "+ Nueva" (e.g. `company=3` or `project=7`). */
  scopeQuery: string;
  /** Message shown when there are no linked visits. */
  empty: string;
  canCreate: boolean;
}

/** Shared renderer for the "Bitácoras" related-section on detail pages. */
function visitsSection(rows: VisitListRow[], opts: VisitsSectionOptions): string {
  const columns: Column<VisitListRow>[] = [
    { header: "Bitácora", cell: (v) => visitPreview(v), primary: true },
    ...(opts.showProject
      ? [
          {
            header: "Proyecto",
            cell: (v: VisitListRow) =>
              v.project_code ? escapeHtml(v.project_code) : "—",
          },
        ]
      : []),
    { header: "Origen", cell: (v) => visitSourceBadge(v.source), width: "110px" },
    { header: "Estado", cell: (v) => visitStatusBadge(v.status), width: "120px" },
    {
      header: "Fecha",
      cell: (v) => escapeHtml(v.created_at.slice(0, 10)),
      width: "120px",
    },
  ];
  const list = table<VisitListRow>({
    columns,
    rows,
    rowHref: (v) => `/visits/${v.id}`,
    empty: opts.empty,
  });
  const viewAll = linkButton({
    label: "Ver todas",
    href: `/visits?${opts.scopeQuery}`,
    variant: "secondary",
    size: "sm",
  });
  const create = opts.canCreate
    ? linkButton({
        label: "+ Nueva",
        href: `/visits/new?${opts.scopeQuery}`,
        variant: "secondary",
        size: "sm",
      })
    : "";
  return `<section class="related-section">
    <div class="related-section__head">
      <h2 class="related-section__title">Bitácoras</h2>
      <div class="related-section__actions">${viewAll}${create}</div>
    </div>
    ${list}
  </section>`;
}

/** The bitácoras linked to a company, shown on its detail page. */
export function companyVisitsSection(companyId: number, user: User): string {
  if (!can(user, VISITS_MODULE, "view")) return "";
  return visitsSection(visits.listByCompany(companyId), {
    showProject: true,
    scopeQuery: `company=${companyId}`,
    empty: "Esta compañía no tiene bitácoras todavía.",
    canCreate: can(user, VISITS_MODULE, "create"),
  });
}

/** The bitácoras linked to a project, shown on its detail page. */
export function projectVisitsSection(projectId: number, user: User): string {
  if (!can(user, VISITS_MODULE, "view")) return "";
  return visitsSection(visits.listByProject(projectId), {
    showProject: false,
    scopeQuery: `project=${projectId}`,
    empty: "Este proyecto no tiene bitácoras todavía.",
    canCreate: can(user, VISITS_MODULE, "create"),
  });
}
