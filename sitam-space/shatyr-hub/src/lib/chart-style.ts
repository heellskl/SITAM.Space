// Shared look for every recharts chart. Colours come from --viz-* tokens in styles.css (light + dark),
// so labels, numbers and tooltips always contrast with the background — never blue-on-blue.
import type { CSSProperties } from 'react';

export const VIZ = {
  bar: 'var(--viz-bar)',
  line: 'var(--viz-line)',
  grid: 'var(--viz-grid)',
  cursor: 'var(--viz-cursor)',
} as const;

const tick = { fill: 'var(--viz-text)', fontSize: 12, fontWeight: 500 };

/** Spread on <XAxis>/<YAxis>. */
export const axisProps = { tickLine: false, axisLine: false, tick } as const;

const content: CSSProperties = {
  background: 'var(--viz-tip-bg)', color: 'var(--viz-tip-text)', border: '1px solid var(--viz-tip-border)',
  borderRadius: 10, fontSize: 12.5, boxShadow: '0 8px 24px rgb(0 0 0 / 0.18)',
};
/** Spread on <Tooltip>: solid background; the year (label) and the value (item) use the text colour, not the series colour. */
export const tooltipProps = {
  contentStyle: content,
  labelStyle: { color: 'var(--viz-tip-text)', fontWeight: 700, marginBottom: 2 },
  itemStyle: { color: 'var(--viz-tip-text)' },
  cursor: { fill: 'var(--viz-cursor)' },
} as const;
