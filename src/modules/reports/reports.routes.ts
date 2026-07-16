import { html, notFound, forbidden } from "../../core/http.ts";
import type { Router } from "../../core/router.ts";
import type { User } from "../../auth/auth.db.ts";
import { can } from "../../core/permissions.ts";
import {
  assertReadableSql,
  runReportQuery,
  SqlValidationError,
  type QueryResult,
} from "../../core/readonly-sql.ts";
import { ReportRepository, type ReportInput } from "./reports.db.ts";
import { reportableTablesFor } from "./reports.catalog.ts";
import { generateReport } from "./reports.ai.ts";
import {
  REPORTS_MODULE,
  canManageReport,
  parseReportForm,
  parseReportConfig,
  isChartType,
  type ChartType,
  type ReportConfig,
} from "./reports.rules.ts";
import {
  reportsListPage,
  reportsResults,
  reportBuilderPage,
  reportEditorForm,
  reportPreviewInner,
  reportDetailPage,
  type ReportDraft,
  type ReportFilters,
} from "./reports.views.ts";

/** Run a report query as `user`, mapping validation failures to a message. */
function runForUser(
  user: User,
  sql: string
): { result: QueryResult | null; error: string | null } {
  try {
    return { result: runReportQuery(sql, reportableTablesFor(user)), error: null };
  } catch (err) {
    if (err instanceof SqlValidationError) return { result: null, error: err.message };
    return { result: null, error: "No se pudo ejecutar la consulta." };
  }
}

/** Validate a SQL string for read-only safety; returns an error message or null. */
function validateSql(user: User, sql: string): string | null {
  try {
    assertReadableSql(sql, reportableTablesFor(user));
    return null;
  } catch (err) {
    return err instanceof SqlValidationError ? err.message : "Consulta no válida.";
  }
}

function chartTypeFrom(form: FormData): ChartType {
  const raw = String(form.get("chart_type") ?? "table");
  return isChartType(raw) ? raw : "table";
}

function configFrom(form: FormData): ReportConfig {
  const labelColumn = String(form.get("label_column") ?? "").trim();
  const valueColumns = form
    .getAll("value_columns")
    .map((v) => String(v).trim())
    .filter(Boolean);
  return { labelColumn, valueColumns };
}

function draftFromInput(input: ReportInput): ReportDraft {
  return {
    title: input.title,
    prompt: input.prompt,
    sql: input.sql,
    chartType: input.chartType,
    config: parseReportConfig(input.config),
  };
}

/** Turn a generation failure into a friendly, user-facing message. */
function generationError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/DEEPSEEK_API_KEY/i.test(msg))
    return "La generación con IA no está configurada (falta DEEPSEEK_API_KEY).";
  return `No se pudo generar el reporte: ${msg}`;
}

