---
name: runTest navigation must include artifact base path
description: e2e test plans that navigate to bare "/" can silently hit unrelated content instead of the target artifact
---

When writing a `runTest` test plan for a path-routed artifact (e.g. one whose `previewPath` is `/some-artifact/`), always tell the test plan to navigate to that full prefixed path (e.g. `/some-artifact/`), not bare `/`.

**Why:** In at least one workspace, an unregistered legacy static file (`public/index.html` at the workspace root, predating the multi-artifact structure) was still being served at bare `/` by a fallback host process outside the artifact proxy config. A test plan that said "navigate to `/`" silently landed on that stray legacy page instead of the intended artifact, producing a confusing failure report (completely unrelated UI/branding) that looked like a regression but wasn't — the real app was fine.

**How to apply:** When authoring `runTest` test plans for any artifact using path-based routing, always spell out the full base path in both the testPlan steps and the `relevantTechnicalDocumentation`, e.g. "navigate to `/metacorex-site/`", and explicitly warn "do not navigate to bare `/`". If a test reports wildly unrelated content/branding, suspect a routing/base-path miss before assuming the app code regressed — check what's actually served at the literal path the test used via `curl localhost:80/<path>`.
