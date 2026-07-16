/**
 * Natural-language → SQL for the reports feature. Reuses the shared DeepSeek
 * client to translate a user's request into a single read-only SELECT plus a
 * suggested chart type and column mapping. The model is only ever told about
 * the tables the user may read (via `schemaContextFor`), so it cannot propose a
 * query over data the user isn't allowed to see; the result is still validated
 * and executed read-only before anything is shown or saved.
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { deepseek } from "../../core/llm.ts";
import type { User } from "../../auth/auth.db.ts";
import { schemaContextFor } from "./reports.catalog.ts";
import { CHART_TYPES, isChartType, type ChartType } from "./reports.rules.ts";

/** A proposed report the user can review, refine, preview and save. */
export interface GeneratedReport {
  title: string;
  sql: string;
  chartType: ChartType;
  labelColumn: string;
  valueColumns: string[];
  notes: string;
}

function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : ((part as { text?: string })?.text ?? "")
      )
      .join("");
  return String(content ?? "");
}

/** Pull a JSON object out of the model reply (tolerates ``` fences / prose). */
function extractJson(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1]! : trimmed).trim();
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start)
      return JSON.parse(candidate.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    throw new Error("La respuesta del modelo no fue un JSON válido.");
  }
}

function buildSystemPrompt(user: User): string {
  const today = new Date().toISOString().slice(0, 10);
  const schema = schemaContextFor(user);
  return `Eres un analista de datos experto en SQLite. Traduces peticiones en lenguaje natural a UNA consulta SQL de SOLO LECTURA para un ERP.

Fecha de hoy: ${today}.

## Esquema disponible (SOLO estas tablas y columnas)
${schema}

## Reglas de la consulta
- Dialecto SQLite. Genera UNA sola sentencia que empiece con SELECT o WITH.
- PROHIBIDO escribir o alterar datos (nada de INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/PRAGMA/ATTACH). Sin punto y coma final.
- Usa EXCLUSIVAMENTE las tablas y columnas listadas arriba. No inventes tablas ni columnas.
- Prefiere agregaciones (COUNT, SUM, AVG, GROUP BY) y ordena de forma útil. Limita a resultados razonables.
- Fechas: las columnas *_at son texto ISO; usa strftime('%Y-%m', col) para agrupar por mes, date(col) por día.

## Tipo de gráfica sugerido (elige uno)
- "table": filas crudas o detalle.
- "bar": comparar categorías (una columna de etiqueta + una o más numéricas).
- "line": tendencia en el tiempo (etiqueta temporal ordenada + numéricas).
- "pie": partes de un total (pocas categorías + una numérica).
- "kpi": un único número agregado.

## Formato de respuesta
Responde SOLO con un objeto JSON (sin texto adicional, sin markdown) con esta forma exacta:
{
  "title": "título corto del reporte",
  "sql": "la consulta SELECT",
  "chartType": "table|bar|line|pie|kpi",
  "labelColumn": "nombre de la columna de etiqueta/categoría o cadena vacía",
  "valueColumns": ["columnas numéricas a graficar"],
  "notes": "una frase explicando el reporte"
}
Los nombres en labelColumn y valueColumns deben coincidir EXACTAMENTE con los alias/columnas del SELECT.`;
}

/** Ask the model to turn `request` into a proposed report for `user`. */
export async function generateReport(
  user: User,
  request: string
): Promise<GeneratedReport> {
  const ai = await deepseek().invoke([
    new SystemMessage(buildSystemPrompt(user)),
    new HumanMessage(request),
  ]);
  const parsed = extractJson(contentToString(ai.content));

  const sql = String(parsed.sql ?? "").trim();
  if (!sql) throw new Error("El modelo no devolvió una consulta SQL.");

  const chartRaw = String(parsed.chartType ?? "table");
  const chartType: ChartType = isChartType(chartRaw) ? chartRaw : "table";

  const labelColumn =
    typeof parsed.labelColumn === "string" ? parsed.labelColumn : "";
  const valueColumns = Array.isArray(parsed.valueColumns)
    ? parsed.valueColumns.filter((c): c is string => typeof c === "string")
    : [];

  const title = String(parsed.title ?? "").trim() || request.slice(0, 80);
  const notes = String(parsed.notes ?? "").trim();

  return { title, sql, chartType, labelColumn, valueColumns, notes };
}

/** Re-export for convenience where a caller needs the valid chart types. */
export { CHART_TYPES };
