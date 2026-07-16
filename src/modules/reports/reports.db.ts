import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";
import type { ChartType } from "./reports.rules.ts";

/** A saved report as stored in SQLite. Shared org-wide (no per-user scoping). */
export interface Report {
  id: number;
  title: string;
  /** The natural-language request that produced the query (kept for context). */
  prompt: string;
  /** The read-only SELECT that powers the report (re-validated on every run). */
  sql: string;
  chart_type: ChartType;
  /** JSON string: { labelColumn, valueColumns } — how to map columns to a chart. */
  config: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** Normalized shape used when creating/updating a report. */
export interface ReportInput {
  title: string;
  prompt: string;
  sql: string;
  chartType: ChartType;
  /** Serialized {@link ReportConfig} (see reports.rules.ts). */
  config: string;
}

/** Query inputs for the reports list: search + paging. */
export interface ReportListParams extends PageParams {}

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    sql TEXT NOT NULL,
    chart_type TEXT NOT NULL DEFAULT 'table',
    config TEXT NOT NULL DEFAULT '{}',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reports_creator ON reports(created_by);
`);

/** Data access for saved reports. Shared org-wide; created_by is audit-only. */
export class ReportRepository extends Repository {
  /** One page of reports, newest first. Free-text search matches title/prompt. */
  list(params: ReportListParams = {}): Page<Report> {
    return this.paginate<Report>({
      from: "reports",
      searchColumns: ["title", "prompt"],
      q: params.q,
      orderBy: "id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Report | null {
    return this.db
      .query<Report, [number]>("SELECT * FROM reports WHERE id = ?")
      .get(id);
  }

  create(input: ReportInput, createdBy: number): Report {
    const row = this.db
      .query<Report, [string, string, string, string, string, number]>(
        `INSERT INTO reports (title, prompt, sql, chart_type, config, created_by)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        input.title,
        input.prompt,
        input.sql,
        input.chartType,
        input.config,
        createdBy
      );
    if (!row) throw new Error("Failed to create report");
    return row;
  }

  update(id: number, input: ReportInput): Report | null {
    return this.db
      .query<Report, [string, string, string, string, string, number]>(
        `UPDATE reports
            SET title = ?, prompt = ?, sql = ?, chart_type = ?, config = ?,
                updated_at = datetime('now')
          WHERE id = ? RETURNING *`
      )
      .get(
        input.title,
        input.prompt,
        input.sql,
        input.chartType,
        input.config,
        id
      );
  }

  delete(id: number): void {
    this.db.query<void, [number]>("DELETE FROM reports WHERE id = ?").run(id);
  }
}
