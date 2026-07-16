import type { User } from "../../auth/auth.db.ts";
import {
  escapeHtml,
  alert,
  badge,
  table,
  dataTable,
  dataTableBody,
  type DataTableOptions,
  page,
  pageHeader,
  backLink,
  card,
  textField,
  textareaField,
  selectField,
  chipGroup,
  formActions,
  button,
  linkButton,
  savedIndicator,
  readOnlyNote,
} from "../../components/index.ts";
import type { Page } from "../../core/repository.ts";
import { can } from "../../core/permissions.ts";
import { MAX_REPORT_ROWS, type QueryResult } from "../../core/readonly-sql.ts";
import type { Report } from "./reports.db.ts";
import {
  REPORTS_MODULE,
  CHART_TYPES,
  CHART_TYPE_LABELS,
  parseReportConfig,
  type ChartType,
  type ReportConfig,
} from "./reports.rules.ts";

/** Self-hosted Chart.js, loaded only on pages that render a chart. */
export const CHART_JS_TAG = `<script src="/vendor/chart.umd.min.js"></script>`;

/** A working report the editor renders (new draft or a saved report). */
export interface ReportDraft {
  title: string;
  prompt: string;
  sql: string;
  chartType: ChartType;
  config: ReportConfig;
}

/** Build an editor draft from a stored report. */
export function reportDraftFromReport(report: Report): ReportDraft {
  return {
    title: report.title,
    prompt: report.prompt,
    sql: report.sql,
    chartType: report.chart_type,
    config: parseReportConfig(report.config),
  };
}

const CHART_TYPE_OPTIONS = CHART_TYPES.map((t) => ({
  value: t,
  label: CHART_TYPE_LABELS[t],
}));

/** Small badge naming a report's chart type. */
export function chartTypeBadge(type: ChartType): string {
  return badge(CHART_TYPE_LABELS[type] ?? type, "info");
}

// ---------------------------------------------------------------------------
// Result → chart mapping
// ---------------------------------------------------------------------------

interface Mapping {
  labelColumn: string;
  valueColumns: string[];
}

