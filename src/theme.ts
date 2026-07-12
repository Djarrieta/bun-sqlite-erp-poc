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

  // Spacing scale (used for gaps, padding, and margins everywhere)
  space1: "0.25rem",
  space2: "0.5rem",
  space3: "0.75rem",
  space4: "1rem",
  space5: "1.5rem",
  space6: "2rem",
  space7: "2.5rem",

  // Form controls (inputs, selects, buttons) share one comfortable padding
  controlPadY: "0.6rem",
  controlPadX: "0.85rem",

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
    --space-1: ${theme.space1};
    --space-2: ${theme.space2};
    --space-3: ${theme.space3};
    --space-4: ${theme.space4};
    --space-5: ${theme.space5};
    --space-6: ${theme.space6};
    --space-7: ${theme.space7};
    --control-pad-y: ${theme.controlPadY};
    --control-pad-x: ${theme.controlPadX};
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
