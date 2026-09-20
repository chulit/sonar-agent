# 23: CLI Scan Binding Passthrough

**What to build:** Pass the active connection binding (`sonar.projectKey`, `sonar.host.url`, `SONAR_TOKEN` env) to the `sonar-scanner` child process so **Run Full Scan** works even when the workspace has no `sonar-project.properties`. Fixes `You must define the following mandatory properties: sonar.projectKey, sonar.organization` on SonarQube targets.

**Blocked by:** 19

**Status:** ready-for-agent

- [x] `SonarLocalScanner.runCliScan(workspaceRoot, binding?)` accepts optional `{ serverUrl?, projectKey?, token? }` and appends `-Dsonar.projectKey=` / `-Dsonar.host.url=` args when present.
- [x] Token travels via `SONAR_TOKEN` child-process env only — never in CLI args, logs, or webview messages.
- [x] `SonarOverviewViewProvider.handleRunCliScan()` resolves the active binding from `ProjectDetector` and passes it through; scanner failures without a binding behave as before.
- [x] Unit tests verify args/env passthrough, token absence from args, and no-binding fallback.
- [x] Build, typecheck, lint, and tests all pass.