interface ChartData {
  labels: string[];
  datasets: { label: string; data: number[] }[];
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Columns whose every value is numeric (safe to plot). */
function numericColumns(result: QueryResult): string[] {
  if (result.rows.length === 0) return [];
  return result.columns.filter((col) =>
    result.rows.every((r) => r[col] === null || typeof r[col] === "number")
  );
}

/** Resolve which columns to chart, honoring the saved config then inferring. */
function resolveMapping(result: QueryResult, config: ReportConfig): Mapping {
  const cols = result.columns;
  const nums = numericColumns(result);

  let labelColumn =
    config.labelColumn && cols.includes(config.labelColumn)
      ? config.labelColumn
      : "";
  if (!labelColumn)
    labelColumn = cols.find((c) => !nums.includes(c)) ?? cols[0] ?? "";

  let valueColumns = config.valueColumns.filter(
    (c) => cols.includes(c) && nums.includes(c)
  );
  if (valueColumns.length === 0)
    valueColumns = nums.filter((c) => c !== labelColumn);

  return { labelColumn, valueColumns };
}

function chartData(result: QueryResult, mapping: Mapping): ChartData {
  const labels = result.rows.map((r) => formatCell(r[mapping.labelColumn]));
  const datasets = mapping.valueColumns.map((col) => ({
    label: col,
    data: result.rows.map((r) => Number(r[col] ?? 0)),
  }));
  return { labels, datasets };
}

function kpiValue(result: QueryResult, mapping: Mapping): string {
  const col = mapping.valueColumns[0];
  if (col && result.rows.length) return formatCell(result.rows[0]![col]);
  if (result.columns.length === 1 && result.rows.length)
    return formatCell(result.rows[0]![result.columns[0]!]);
  return String(result.rows.length);
}

/** JSON safe to embed inside a `<script>` (neutralizes `</script>`). */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

// ---------------------------------------------------------------------------
// Output rendering (chart / KPI / table)
// ---------------------------------------------------------------------------

function dataPreviewTable(result: QueryResult): string {
  if (result.columns.length === 0)
    return `<p class="muted">La consulta no devolvió columnas.</p>`;
  const shown = result.rows.slice(0, 100);
  const columns = result.columns.map((col) => ({
    header: col,
    cell: (row: Record<string, unknown>) => escapeHtml(formatCell(row[col])),
  }));
  const note =
    result.rows.length > shown.length
      ? `<p class="muted">Mostrando ${shown.length} de ${result.rows.length} filas.</p>`
      : "";
  return table({ columns, rows: shown, empty: "Sin resultados." }) + note;
}

function chartCanvas(
  canvasId: string,
  chartType: ChartType,
  data: ChartData
): string {
  const js = `(function(){
  var el=document.getElementById(${JSON.stringify(canvasId)});
  if(!el||!window.Chart)return;
  var ex=window.Chart.getChart(el); if(ex)ex.destroy();
  // Theme tokens use CSS light-dark(), so read the RESOLVED color off a probe
  // element (canvas can't parse "light-dark(...)" and would fall back to black).
  var probe=document.createElement('span');
  probe.style.cssText='position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden';
  document.body.appendChild(probe);
  function resolve(n,f){probe.style.color='';probe.style.color='var('+n+')';var c=getComputedStyle(probe).color;return c||f;}
  var P=['--accent','--success','--warning','--danger','--accent-text','--text-muted'].map(function(n){return resolve(n,'#3b82f6');});
  var grid=resolve('--border','rgba(128,128,128,0.2)'), tick=resolve('--text-muted','#888888');
  document.body.removeChild(probe);
  var payload=${jsonForScript(data)};
  var type=${JSON.stringify(chartType)};
  var isPie=(type==='pie');
  var single=(payload.datasets.length===1);
  var datasets=payload.datasets.map(function(d,i){
    if(isPie||(type==='bar'&&single)){return {label:d.label,data:d.data,backgroundColor:payload.labels.map(function(_,j){return P[j%P.length];}),borderColor:isPie?'transparent':undefined,borderWidth:1};}
    var col=P[i%P.length];
    return {label:d.label,data:d.data,backgroundColor:col,borderColor:col,borderWidth:2,fill:false,tension:0.25,pointRadius:2};
  });
  new window.Chart(el,{type:type,data:{labels:payload.labels,datasets:datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:(isPie||datasets.length>1),labels:{color:tick}}},scales:isPie?undefined:{x:{ticks:{color:tick},grid:{color:grid}},y:{beginAtZero:true,ticks:{color:tick},grid:{color:grid}}}}});
})();`;
  return `<div class="report-chart"><canvas id="${escapeHtml(
    canvasId
  )}"></canvas></div><script>${js}</script>`;
}

/** Render the visualization for a result: chart, KPI, or a plain table. */
function reportOutput(
  result: QueryResult,
  chartType: ChartType,
  mapping: Mapping,
  canvasId: string
): string {
  if (chartType === "kpi") {
    const caption = mapping.valueColumns[0] ?? result.columns[0] ?? "";
    return `<div class="report-kpi">${escapeHtml(
      kpiValue(result, mapping)
    )}</div><div class="report-kpi__caption">${escapeHtml(caption)}</div>`;
  }
  if (chartType === "table") return dataPreviewTable(result);

  const data = chartData(result, mapping);
  if (data.labels.length === 0 || data.datasets.length === 0)
    return (
      alert(
        "No hay datos numéricos para graficar. Ajusta el mapeo de columnas o el tipo de gráfica.",
        "warning"
      ) + dataPreviewTable(result)
    );
  return chartCanvas(canvasId, chartType, data) + dataPreviewTable(result);
}

function mappingControls(result: QueryResult, mapping: Mapping): string {
  const labelOptions = [
    { value: "", label: "(ninguna)" },
    ...result.columns.map((c) => ({ value: c, label: c })),
  ];
  const numeric = numericColumns(result);
  const label = selectField({
    name: "label_column",
    label: "Etiqueta (categoría / eje X)",
    options: labelOptions,
    value: mapping.labelColumn,
  });
  const values = chipGroup({
    legend: "Valores numéricos",
    name: "value_columns",
    options: numeric.map((c) => ({ value: c, label: c })),
    values: mapping.valueColumns,
    empty: "No hay columnas numéricas.",
  });
  return `<div id="report-mapping" class="report-mapping" hx-post="/reports/preview" hx-include="closest form" hx-target="#report-preview" hx-swap="innerHTML" hx-trigger="change">${label}${values}</div>`;
}

/**
 * Inner HTML for `#report-preview`: optional mapping controls + the chart/table.
 * Shows an error banner when the query was rejected, or a hint when empty.
 */
export function reportPreviewInner(
  result: QueryResult | null,
  error: string | null,
  chartType: ChartType,
  config: ReportConfig,
  canvasId = "report-preview-chart"
): string {
  if (error) return alert(error, "error");
  if (!result)
    return `<p class="muted">Genera una consulta con IA, o escríbela y pulsa Previsualizar.</p>`;
  const mapping = resolveMapping(result, config);
  const trunc = result.truncated
    ? alert(`Se muestran las primeras ${MAX_REPORT_ROWS} filas.`, "warning")
    : "";
  const controls = chartType === "table" ? "" : mappingControls(result, mapping);
  return `${controls}${trunc}${reportOutput(result, chartType, mapping, canvasId)}`;
}

// ---------------------------------------------------------------------------
// Editor form (used by builder, generate, save-error and detail edit)
// ---------------------------------------------------------------------------

export interface EditorOptions {
  /** Where "Guardar" submits. */
  action: { method: "post" | "put"; url: string };
  /** Pre-rendered inner HTML for the `#report-preview` container. */
  preview: string;
  errors?: Record<string, string>;
  saved?: boolean;
}

/** The `<form id="report-form">` with fields, actions and a live preview. */
export function reportEditorForm(draft: ReportDraft, opts: EditorOptions): string {
  const errors = opts.errors ?? {};
  const hxPreview =
    'hx-post="/reports/preview" hx-include="closest form" hx-target="#report-preview" hx-swap="innerHTML"';
  const saveVerb = opts.action.method === "put" ? "hx-put" : "hx-post";
  const hxSave = `${saveVerb}="${opts.action.url}" hx-include="closest form" hx-target="#report-form" hx-swap="outerHTML"`;

  const body = `
    ${textField({
      name: "title",
      label: "Título",
      value: draft.title,
      required: true,
      autocomplete: "off",
      attrs: 'maxlength="120"',
      error: errors.title,
    })}
    <input type="hidden" name="prompt" value="${escapeHtml(draft.prompt)}" />
    ${textareaField({
      name: "sql",
      label: "Consulta SQL (solo lectura)",
      value: draft.sql,
      rows: 6,
      hint: "Solo SELECT sobre los datos que puedes ver.",
      attrs: 'spellcheck="false" style="font-family:var(--font-mono)"',
      error: errors.sql,
    })}
    ${selectField({
      name: "chart_type",
      label: "Tipo de gráfica",
      options: CHART_TYPE_OPTIONS,
      value: draft.chartType,
      attrs: `${hxPreview} hx-trigger="change"`,
    })}
    ${formActions(
      button({
        label: "Previsualizar",
        variant: "secondary",
        type: "button",
        attrs: hxPreview,
      }),
      button({ label: "Guardar", type: "button", attrs: hxSave }),
      savedIndicator(!!opts.saved)
    )}
    <div id="report-preview" class="report-preview">${opts.preview}</div>`;

  return card(body, {
    as: "form",
    attrs: 'id="report-form" onsubmit="return false"',
  });
}

// ---------------------------------------------------------------------------
// Builder page (/reports/new)
// ---------------------------------------------------------------------------

const EMPTY_DRAFT: ReportDraft = {
  title: "",
  prompt: "",
  sql: "",
  chartType: "table",
  config: { labelColumn: "", valueColumns: [] },
};

/** Full "new report" page: an AI prompt box above the editor form. */
export function reportBuilderPage(user: User): string {
  const generateCard = card(`
    ${textareaField({
      name: "prompt",
      id: "report-prompt",
      label: "Pídelo en lenguaje natural",
      rows: 3,
      placeholder: "Ej: total de artículos activos por estado",
    })}
    ${formActions(
      button({
        label: "Generar con IA",
        type: "button",
        attrs:
          'hx-post="/reports/generate" hx-include="#report-prompt" hx-target="#report-form" hx-swap="outerHTML" hx-indicator="#report-form"',
      })
    )}`);

  const editor = reportEditorForm(EMPTY_DRAFT, {
    action: { method: "post", url: "/reports" },
    preview: reportPreviewInner(null, null, "table", EMPTY_DRAFT.config),
  });

  const body = `
  ${backLink("/reports", "← Volver a reportes")}
  ${pageHeader("Nuevo reporte", {
    eyebrow: "Reportes",
    subtitle:
      "Describe lo que quieres ver; la IA propone la consulta y la gráfica. Puedes refinar el SQL antes de guardar.",
  })}
  ${generateCard}
  ${editor}`;

  return page({
    user,
    current: "/reports",
    title: "Nuevo reporte",
    body,
    maxWidth: "860px",
    scripts: CHART_JS_TAG,
    pageStyles: REPORT_STYLES,
  });
}

// ---------------------------------------------------------------------------
// List page + results fragment
// ---------------------------------------------------------------------------

/** Search text driving the reports list. */
export interface ReportFilters {
  q: string;
}

function reportsTableOptions(
  result: Page<Report>,
  filters: ReportFilters
): DataTableOptions<Report> {
  return {
    id: "reports",
    endpoint: "/reports",
    columns: [
      {
        header: "Título",
        cell: (r) => escapeHtml(r.title),
        primary: true,
      },
      {
        header: "Gráfica",
        cell: (r) => chartTypeBadge(r.chart_type),
        width: "120px",
      },
      {
        header: "Creado",
        cell: (r) => escapeHtml(r.created_at.slice(0, 10)),
        width: "130px",
      },
    ],
    rows: result.rows,
    rowHref: (r) => `/reports/${r.id}`,
    empty: filters.q
      ? "Ningún reporte coincide con la búsqueda."
      : "No hay reportes todavía.",
    search: { value: filters.q, placeholder: "Buscar reportes..." },
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  };
}

/** Full list page: searchable, paginated table of saved reports. */
export function reportsListPage(
  result: Page<Report>,
  filters: ReportFilters,
  user: User
): string {
  const actions = can(user, REPORTS_MODULE, "create")
    ? linkButton({ label: "+ Nuevo", href: "/reports/new" })
    : "";
  const body = `
  ${pageHeader("Reportes", { eyebrow: "Análisis", actions })}
  ${dataTable(reportsTableOptions(result, filters))}`;
  return page({ user, current: "/reports", title: "Reportes", body });
}

/** The swappable results fragment returned to HTMX search/paging. */
export function reportsResults(
  result: Page<Report>,
  filters: ReportFilters
): string {
  return dataTableBody(reportsTableOptions(result, filters));
}

// ---------------------------------------------------------------------------
// Detail page (/reports/:id)
// ---------------------------------------------------------------------------

/**
 * Report detail. Authors/admins get the full editor (refine + save + delete);
 * everyone else gets the read-only visualization. `preview` is the rendered
 * `#report-preview` inner HTML (or the standalone output for read-only).
 */
export function reportDetailPage(
  report: Report,
  user: User,
  preview: string,
  canManage: boolean
): string {
  const draft = reportDraftFromReport(report);

  const deleteBtn = canManage
    ? button({
        label: "Eliminar",
        variant: "danger",
        type: "button",
        attrs: `hx-delete="/reports/${report.id}" hx-confirm="¿Eliminar este reporte? Esta acción no se puede deshacer." hx-swap="none"`,
      })
    : "";

  const main = canManage
    ? reportEditorForm(draft, {
        action: { method: "put", url: `/reports/${report.id}` },
        preview,
      })
    : `${readOnlyNote(false)}${card(
        `<div id="report-preview" class="report-preview">${preview}</div>`
      )}`;

  const body = `
  ${backLink("/reports", "← Volver a reportes")}
  ${pageHeader(escapeHtml(report.title), {
    eyebrow: "Reporte",
    actions: `${chartTypeBadge(report.chart_type)}${deleteBtn}`,
  })}
  ${main}`;

  return page({
    user,
    current: "/reports",
    title: report.title,
    body,
    maxWidth: "860px",
    scripts: CHART_JS_TAG,
    pageStyles: REPORT_STYLES,
  });
}

/** Module-specific styles (chart frame, KPI number, mapping row). */
export const REPORT_STYLES = `
  .report-preview { margin-top: var(--space-5); }
  .report-chart { position: relative; height: 340px; margin: var(--space-4) 0; }
  .report-kpi { font-family: var(--font-display); font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); letter-spacing: -0.02em; }
  .report-kpi__caption { color: var(--text-muted); font-size: var(--font-size-sm); }
  .report-mapping { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-start; margin-bottom: var(--space-4); }
  .report-mapping > .field { margin: 0; min-width: 200px; }
`;
