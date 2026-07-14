/**
 * A tiny factory for the label + badge-variant + options triple that nearly
 * every module repeats for a small, closed set of statuses (item status, event
 * status, movement kind, user role, …). Give it the localized labels and the
 * badge variants once and get back `badge(key)`, `label(key)` and `options`
 * (for `selectField` / data-table filters) that all stay in sync.
 */
import { badge, type BadgeVariant } from "./badge.ts";
import { escapeHtml } from "./layout.ts";
import type { SelectOption } from "./form.ts";

export interface StatusMap<K extends string> {
  /** Localized, pre-escaped badge for a key (unknown keys fall back to neutral). */
  badge: (key: K | string) => string;
  /** Localized label for a key (unknown keys fall back to the key itself). */
  label: (key: K | string) => string;
  /** `{ value, label }` options in key order, for selects and filters. */
  options: SelectOption[];
}

export interface StatusMapConfig<K extends string> {
  labels: Record<K, string>;
  variants: Record<K, BadgeVariant>;
  /** Key order for `options`. Defaults to the `labels` insertion order. */
  order?: readonly K[];
}

/** Build a reusable {@link StatusMap} from label + variant tables. */
export function statusMap<K extends string>(
  config: StatusMapConfig<K>
): StatusMap<K> {
  const labels = config.labels as Record<string, string>;
  const variants = config.variants as Record<string, BadgeVariant>;
  const order = config.order ?? (Object.keys(config.labels) as K[]);

  const label = (key: K | string): string => labels[key] ?? String(key);
  const variant = (key: K | string): BadgeVariant => variants[key] ?? "neutral";

  return {
    label,
    badge: (key) => badge(escapeHtml(label(key)), variant(key)),
    options: order.map((k) => ({ value: k, label: label(k) })),
  };
}
