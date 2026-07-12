/**
 * Centralized theme tokens and the `:root` CSS variables derived from them.
 * This is the single source of truth for the app's look. Change values here to
 * re-skin everything; components must reference the exposed CSS custom
 * properties (e.g. `var(--accent)`) and never hardcode colors of their own.
 */

/** Design tokens. Exposed as CSS custom properties by `themeVars()`. */
export const theme = {
  colorScheme: "light dark",

  // Typography
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  fontSizeXs: "0.85rem",
  fontSizeSm: "0.9rem",
  fontSizeBase: "1rem",
  fontSizeLg: "1.25rem",
  fontSizeXl: "2rem",
  fontWeightNormal: "400",
  fontWeightMedium: "500",
  fontWeightBold: "700",
  lineHeight: "1.5",
  lineHeightTight: "1",

  // Shape
  radius: "8px",
  radiusFull: "50%",

  // Color — brand
  accent: "#4f46e5",
  accentHover: "#4338ca",
  onAccent: "#ffffff",

  // Color — semantic status (used by badges, notices, inline feedback)
  success: "#22c55e",
  successText: "#16a34a",
  warning: "#f59e0b",
  danger: "#ef4444",

  // Color — surfaces / borders
  border: "#8884",
  borderStrong: "#8888",
  borderFaint: "#8882",
} as const;

/** Renders the theme tokens as a `:root` block of CSS custom properties. */
export function themeVars(): string {
  return `:root {
    color-scheme: ${theme.colorScheme};
    --font-family: ${theme.fontFamily};
    --font-size-xs: ${theme.fontSizeXs};
    --font-size-sm: ${theme.fontSizeSm};
    --font-size-base: ${theme.fontSizeBase};
    --font-size-lg: ${theme.fontSizeLg};
    --font-size-xl: ${theme.fontSizeXl};
    --font-weight-normal: ${theme.fontWeightNormal};
    --font-weight-medium: ${theme.fontWeightMedium};
    --font-weight-bold: ${theme.fontWeightBold};
    --line-height: ${theme.lineHeight};
    --line-height-tight: ${theme.lineHeightTight};
    --radius: ${theme.radius};
    --radius-full: ${theme.radiusFull};
    --accent: ${theme.accent};
    --accent-hover: ${theme.accentHover};
    --on-accent: ${theme.onAccent};
    --success: ${theme.success};
    --success-text: ${theme.successText};
    --warning: ${theme.warning};
    --danger: ${theme.danger};
    --border: ${theme.border};
    --border-strong: ${theme.borderStrong};
    --border-faint: ${theme.borderFaint};
  }`;
}
