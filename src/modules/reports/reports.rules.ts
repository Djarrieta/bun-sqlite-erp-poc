import type { ModulePermissions } from "../../core/permissions.ts";
import type { User } from "../../auth/auth.db.ts";
import type { Report, ReportInput } from "./reports.db.ts";

/** Permission key for this module (used across views and routes). */
export const REPORTS_MODULE = "reports";

/** Chart types a report can be displayed as. */
export type ChartType = "table" | "bar" | "line" | "pie" | "kpi";

/** All chart types, in display order. */
export const CHART_TYPES: readonly ChartType[] = [
  "table",
  "bar",
  "line",
  "pie",
  "kpi",
];

/** Human labels for each chart type (for selects + badges). */
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  table: "Tabla",
  bar: "Barras",
  line: "Líneas",
  pie: "Pastel",
  kpi: "KPI (número)",
};

export function isChartType(value: string): value is ChartType {
  return (CHART_TYPES as readonly string[]).includes(value);
}

/**
 * Business rules: reports are available to everyone, but the read-only SQL
 * engine restricts each user to the data their `view` permissions allow, so the
 * matrix here is permissive. Editing/deleting a shared report is further gated
 * to its author or an admin by `canManageReport`.
 */
export const REPORT_PERMISSIONS: ModulePermissions = {
  admin: ["view", "create", "read", "update", "delete"],
  sales: ["view", "create", "read", "update", "delete"],
  financial: ["view", "create", "read", "update", "delete"],
  engineer: ["view", "create", "read", "update", "delete"],
  logistic: ["view", "create", "read", "update", "delete"],
  member: ["view", "create", "read", "update", "delete"],
};

/** Whether `user` may edit or delete a specific saved report. */
export function canManageReport(user: User, report: Report): boolean {
  return user.role === "admin" || report.created_by === user.id;
}

/** How a result set maps onto a chart. */
export interface ReportConfig {
  /** Column used as the category/x-axis (empty for none). */
  labelColumn: string;
  /** Numeric columns plotted as series (or the KPI metric). */
  valueColumns: string[];
}

/** Safely parse a stored config JSON string, tolerating bad/empty input. */
export function parseReportConfig(raw: string): ReportConfig {
  try {
    const o = JSON.parse(raw || "{}") as Record<string, unknown>;
    const labelColumn = typeof o.labelColumn === "string" ? o.labelColumn : "";
    const valueColumns = Array.isArray(o.valueColumns)
      ? o.valueColumns.filter((c): c is string => typeof c === "string")
      : [];
    return { labelColumn, valueColumns };
  } catch {
    return { labelColumn: "", valueColumns: [] };
  }
}

/** Serialize a config for storage. */
export function serializeReportConfig(cfg: ReportConfig): string {
  return JSON.stringify({
    labelColumn: cfg.labelColumn ?? "",
    valueColumns: cfg.valueColumns ?? [],
  });
}

export interface ParsedReportForm {
  input: ReportInput;
  errors: Record<string, string>;
}

/**
 * Parse and validate raw report form data. The SQL string is validated for
 * read-only safety separately, at execution time, against the viewer's allowed
 * tables (see `src/core/readonly-sql.ts`).
 */
export function parseReportForm(form: FormData): ParsedReportForm {
  const title = String(form.get("title") ?? "").trim();
  const prompt = String(form.get("prompt") ?? "").trim();
  const sql = String(form.get("sql") ?? "").trim();
  const chartRaw = String(form.get("chart_type") ?? "table");
  const chartType: ChartType = isChartType(chartRaw) ? chartRaw : "table";
  const labelColumn = String(form.get("label_column") ?? "").trim();
  const valueColumns = form
    .getAll("value_columns")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const errors: Record<string, string> = {};
  if (!title) errors.title = "El título es obligatorio.";
  else if (title.length > 120)
    errors.title = "El título no puede superar 120 caracteres.";
  if (!sql) errors.sql = "La consulta SQL es obligatoria.";

  return {
    input: {
      title,
      prompt,
      sql,
      chartType,
      config: serializeReportConfig({ labelColumn, valueColumns }),
    },
    errors,
  };
}
