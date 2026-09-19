# 04: Issues List Drilldown & Local File Navigation ("Jump to Code")

**What to build:** Interactive drilldown from metric cards to a list of issues or security hotspots matching the SonarQube web UI. Clicking Reliability, Maintainability, Security, or Hotspots cards queries `/api/issues/search` or `/api/hotspots/search` and renders cards displaying file paths, issue message, severity, category badges, tags, line number, and effort estimate. Clicking an issue card immediately opens the local source file in VS Code and positions the editor cursor at the exact reported line, with automated fallback path resolution for monorepos or prefixed paths.

**Blocked by:** 03: Overall Code Metrics Dashboard with Container Queries

**Status:** ready-for-agent

- [ ] Clicking on a metric card filters the view and fetches issues via `/api/issues/search` or hotspots via `/api/hotspots/search`.
- [ ] Issue items are rendered as cards matching SonarQube's visual structure (checkbox, issue message, severity badges, effort estimate, tags, line number).
- [ ] Clicking on an issue card triggers `vscode.workspace.openTextDocument` and `vscode.window.showTextDocument` to navigate directly to the target line.
- [ ] Path resolver handles relative paths against the workspace root and falls back to `vscode.workspace.findFiles` when component paths include repository or module prefixes.
- [ ] Clear empty state and error indicators when no issues match or when network requests fail.
