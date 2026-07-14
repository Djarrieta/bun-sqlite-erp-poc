/**
 * Framework-agnostic date helpers: Spanish month/weekday names, calendar-grid
 * math (Monday-first weeks, local time) and small display formatters. No HTML
 * lives here — components render these values. Dates are handled in the
 * server's local time, matching how stored `YYYY-MM-DDTHH:MM` values (from
 * `datetime-local`) are read back.
 */

export const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const MONTHS_ES_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/** Weekday column headers, Monday-first. */
export const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Drop the time part, returning local midnight of the same day. */
export function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse a `YYYY-MM-DD` anchor into a local Date; falls back to today. */
export function parseAnchor(dateStr?: string | null): Date {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y!, m! - 1, d!);
    if (!Number.isNaN(dt.getTime())) return atMidnight(dt);
  }
  return atMidnight(new Date());
}

/** Format a Date as a local `YYYY-MM-DD` string. */
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** First day of the month `n` months from `d` (day-of-month reset to 1). */
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Monday of the week containing `d`. */
export function startOfWeekMonday(d: Date): Date {
  const dow = d.getDay(); // 0=Sun … 6=Sat
  const backToMonday = (dow + 6) % 7;
  return addDays(atMidnight(d), -backToMonday);
}

/** Whether `d` falls in the same month+year as `ref`. */
export function isSameMonth(d: Date, ref: Date): boolean {
  return (
    d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  );
}

/** A 6×7 matrix of days (Mon–Sun rows) covering `anchor`'s month. */
export function monthGrid(anchor: Date): Date[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  let cursor = startOfWeekMonday(first);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** The seven days (Mon–Sun) of the week containing `anchor`. */
export function weekDays(anchor: Date): Date[] {
  const start = startOfWeekMonday(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Full-month title, e.g. "Julio 2026". */
export function monthTitle(anchor: Date): string {
  return `${MONTHS_ES[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

/** Week-range title, e.g. "13–19 Jul 2026" (or spanning months/years). */
export function weekTitle(days: Date[]): string {
  const a = days[0]!;
  const b = days[6]!;
  const aM = MONTHS_ES_SHORT[a.getMonth()];
  const bM = MONTHS_ES_SHORT[b.getMonth()];
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getDate()} ${aM} ${a.getFullYear()} – ${b.getDate()} ${bM} ${b.getFullYear()}`;
  }
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()} ${aM} – ${b.getDate()} ${bM} ${b.getFullYear()}`;
  }
  return `${a.getDate()}–${b.getDate()} ${aM} ${b.getFullYear()}`;
}

/** Weekday label (Monday-first) for a Date, e.g. "Lun". */
export function weekdayLabel(d: Date): string {
  return WEEKDAY_LABELS[(d.getDay() + 6) % 7]!;
}

/** Agenda row label, e.g. "Lun 14 Jul". */
export function agendaDayLabel(d: Date): string {
  return `${weekdayLabel(d)} ${d.getDate()} ${MONTHS_ES_SHORT[d.getMonth()]}`;
}

// --- Display formatters -----------------------------------------------------
// These operate on stored strings (`YYYY-MM-DD` / `YYYY-MM-DDTHH:MM`), not
// Date objects, and never touch HTML, so their output is safe to interpolate.

/** Date part `YYYY-MM-DD` of a stored value (empty → ""). */
export function formatDate(value: string): string {
  return (value ?? "").slice(0, 10);
}

/** `HH:MM` time part of a stored `YYYY-MM-DDTHH:MM[...]` value (empty → ""). */
export function formatTime(value: string): string {
  return (value.split("T")[1] ?? "").slice(0, 5);
}

/** Render a stored datetime as "YYYY-MM-DD · HH:MM" (date-only when no time; "—" when empty). */
export function formatDateTime(value: string): string {
  if (!value) return "—";
  const [date, time = ""] = value.split("T");
  const hm = time.slice(0, 5);
  return hm ? `${date} · ${hm}` : date;
}
