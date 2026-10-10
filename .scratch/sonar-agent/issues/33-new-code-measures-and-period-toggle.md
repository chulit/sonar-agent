# 33: New Code Measures & Period Toggle

**What to build:** Add an interactive segmented toggle `[Overall Code | New Code]` in the Server dashboard header. When the user switches to New Code, the extension queries SonarQube's `new_*` measures (`new_bugs`, `new_vulnerabilities`, `new_code_smells`, `new_coverage`, `new_duplicated_lines_density`), updates the Bento Health Rings and metrics grid in the sidebar, persists the active choice per workspace in `workspaceState`, and displays an informative indicator when zero new lines or no leak period activity is detected.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] Add segmented toggle HTML/CSS `[Overall Code | New Code]` in `SonarOverviewViewProvider` inside the Server tab header.
- [x] Add `SonarClient.getOverview(projectKey, codePeriod)` support for fetching `new_*` metric keys when `codePeriod === 'new'`.
- [x] Handle Webview message `{ command: 'switchCodePeriod', period: 'overall' | 'new' }` and persist state in `workspaceState`.
- [x] Update Bento Health Rings and metrics grid cards dynamically with `new_*` counts and ratings.
- [x] Render informative "No new code activity" zero-state/tooltip if new code period returns empty or 0 lines to cover.
- [x] Unit tests for `SonarClient` new code measures parsing, fallback handling, and Webview message passing.
- [x] Build, typecheck, lint, and tests all pass.
