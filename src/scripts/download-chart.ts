/**
 * Fetches Chart.js into `public/vendor/` so the reports feature never depends on
 * a third-party CDN at runtime (important for an internal ERP that may run
 * offline). Run once with `bun charts`; the file is committed and served by
 * `index.ts` at `/vendor/chart.umd.min.js`. Re-run to refresh.
 *
 * The UMD build exposes a global `Chart` with every controller auto-registered.
 */
const OUT = "chart.umd.min.js";
const URL_SRC =
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.js";

const DEST = new URL("../../public/vendor/", import.meta.url);

const res = await fetch(URL_SRC);
if (!res.ok) {
  throw new Error(
    `Failed to download Chart.js: ${res.status} ${res.statusText} (${URL_SRC})`
  );
}
const bytes = new Uint8Array(await res.arrayBuffer());
// `Bun.write` creates the destination directory tree as needed.
await Bun.write(new URL(OUT, DEST), bytes);
console.log(`✓ ${OUT} (${(bytes.byteLength / 1024).toFixed(1)} KB)`);
