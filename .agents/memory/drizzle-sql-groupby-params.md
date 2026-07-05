---
name: Drizzle raw SQL date_trunc/GROUP BY parameter binding
description: Postgres rejects a bound-parameter expression in SELECT as matching the "same" expression in GROUP BY/ORDER BY when using drizzle's sql`` template with a JS variable.
---

## The problem

When building a bucketed aggregation with drizzle's `sql` template literal, e.g.:

```ts
sql`date_trunc(${bucket}, ${table.col})` // in select
sql`date_trunc(${bucket}, ${table.col})` // in groupBy
```

drizzle binds `bucket` as a query parameter (`$1`, `$2`, ...) rather than inlining it. Postgres treats each `$n` placeholder as a syntactically distinct expression even when the runtime value is identical, so it fails with `column "..." must appear in the GROUP BY clause` — it can't prove the SELECT expression is functionally dependent on the GROUP BY expression.

**Why:** Postgres's GROUP BY functional-dependency check is syntactic, not value-based; parameterized placeholders defeat it even for read-only, non-string-interpolation-risk values like an enum-restricted bucket unit.

## How to apply

When a value going into `date_trunc`, or any expression that must match verbatim across SELECT/GROUP BY/ORDER BY, is restricted to a small fixed set (e.g. `"day" | "hour"`) validated in application code, build the expression once with `sql.raw(...)` and reuse the same `SQL` object in all three clauses:

```ts
const bucket = bucketParam === "hour" ? "hour" : "day"; // validated enum, not raw user string
const dateTruncExpr = sql.raw(`date_trunc('${bucket}', "table"."col")`);

db.select({ bucket: sql`${dateTruncExpr}` })
  .groupBy(dateTruncExpr)
  .orderBy(sql`${dateTruncExpr} asc`);
```

Never do this with a value that isn't validated against a fixed allowlist first — `sql.raw` performs no escaping.
