/**
 * Barrel for the shared UI components. Import building blocks from one place
 * instead of reaching into each file:
 *
 *   import { page, card, button, table } from "../../components/index.ts";
 *
 * Component-to-component imports (e.g. `page.ts` using `nav.ts`, or components
 * using `escapeHtml` from `layout.ts`) should keep importing directly from the
 * source file to avoid circular re-export chains through this barrel.
 */
export * from "./badge.ts";
export * from "./button.ts";
export * from "./calendar.ts";
export * from "./card.ts";
export * from "./feedback.ts";
export * from "./form.ts";
export * from "./layout.ts";
export * from "./nav.ts";
export * from "./page.ts";
export * from "./status-map.ts";
export * from "./table.ts";
