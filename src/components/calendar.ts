/**
 * A generic, HTMX-driven month/week calendar. The grid, agenda (mobile) and
 * toolbar live here; callers supply their own items plus two small callbacks —
 * `getDate` (which day an item lands on) and `renderItem` (how one item chip
 * looks) — so any module can render a calendar without duplicating the layout.
 *
 * Date math and localized names come from `core/dates.ts`; the structural CSS
 * (`.cal-*`) is centralized in `layout.ts` so HTMX fragments stay styled.
 */
import { escapeHtml } from "./layout.ts";
import {
  WEEKDAY_LABELS,
  addDays,
  addMonths,
  agendaDayLabel,
  isSameMonth,
  monthGrid,
  monthTitle,
  startOfWeekMonday,
  toISODate,
  weekDays,
  weekTitle,
} from "../core/dates.ts";

export type CalendarView = "month" | "week";

/** Narrow an untrusted query value to a `CalendarView`. */
export function isValidView(v: string | null | undefined): v is CalendarView {
  return v === "month" || v === "week";
}

/** ISO date window `[start, endExclusive)` covering the visible grid. */
export function rangeFor(
  view: CalendarView,
  anchor: Date
): { start: string; endExclusive: string } {
  if (view === "week") {
    const start = startOfWeekMonday(anchor);
    return {
      start: toISODate(start),
      endExclusive: toISODate(addDays(start, 7)),
    };
  }
  const weeks = monthGrid(anchor);
  const first = weeks[0]![0]!;
  const last = weeks[5]![6]!;
  return { start: toISODate(first), endExclusive: toISODate(addDays(last, 1)) };
}

/** ISO anchor for the previous month/week. */
export function prevAnchor(view: CalendarView, anchor: Date): string {
  return view === "week"
    ? toISODate(addDays(startOfWeekMonday(anchor), -7))
    : toISODate(addMonths(anchor, -1));
}

/** ISO anchor for the next month/week. */
export function nextAnchor(view: CalendarView, anchor: Date): string {
  return view === "week"
    ? toISODate(addDays(startOfWeekMonday(anchor), 7))
    : toISODate(addMonths(anchor, 1));
}

export interface CalendarLabels {
  /** Month-view toggle button. Default "Mes". */
  month?: string;
  /** Week-view toggle button. Default "Semana". */
  week?: string;
  /** "Jump to today" button. Default "Hoy". */
  today?: string;
  /** Overflow chip in a month cell. Default `(n) => "+n más"`. */
  more?: (n: number) => string;
  /** Empty mobile-agenda message. Default "No hay eventos este mes." */
  agendaEmpty?: string;
}

export interface CalendarOptions<T> {
  /** DOM id for the swappable region (HTMX target). Default "calendar". */
  id?: string;
  /** Base path for HTMX navigation, e.g. "/events/calendar". */
  endpoint: string;
  view: CalendarView;
  /** The day anchoring the visible period (local midnight). */
  anchor: Date;
  /** Items to place on the grid. */
  items: T[];
  /** The `YYYY-MM-DD` (or longer) date placing an item on the grid. */
  getDate: (item: T) => string;
  /** Render one item as a chip (should escape its own text). */
  renderItem: (item: T) => string;
  /** Optional link for a day's number / empty cell, e.g. a "new item" form. */
  dayHref?: (iso: string) => string;
  /** Tooltip for the day link. */
  dayTitle?: string;
  /** Max chips per month cell before an overflow link. Default 3. */
  maxPerDay?: number;
  labels?: CalendarLabels;
}

/** Group items by their day key (`YYYY-MM-DD`), preserving input order. */
function groupByDay<T>(
  items: T[],
  getDate: (item: T) => string
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const key = getDate(item).slice(0, 10);
    const list = byDay.get(key);
    if (list) list.push(item);
    else byDay.set(key, [item]);
  }
  return byDay;
}

/** A day label as a link (when `dayHref` is set) or plain text. */
function dayLink<T>(
  opts: CalendarOptions<T>,
  iso: string,
  inner: string,
  cls: string
): string {
  if (!opts.dayHref) return `<span class="${cls}">${inner}</span>`;
  const title = opts.dayTitle ? ` title="${escapeHtml(opts.dayTitle)}"` : "";
  return `<a class="${cls}" href="${opts.dayHref(iso)}"${title}>${inner}</a>`;
}

/** Placeholder for a week day with no items (an "add" link, or a muted dash). */
function emptyDay<T>(opts: CalendarOptions<T>, iso: string): string {
  if (!opts.dayHref) return `<span class="cal-empty">—</span>`;
  const title = opts.dayTitle ? ` title="${escapeHtml(opts.dayTitle)}"` : "";
  return `<a class="cal-empty" href="${opts.dayHref(iso)}"${title}>+</a>`;
}

