---
name: Recharts mixed series silently dropped
description: A series component that doesn't match its parent chart's type renders nothing and throws no error/warning.
---

Recharts chart containers (`AreaChart`, `BarChart`, `LineChart`, etc.) are generated with a fixed `GraphicalChild` type. A child series component that isn't that type — e.g. a `<Line>` inside `<AreaChart>`, or a `<Bar>` inside `<LineChart>` — is silently ignored. No console warning, no error, no visual glitch; the series simply never renders.

**Why:** This is easy to miss, especially with sparse data (a missing dashed moving-average line over 1-2 points looks identical to "not enough data to draw a line yet"). It was caught only via architect code review, not visual inspection.

**How to apply:** Whenever a chart needs more than one series type (e.g. an `Area` for the main value + a `Line` for a moving average/trend overlay), use `<ComposedChart>` instead of the single-type container. `ComposedChart` accepts `Area`, `Bar`, `Line`, and `Scatter` children together.
