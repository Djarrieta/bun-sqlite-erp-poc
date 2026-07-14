/**
 * Centralized theme tokens and the `:root` CSS variables derived from them.
 * This is the single source of truth for the app's look. Change values here to
 * re-skin everything; components must reference the exposed CSS custom
 * properties (e.g. `var(--accent)`) and never hardcode colors of their own.
 */

/** Design tokens. Exposed as CSS custom properties by `themeVars()`. */
export const theme = {
  colorScheme: "light dark",

  // Typography — a clean sans for prose/UI paired with a monospace used as the
  // "ledger" signature (IDs, roles, numeric columns, eyebrow labels).
  // The scale is anchored on a 1rem (16px) base: form controls inherit
  // `fontSizeBase`, and keeping it at 16px is what stops iOS Safari from
  // auto-zooming on focus — so this base must never drop below 1rem.
  fontFamily: `"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  // Display face for titles: a technical grotesk used with restraint (the one
  // deliberate type risk), distinct from the neutral body sans.
  fontDisplay: `"Space Grotesk", "Inter", system-ui, sans-serif`,
  // The "ledger" face: a chosen monospace (not whatever the OS ships) for IDs,
  // figures, roles and eyebrow labels — the app's numeric signature.
  fontMono: `"JetBrains Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace`,
  fontSize2xs: "0.72rem",
  fontSizeXs: "0.8rem",
  fontSizeSm: "0.9rem",
  fontSizeBase: "1rem",
  fontSizeLg: "1.2rem",
  fontSizeXl: "1.6rem",
  fontSize2xl: "2.25rem",
  fontWeightNormal: "400",
  fontWeightMedium: "500",
  fontWeightSemibold: "600",
  fontWeightBold: "700",
  lineHeight: "1.55",
  lineHeightTight: "1",
  letterSpacingWide: "0.08em",

  // Shape
  radiusSm: "6px",
  radius: "10px",
  radiusLg: "16px",
  radiusFull: "999px",

  // Spacing scale (used for gaps, padding, and margins everywhere)
  space1: "0.25rem",
  space2: "0.5rem",
  space3: "0.75rem",
  space4: "1rem",
  space5: "1.5rem",
  space6: "2rem",
  space7: "2.5rem",
  space8: "3.5rem",

  // Form controls (inputs, selects, buttons) share one comfortable padding
  controlPadY: "0.55rem",
  controlPadX: "0.8rem",

  // Layout frame
  sidebarWidth: "252px",
  contentMax: "1100px",

  // Color — brand accent: a teal "ink" (intentionally not the default indigo).
  // Each token adapts to the OS light/dark preference via CSS light-dark().
  accent: "light-dark(#0f766e, #13a89a)",
  accentHover: "light-dark(#0b5f58, #0f766e)",
  accentText: "light-dark(#0f766e, #5eead4)",
  onAccent: "#ffffff",

  // Color — surfaces & text
  bg: "light-dark(#f4f6f8, #0d1117)",
  surface: "light-dark(#ffffff, #161b22)",
  surfaceSunken: "light-dark(#eef1f4, #0b0e13)",
  surfaceRaised: "light-dark(#f8fafb, #1c232d)",
  text: "light-dark(#1a2330, #e6e9ee)",
  textMuted: "light-dark(#5b6675, #98a2b0)",

  // Color — semantic status (used by badges, notices, inline feedback)
  success: "light-dark(#16a34a, #34d399)",
  successText: "light-dark(#15803d, #34d399)",
  warning: "light-dark(#c2660c, #fbbf24)",
  danger: "light-dark(#dc2626, #f87171)",

  // Color — borders
  border: "light-dark(#e3e7ec, #262d38)",
  borderStrong: "light-dark(#cbd2db, #39424f)",
  borderFaint: "light-dark(#eef1f4, #1b222c)",

  // Elevation
  shadowSm: "light-dark(0 1px 2px rgba(16,24,40,0.06), 0 1px 2px rgba(0,0,0,0.4))",
  shadowMd:
    "light-dark(0 6px 20px -6px rgba(16,24,40,0.15), 0 6px 20px -6px rgba(0,0,0,0.55))",
} as const;

/** Renders the theme tokens as a `:root` block of CSS custom properties. */
export function themeVars(): string {
  return `:root {
    color-scheme: ${theme.colorScheme};
    --font-family: ${theme.fontFamily};
    --font-display: ${theme.fontDisplay};
    --font-mono: ${theme.fontMono};
    --font-size-2xs: ${theme.fontSize2xs};
    --font-size-xs: ${theme.fontSizeXs};
    --font-size-sm: ${theme.fontSizeSm};
    --font-size-base: ${theme.fontSizeBase};
    --font-size-lg: ${theme.fontSizeLg};
    --font-size-xl: ${theme.fontSizeXl};
    --font-size-2xl: ${theme.fontSize2xl};
    --font-weight-normal: ${theme.fontWeightNormal};
    --font-weight-medium: ${theme.fontWeightMedium};
    --font-weight-semibold: ${theme.fontWeightSemibold};
    --font-weight-bold: ${theme.fontWeightBold};
    --line-height: ${theme.lineHeight};
    --line-height-tight: ${theme.lineHeightTight};
    --letter-spacing-wide: ${theme.letterSpacingWide};
    --radius-sm: ${theme.radiusSm};
    --radius: ${theme.radius};
    --radius-lg: ${theme.radiusLg};
    --radius-full: ${theme.radiusFull};
    --space-1: ${theme.space1};
    --space-2: ${theme.space2};
    --space-3: ${theme.space3};
    --space-4: ${theme.space4};
    --space-5: ${theme.space5};
    --space-6: ${theme.space6};
    --space-7: ${theme.space7};
    --space-8: ${theme.space8};
    --control-pad-y: ${theme.controlPadY};
    --control-pad-x: ${theme.controlPadX};
    --sidebar-width: ${theme.sidebarWidth};
    --content-max: ${theme.contentMax};
    --accent: ${theme.accent};
    --accent-hover: ${theme.accentHover};
    --accent-text: ${theme.accentText};
    --on-accent: ${theme.onAccent};
    --bg: ${theme.bg};
    --surface: ${theme.surface};
    --surface-sunken: ${theme.surfaceSunken};
    --surface-raised: ${theme.surfaceRaised};
    --text: ${theme.text};
    --text-muted: ${theme.textMuted};
    --success: ${theme.success};
    --success-text: ${theme.successText};
    --warning: ${theme.warning};
    --danger: ${theme.danger};
    --border: ${theme.border};
    --border-strong: ${theme.borderStrong};
    --border-faint: ${theme.borderFaint};
    --shadow-sm: ${theme.shadowSm};
    --shadow-md: ${theme.shadowMd};
  }`;
}
