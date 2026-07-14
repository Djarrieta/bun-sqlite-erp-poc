/**
 * Fetches the self-hosted webfonts into `public/fonts/` so the app never
 * depends on a third-party font CDN at runtime (important for an internal ERP
 * that may run offline). Run once with `bun fonts`; the files are committed.
 *
 * Sources are Fontsource's variable-font woff2 files (one file per family
 * covers the whole weight axis, keeping the payload small). Re-run to refresh.
 */

interface FontFile {
  /** Destination filename under `public/fonts/`. */
  out: string;
  /** Fontsource CDN url for the variable (weight-axis) woff2. */
  url: string;
}

const FONTS: FontFile[] = [
  {
    out: "inter-latin-wght-normal.woff2",
    url: "https://cdn.jsdelivr.net/fontsource/fonts/inter:vf@latest/latin-wght-normal.woff2",
  },
  {
    out: "space-grotesk-latin-wght-normal.woff2",
    url: "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk:vf@latest/latin-wght-normal.woff2",
  },
  {
    out: "jetbrains-mono-latin-wght-normal.woff2",
    url: "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono:vf@latest/latin-wght-normal.woff2",
  },
];

const DEST = new URL("../../public/fonts/", import.meta.url);

// `Bun.write` creates the destination directory tree as needed.
const failures: string[] = [];

for (const font of FONTS) {
  const res = await fetch(font.url);
  if (!res.ok) {
    console.error(`✗ ${font.out}: ${res.status} ${res.statusText} (${font.url})`);
    failures.push(font.out);
    continue;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  await Bun.write(new URL(font.out, DEST), bytes);
  console.log(`✓ ${font.out} (${(bytes.byteLength / 1024).toFixed(1)} KB)`);
}

// Throw on any failure so `bun fonts` exits non-zero (no `process.exitCode`,
// which the minimal ambient `process` type in globals.d.ts doesn't declare).
if (failures.length > 0) {
  throw new Error(`Failed to download ${failures.length} font(s): ${failures.join(", ")}`);
}
