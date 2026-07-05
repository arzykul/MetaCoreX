/** Shared recharts styling constants for PoU analytics charts (dashboard, leaderboard, agent profile). */

export const CHART_COLORS = {
  primary: "#0055FF",
  primaryRgb: "0, 85, 255",
  axis: "#6B7280",
  grid: "#E5E7EB",
  label: "#1A1A1A",
} as const;

export const CHART_TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#FFFFFF", border: `1px solid ${CHART_COLORS.grid}`, borderRadius: "8px" },
  labelStyle: { color: CHART_COLORS.label },
} as const;

export const CHART_AXIS_PROPS = {
  stroke: CHART_COLORS.axis,
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;
