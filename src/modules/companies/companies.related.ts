import type { User } from "../../auth/auth.db.ts";
import {
  escapeHtml,
  table,
  linkButton,
} from "../../components/index.ts";
import { can } from "../../core/permissions.ts";
import { ContactRepository, type Contact } from "../contacts/contacts.db.ts";
import { CONTACTS_MODULE } from "../contacts/contacts.rules.ts";
import { ProjectRepository, type Project } from "../projects/projects.db.ts";
import { PROJECTS_MODULE } from "../projects/projects.rules.ts";
import { projectStatusBadge } from "../projects/projects.views.ts";

const contacts = new ContactRepository();
const projects = new ProjectRepository();

/** The contacts belonging to the company, with a shortcut to add one. */
function contactsSection(companyId: number, user: User): string {
  if (!can(user, CONTACTS_MODULE, "view")) return "";
  const rows = contacts.listByCompany(companyId);
  const action = can(user, CONTACTS_MODULE, "create")
    ? linkButton({
        label: "+ Nuevo",
        href: `/contacts/new?company=${companyId}`,
        variant: "secondary",
        size: "sm",
      })
    : "";
  const list = table<Contact>({
    columns: [
      { header: "Nombre", cell: (c) => escapeHtml(c.name), primary: true },
      { header: "Cargo", cell: (c) => (c.title ? escapeHtml(c.title) : "—") },
      { header: "Correo", cell: (c) => (c.email ? escapeHtml(c.email) : "—") },
    ],
    rows,
    rowHref: (c) => `/contacts/${c.id}`,
    empty: "Esta compañía no tiene contactos todavía.",
  });
  return `<section class="related-section">
    <div class="related-section__head">
      <h2 class="related-section__title">Contactos</h2>
      ${action}
    </div>
    ${list}
  </section>`;
}

/** The projects belonging to the company, with a shortcut to add one. */
function projectsSection(companyId: number, user: User): string {
  if (!can(user, PROJECTS_MODULE, "view")) return "";
  const rows = projects.listByCompany(companyId);
  const action = can(user, PROJECTS_MODULE, "create")
    ? linkButton({
        label: "+ Nuevo",
        href: `/projects/new?company=${companyId}`,
        variant: "secondary",
        size: "sm",
      })
    : "";
  const list = table<Project>({
    columns: [
      {
        header: "Código",
        cell: (p) => `<code>${escapeHtml(p.code)}</code>`,
        primary: true,
      },
      { header: "Nombre", cell: (p) => escapeHtml(p.name) },
      {
        header: "Estado",
        cell: (p) => projectStatusBadge(p.status),
        width: "130px",
      },
    ],
    rows,
    rowHref: (p) => `/projects/${p.id}`,
    empty: "Esta compañía no tiene proyectos todavía.",
  });
  return `<section class="related-section">
    <div class="related-section__head">
      <h2 class="related-section__title">Proyectos</h2>
      ${action}
    </div>
    ${list}
  </section>`;
}

/**
 * Renders the "related contacts + projects" sections shown on a company's
 * detail page. Reaches across modules (contacts, projects) to give a company a
 * quick roster of its people and work.
 */
export function companyRelatedSections(companyId: number, user: User): string {
  return `${contactsSection(companyId, user)}${projectsSection(companyId, user)}`;
}
