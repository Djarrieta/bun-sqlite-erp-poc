import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import type { SelectOption } from "../../components/index.ts";
import { CompanyRepository } from "../companies/companies.db.ts";
import { ContactRepository } from "./contacts.db.ts";
import { CONTACTS_MODULE, parseContactForm } from "./contacts.rules.ts";
import {
  contactDetailPage,
  contactFormFragment,
  contactNewPage,
  contactsListPage,
  contactsResults,
} from "./contacts.views.ts";

/**
 * Registers the contacts module's routes. Every handler checks the user's
 * business rules via `can(...)`. The directory is shared org-wide. A contact's
 * company is optional; when supplied it is cross-checked against real companies.
 */
export function registerContactRoutes(router: Router): void {
  const contacts = new ContactRepository();
  const companies = new CompanyRepository();

  /** Active companies as `{ value, label }`, optionally including `currentId`. */
  const companyOptions = (currentId?: number | null): SelectOption[] => {
    const list = companies.activeList();
    const opts = list.map((c) => ({
      value: String(c.id),
      label: `${c.code} · ${c.name}`,
    }));
    // Keep a contact's (possibly archived) current company selectable.
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

  // List — supports ?q=&active=&company=&page=. HTMX asks for the results
  // fragment; a normal navigation gets the full page.
  router.get("/contacts", ({ req, url, user }: RouteContext) => {
    if (!can(user, CONTACTS_MODULE, "view")) return forbidden();
    const filters = {
      q: url.searchParams.get("q") ?? "",
      active: url.searchParams.get("active") ?? "",
      company: url.searchParams.get("company") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = contacts.list({
      q: filters.q,
      active: filters.active,
      companyId: filters.company ? Number(filters.company) : undefined,
      page,
    });
    if (req.headers.get("HX-Request") === "true") {
      return html(contactsResults(result, filters, companyOptions()));
    }
    return html(contactsListPage(result, filters, companyOptions(), user));
  });

  // New form — registered before "/contacts/:id" so it isn't captured as an id.
  // Supports ?company=<id> to prefill the company (e.g. from a company page).
  router.get("/contacts/new", ({ url, user }: RouteContext) => {
    if (!can(user, CONTACTS_MODULE, "create")) return forbidden();
    const companyParam = Number(url.searchParams.get("company") ?? "");
    const prefill =
      Number.isInteger(companyParam) && companies.get(companyParam)
        ? String(companyParam)
        : "";
    return html(
      contactNewPage(user, companyOptions(companyParam || undefined), {
        name: "",
        title: "",
        email: "",
        phone: "",
        companyId: prefill,
        isActive: true,
        notes: "",
      })
    );
  });

  // Create
  router.post("/contacts", async ({ req, user }: RouteContext) => {
    if (!can(user, CONTACTS_MODULE, "create")) return forbidden();
    const { input, errors } = parseContactForm(await req.formData());
    if (input.companyId && !companies.get(input.companyId)) {
      errors.company_id = "La compañía seleccionada no existe.";
    }
    if (Object.keys(errors).length > 0) {
      return html(
        contactNewPage(
          user,
          companyOptions(input.companyId),
          {
            name: input.name,
            title: input.title,
            email: input.email,
            phone: input.phone,
            companyId: input.companyId ? String(input.companyId) : "",
            isActive: input.isActive,
            notes: input.notes,
          },
          errors
        ),
        400
      );
    }
    const contact = contacts.create(input, user.id);
    return redirect(`/contacts/${contact.id}`);
  });

  // Detail
  router.get("/contacts/:id", ({ user, params }: RouteContext) => {
    if (!can(user, CONTACTS_MODULE, "read")) return forbidden();
    const contact = contacts.get(Number(params.id));
    if (!contact) return notFound();
    const company = contact.company_id ? companies.get(contact.company_id) : null;
    return html(
      contactDetailPage(
        contact,
        company?.name ?? null,
        user,
        companyOptions(contact.company_id)
      )
    );
  });

  // Update — also archives/reactivates via the is_active field.
  router.put("/contacts/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, CONTACTS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const existing = contacts.get(id);
    if (!existing) return notFound();

    const { input, errors } = parseContactForm(await req.formData());
    if (input.companyId && !companies.get(input.companyId)) {
      errors.company_id = "La compañía seleccionada no existe.";
    }
    if (Object.keys(errors).length > 0) {
      const withEdits = {
        ...existing,
        name: input.name,
        title: input.title,
        email: input.email,
        phone: input.phone,
        company_id: input.companyId,
        is_active: input.isActive ? 1 : 0,
        notes: input.notes,
      };
      return html(
        contactFormFragment(withEdits, user, companyOptions(input.companyId), {
          errors,
        }),
        400
      );
    }

    const updated = contacts.update(id, input) ?? existing;
    return html(
      contactFormFragment(updated, user, companyOptions(updated.company_id), {
        saved: true,
      })
    );
  });
}
