import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { UserRepository } from "../auth/auth.db.ts";
import {
  EventRepository,
  type Event,
  type EventAssigneeUser,
  type EventInput,
} from "./events.db.ts";
import { EVENTS_MODULE, parseEventForm } from "./events.rules.ts";
import {
  type CalendarView,
  isValidView,
  parseAnchor,
  rangeFor,
} from "./events.calendar.ts";
import {
  EMPTY_EVENT_FORM,
  eventDetailPage,
  eventEditFormCard,
  eventEditPage,
  eventNewPage,
  eventResponsePanel,
  eventsCalendarPage,
  eventsCalendarRegion,
  eventsListPage,
  eventsResults,
  type EventFormValues,
} from "./events.views.ts";

/**
 * Registers the events module's routes. Unlike the shared catalog modules,
 * events are per-viewer: the module-level `can(...)` matrix is permissive (any
 * role may act), so the real authorization is row-level — a user may only see
 * or edit an event they created or were assigned to. Every handler that touches
 * a specific event therefore guards with `events.canView(...)`.
 */
export function registerEventRoutes(router: Router): void {
  const events = new EventRepository();
  const users = new UserRepository();

  /** All users as assignee choices for the pickers. */
  const userChoices = (): EventAssigneeUser[] =>
    users.list().map((u) => ({ id: u.id, email: u.email }));

  /** Set of valid user ids, to reject tampered assignee submissions. */
  const validUserIds = (): Set<number> =>
    new Set(users.list().map((u) => u.id));

  /** Map a parsed input back into form values for error re-rendering. */
  const toFormValues = (input: EventInput): EventFormValues => ({
    title: input.title,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    status: input.status,
    assigneeUserIds: input.assigneeUserIds,
    assigneeRoles: input.assigneeRoles,
  });

  /** Current form values for an existing event (edit form + error re-render). */
  const formValuesOf = (event: Event): EventFormValues => ({
    title: event.title,
    description: event.description,
    startAt: event.start_at,
    endAt: event.end_at,
    status: event.status,
    assigneeUserIds: events.assigneeUsers(event.id).map((u) => u.id),
    assigneeRoles: events.assigneeRoles(event.id),
  });

  // List — ?q=&status=&scope=&page=. HTMX asks for just the results fragment;
  // a normal navigation gets the full page. Always scoped to the viewer.
  router.get("/events", ({ req, url, user }: RouteContext) => {
    if (!can(user, EVENTS_MODULE, "view")) return forbidden();
    const filters = {
      q: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "",
      scope: url.searchParams.get("scope") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = events.list({
      userId: user.id,
      role: user.role,
      q: filters.q,
      status: filters.status,
      scope: filters.scope,
      page,
    });
    if (req.headers.get("HX-Request") === "true") {
      return html(eventsResults(result, filters));
    }
    return html(eventsListPage(result, filters, user));
  });

  // New form — registered before "/events/:id" so it isn't captured as an id.
  // An optional ?date=YYYY-MM-DD (from clicking a calendar day) prefills the start.
  router.get("/events/new", ({ url, user }: RouteContext) => {
    if (!can(user, EVENTS_MODULE, "create")) return forbidden();
    const date = url.searchParams.get("date");
    const values =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? { ...EMPTY_EVENT_FORM, startAt: `${date}T09:00` }
        : EMPTY_EVENT_FORM;
    return html(eventNewPage(user, userChoices(), values));
  });

  // Calendar — month/week grid of visible events. Registered before "/events/:id"
  // so "calendar" isn't captured as an id. HTMX nav swaps just the grid region.
  router.get("/events/calendar", ({ req, url, user }: RouteContext) => {
    if (!can(user, EVENTS_MODULE, "view")) return forbidden();
    const viewParam = url.searchParams.get("view");
    const view: CalendarView = isValidView(viewParam) ? viewParam : "month";
    const anchor = parseAnchor(url.searchParams.get("date"));
    const { start, endExclusive } = rangeFor(view, anchor);
    const rows = events.rangeList({
      userId: user.id,
      role: user.role,
      startDate: start,
      endDate: endExclusive,
    });
    const data = { view, anchor, events: rows };
    if (req.headers.get("HX-Request") === "true") {
      return html(eventsCalendarRegion(data));
    }
    return html(eventsCalendarPage(user, data));
  });

  // Create
  router.post("/events", async ({ req, user }: RouteContext) => {
    if (!can(user, EVENTS_MODULE, "create")) return forbidden();
    const { input, errors } = parseEventForm(
      await req.formData(),
      validUserIds()
    );
    if (Object.keys(errors).length > 0) {
      return html(
        eventNewPage(user, userChoices(), toFormValues(input), errors),
        400
      );
    }
    const event = events.create(input, user.id);
    return redirect(`/events/${event.id}`);
  });

  // Detail — only visible to the creator or an assignee.
  router.get("/events/:id", ({ user, params }: RouteContext) => {
    if (!can(user, EVENTS_MODULE, "read")) return forbidden();
    const id = Number(params.id);
    const event = events.get(id);
    // Treat "not visible to you" as "not found" so existence never leaks.
    if (!event || !events.canView(user.id, user.role, id)) return notFound();

    const assigneeUsers = events.assigneeUsers(id);
    const assigneeRoles = events.assigneeRoles(id);
    const isAssignee =
      assigneeUsers.some((u) => u.id === user.id) ||
      assigneeRoles.includes(user.role);
    return html(
      eventDetailPage(user, event, {
        createdByEmail: users.findById(event.created_by)?.email ?? "—",
        assigneeUsers,
        assigneeRoles,
        responses: events.listResponses(id),
        myResponse: events.responseOf(id, user.id),
        isAssignee,
        // Creator or assignee may edit — the same set that may view.
        canEdit: event.created_by === user.id || isAssignee,
      })
    );
  });

  // Edit form
  router.get("/events/:id/edit", ({ user, params }: RouteContext) => {
    if (!can(user, EVENTS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const event = events.get(id);
    if (!event || !events.canView(user.id, user.role, id)) return notFound();
    return html(eventEditPage(user, event, formValuesOf(event), userChoices()));
  });

  // Update — HTMX PUT from the edit form; success redirects to the detail page.
  router.put("/events/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, EVENTS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const existing = events.get(id);
    if (!existing || !events.canView(user.id, user.role, id)) return notFound();

    const { input, errors } = parseEventForm(
      await req.formData(),
      validUserIds()
    );
    if (Object.keys(errors).length > 0) {
      return html(
        eventEditFormCard(existing, toFormValues(input), userChoices(), errors),
        400
      );
    }
    events.update(id, input);
    return html("", 200, { "HX-Redirect": `/events/${id}` });
  });

  // Delete — creator or assignee only; navigate back to the list.
  router.delete("/events/:id", ({ user, params }: RouteContext) => {
    if (!can(user, EVENTS_MODULE, "delete")) return forbidden();
    const id = Number(params.id);
    const event = events.get(id);
    if (!event || !events.canView(user.id, user.role, id)) return notFound();
    events.delete(id);
    return html("", 200, { "HX-Redirect": "/events" });
  });

  // Personal response — any viewer may accept/decline; returns the panel.
  router.post("/events/:id/response", async ({ req, user, params }: RouteContext) => {
    const id = Number(params.id);
    const event = events.get(id);
    if (!event || !events.canView(user.id, user.role, id)) return notFound();
    const value = String((await req.formData()).get("response") ?? "");
    if (value !== "accepted" && value !== "declined") {
      return html(eventResponsePanel(id, events.responseOf(id, user.id)), 400);
    }
    events.setResponse(id, user.id, value);
    return html(eventResponsePanel(id, value));
  });
}
