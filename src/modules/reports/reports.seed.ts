import { ReportRepository, type ReportInput } from "./reports.db.ts";
import { UserRepository } from "../../auth/auth.db.ts";
import { serializeReportConfig, type ChartType } from "./reports.rules.ts";

interface Sample {
  title: string;
  prompt: string;
  sql: string;
  chartType: ChartType;
  labelColumn: string;
  valueColumns: string[];
}

/** A few shared example reports so the module isn't empty on a fresh install. */
const SAMPLES: Sample[] = [
  {
    title: "Artículos por estado",
    prompt: "Cuántos artículos hay en cada estado",
    sql: "SELECT status AS estado, COUNT(*) AS total FROM items GROUP BY status ORDER BY total DESC",
    chartType: "bar",
    labelColumn: "estado",
    valueColumns: ["total"],
  },
  {
    title: "Existencias por ubicación",
    prompt: "Unidades en inventario por ubicación",
    sql: `SELECT l.name AS ubicacion, SUM(inv.quantity) AS unidades
          FROM inventory inv
          JOIN locations l ON l.id = inv.location_id
          GROUP BY l.id
          ORDER BY unidades DESC`,
    chartType: "bar",
    labelColumn: "ubicacion",
    valueColumns: ["unidades"],
  },
  {
    title: "Proyectos por estado",
    prompt: "Distribución de proyectos por estado",
    sql: "SELECT status AS estado, COUNT(*) AS total FROM projects GROUP BY status ORDER BY total DESC",
    chartType: "pie",
    labelColumn: "estado",
    valueColumns: ["total"],
  },
];

/**
 * Seed a handful of shared reports. Idempotent: skips when any report exists.
 * Reports are org-wide, so they are attributed to the first user (audit-only).
 */
export function seedReports(): void {
  const reports = new ReportRepository();
  if (reports.list().total > 0) {
    console.log("   reports: already seeded, skipping");
    return;
  }
  const owner = new UserRepository().list()[0];
  if (!owner) {
    console.log("   reports: no users found, skipping");
    return;
  }
  for (const s of SAMPLES) {
    const input: ReportInput = {
      title: s.title,
      prompt: s.prompt,
      sql: s.sql,
      chartType: s.chartType,
      config: serializeReportConfig({
        labelColumn: s.labelColumn,
        valueColumns: s.valueColumns,
      }),
    };
    reports.create(input, owner.id);
  }
  console.log(`   reports: seeded ${SAMPLES.length} report(s)`);
}