/** Month grid: weekday headers + a 6×7 grid of day cells, plus the mobile agenda. */
function renderMonth<T>(opts: CalendarOptions<T>): string {
  const byDay = groupByDay(opts.items, opts.getDate);
  const today = toISODate(new Date());
  const max = opts.maxPerDay ?? 3;
  const moreLabel = opts.labels?.more ?? ((n: number) => `+${n} más`);

  const headers = WEEKDAY_LABELS.map(
    (l) => `<div class="cal-weekday">${l}</div>`
  ).join("");

  const cells = monthGrid(opts.anchor)
    .flat()
    .map((day) => {
      const iso = toISODate(day);
      const dayItems = byDay.get(iso) ?? [];
      const cls = [
        "cal-cell",
        isSameMonth(day, opts.anchor) ? "" : "cal-cell--muted",
        iso === today ? "cal-cell--today" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const shown = dayItems.slice(0, max).map(opts.renderItem).join("");
      const extra =
        dayItems.length > max
          ? `<a class="cal-more" href="${opts.endpoint}?view=week&date=${iso}">${escapeHtml(
              moreLabel(dayItems.length - max)
            )}</a>`
          : "";
      return `<div class="${cls}">
        <div class="cal-cell__head">
          ${dayLink(opts, iso, String(day.getDate()), "cal-daynum")}
        </div>
        <div class="cal-cell__events">${shown}${extra}</div>
      </div>`;
    })
    .join("");

  return `<div class="cal-weekdays">${headers}</div>
    <div class="cal-days">${cells}</div>
    ${renderMonthAgenda(opts, byDay)}`;
}

/**
 * Mobile month layout: a chronological agenda of the visible days that have
 * items (full width, no truncation). Hidden on wide screens via CSS. Grid days
 * are already in chronological order.
 */
function renderMonthAgenda<T>(
  opts: CalendarOptions<T>,
  byDay: Map<string, T[]>
): string {
  const today = toISODate(new Date());
  const days = monthGrid(opts.anchor)
    .flat()
    .filter((day) => byDay.has(toISODate(day)));

  const inner = days.length
    ? days
        .map((day) => {
          const iso = toISODate(day);
          const dayItems = byDay.get(iso) ?? [];
          const cls =
            iso === today
              ? "cal-agenda__day cal-agenda__day--today"
              : "cal-agenda__day";
          return `<div class="${cls}">
        ${dayLink(opts, iso, agendaDayLabel(day), "cal-agenda__head")}
        <div class="cal-agenda__events">${dayItems
          .map(opts.renderItem)
          .join("")}</div>
      </div>`;
        })
        .join("")
    : `<p class="muted">${escapeHtml(
        opts.labels?.agendaEmpty ?? "No hay eventos este mes."
      )}</p>`;

  return `<div class="cal-agenda">${inner}</div>`;
}

/** Week grid: seven day columns, each listing that day's items. */
function renderWeek<T>(opts: CalendarOptions<T>): string {
  const days = weekDays(opts.anchor);
  const byDay = groupByDay(opts.items, opts.getDate);
  const today = toISODate(new Date());

  const cols = days
    .map((day, i) => {
      const iso = toISODate(day);
      const dayItems = byDay.get(iso) ?? [];
      const cls = iso === today ? "cal-daycol cal-daycol--today" : "cal-daycol";
      const list = dayItems.length
        ? dayItems.map(opts.renderItem).join("")
        : emptyDay(opts, iso);
      return `<div class="${cls}">
        ${dayLink(opts, iso, `${WEEKDAY_LABELS[i]} ${day.getDate()}`, "cal-daycol__head")}
        <div class="cal-daycol__events">${list}</div>
      </div>`;
    })
    .join("");

  return `<div class="cal-week">${cols}</div>`;
}

/** The toolbar: prev/today/next, the period title, and the month/week toggle. */
function toolbar<T>(opts: CalendarOptions<T>): string {
  const { view, anchor, endpoint } = opts;
  const id = opts.id ?? "calendar";
  const title =
    view === "week" ? weekTitle(weekDays(anchor)) : monthTitle(anchor);
  const todayISO = toISODate(new Date());
  const anchorISO = toISODate(anchor);

  const navBtn = (date: string, label: string, aria: string): string =>
    `<button type="button" class="btn btn--secondary btn--sm" aria-label="${escapeHtml(aria)}"
      hx-get="${endpoint}?view=${view}&date=${date}" hx-target="#${id}"
      hx-swap="outerHTML" hx-push-url="true">${label}</button>`;

  const viewBtn = (v: CalendarView, label: string): string =>
    `<button type="button" class="btn ${
      v === view ? "btn--primary" : "btn--secondary"
    } btn--sm" hx-get="${endpoint}?view=${v}&date=${anchorISO}"
      hx-target="#${id}" hx-swap="outerHTML" hx-push-url="true">${escapeHtml(label)}</button>`;

  return `<div class="cal-toolbar">
    <div class="cal-nav">
      ${navBtn(prevAnchor(view, anchor), "←", "Anterior")}
      ${navBtn(todayISO, opts.labels?.today ?? "Hoy", "Hoy")}
      ${navBtn(nextAnchor(view, anchor), "→", "Siguiente")}
    </div>
    <h2 class="cal-title">${escapeHtml(title)}</h2>
    <div class="cal-views">
      ${viewBtn("month", opts.labels?.month ?? "Mes")}
      ${viewBtn("week", opts.labels?.week ?? "Semana")}
    </div>
  </div>`;
}

/**
 * The swappable calendar region (toolbar + grid), wrapped in `#<id>` so HTMX
 * navigation can replace it in place. Render this both on the full page and as
 * the fragment returned to HTMX nav so the two match.
 */
export function calendarRegion<T>(opts: CalendarOptions<T>): string {
  const id = opts.id ?? "calendar";
  const grid = opts.view === "week" ? renderWeek(opts) : renderMonth(opts);
  return `<div id="${id}" class="cal-region">
    ${toolbar(opts)}
    ${grid}
  </div>`;
}