export function registerReportRoutes(router: Router): void {
  const reports = new ReportRepository();

  // --- List (full page or HTMX results fragment) ----------------------
  router.get("/reports", ({ req, url, user }) => {
    if (!can(user, REPORTS_MODULE, "view")) return forbidden();
    const q = (url.searchParams.get("q") ?? "").trim();
    const pageNum = Number(url.searchParams.get("page") ?? "1");
    const result = reports.list({ q, page: pageNum });
    const filters: ReportFilters = { q };
    if (req.headers.get("HX-Request"))
      return html(reportsResults(result, filters));
    return html(reportsListPage(result, filters, user));
  });

  // --- Builder (registered before "/reports/:id") ---------------------
  router.get("/reports/new", ({ user }) => {
    if (!can(user, REPORTS_MODULE, "create")) return forbidden();
    return html(reportBuilderPage(user));
  });

  // --- Generate SQL from natural language (returns filled editor) -----
  router.post("/reports/generate", async ({ req, user }) => {
    if (!can(user, REPORTS_MODULE, "create")) return forbidden();
    const form = await req.formData();
    const prompt = String(form.get("prompt") ?? "").trim();
    const emptyConfig: ReportConfig = { labelColumn: "", valueColumns: [] };

    if (!prompt) {
      const draft: ReportDraft = {
        title: "",
        prompt: "",
        sql: "",
        chartType: "table",
        config: emptyConfig,
      };
      return html(
        reportEditorForm(draft, {
          action: { method: "post", url: "/reports" },
          preview: reportPreviewInner(
            null,
            "Escribe una petición para generar el reporte.",
            "table",
            emptyConfig
          ),
        })
      );
    }

    let draft: ReportDraft;
    try {
      const gen = await generateReport(user, prompt);
      draft = {
        title: gen.title,
        prompt,
        sql: gen.sql,
        chartType: gen.chartType,
        config: { labelColumn: gen.labelColumn, valueColumns: gen.valueColumns },
      };
    } catch (err) {
      const failed: ReportDraft = {
        title: "",
        prompt,
        sql: "",
        chartType: "table",
        config: emptyConfig,
      };
      return html(
        reportEditorForm(failed, {
          action: { method: "post", url: "/reports" },
          preview: reportPreviewInner(
            null,
            generationError(err),
            "table",
            emptyConfig
          ),
        })
      );
    }

    const { result, error } = runForUser(user, draft.sql);
    const preview = reportPreviewInner(result, error, draft.chartType, draft.config);
    return html(
      reportEditorForm(draft, {
        action: { method: "post", url: "/reports" },
        preview,
      })
    );
  });

  // --- Preview: validate + run, return the #report-preview inner ------
  router.post("/reports/preview", async ({ req, user }) => {
    if (!can(user, REPORTS_MODULE, "create") && !can(user, REPORTS_MODULE, "update"))
      return forbidden();
    const form = await req.formData();
    const sql = String(form.get("sql") ?? "").trim();
    const chartType = chartTypeFrom(form);
    const config = configFrom(form);
    if (!sql) return html(reportPreviewInner(null, null, chartType, config));
    const { result, error } = runForUser(user, sql);
    return html(reportPreviewInner(result, error, chartType, config));
  });

  // --- Save a new report ----------------------------------------------
  router.post("/reports", async ({ req, user }) => {
    if (!can(user, REPORTS_MODULE, "create")) return forbidden();
    const form = await req.formData();
    const { input, errors } = parseReportForm(form);
    const draft = draftFromInput(input);

    const sqlError = input.sql ? validateSql(user, input.sql) : null;
    if (sqlError) errors.sql = sqlError;

    if (Object.keys(errors).length > 0) {
      const { result, error } = input.sql
        ? runForUser(user, input.sql)
        : { result: null, error: null };
      const preview = reportPreviewInner(result, error, input.chartType, draft.config);
      return html(
        reportEditorForm(draft, {
          action: { method: "post", url: "/reports" },
          preview,
          errors,
        })
      );
    }

    const created = reports.create(input, user.id);
    return html("", 200, { "HX-Redirect": `/reports/${created.id}` });
  });

  // --- Detail ----------------------------------------------------------
  router.get("/reports/:id", ({ user, params }) => {
    if (!can(user, REPORTS_MODULE, "read")) return forbidden();
    const report = reports.get(Number(params.id));
    if (!report) return notFound();
    const config = parseReportConfig(report.config);
    const { result, error } = runForUser(user, report.sql);
    const preview = reportPreviewInner(result, error, report.chart_type, config);
    return html(
      reportDetailPage(report, user, preview, canManageReport(user, report))
    );
  });

  // --- Update (author or admin) ---------------------------------------
  router.put("/reports/:id", async ({ req, user, params }) => {
    if (!can(user, REPORTS_MODULE, "update")) return forbidden();
    const report = reports.get(Number(params.id));
    if (!report) return notFound();
    if (!canManageReport(user, report)) return forbidden();

    const form = await req.formData();
    const { input, errors } = parseReportForm(form);
    const draft = draftFromInput(input);
    const action = { method: "put" as const, url: `/reports/${report.id}` };

    const sqlError = input.sql ? validateSql(user, input.sql) : null;
    if (sqlError) errors.sql = sqlError;

    if (Object.keys(errors).length > 0) {
      const { result, error } = input.sql
        ? runForUser(user, input.sql)
        : { result: null, error: null };
      const preview = reportPreviewInner(result, error, input.chartType, draft.config);
      return html(reportEditorForm(draft, { action, preview, errors }));
    }

    reports.update(report.id, input);
    const { result, error } = runForUser(user, input.sql);
    const preview = reportPreviewInner(result, error, input.chartType, draft.config);
    return html(reportEditorForm(draft, { action, preview, saved: true }));
  });

  // --- Delete (author or admin) ---------------------------------------
  router.delete("/reports/:id", ({ user, params }) => {
    if (!can(user, REPORTS_MODULE, "delete")) return forbidden();
    const report = reports.get(Number(params.id));
    if (!report) return notFound();
    if (!canManageReport(user, report)) return forbidden();
    reports.delete(report.id);
    return html("", 200, { "HX-Redirect": "/reports" });
  });
}
