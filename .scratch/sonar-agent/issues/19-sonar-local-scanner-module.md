# 19: SonarLocalScanner Module — SonarLint Seam

**What to build:** Introduce the new deep module `SonarLocalScanner` that encapsulates all local issue detection behind a small interface. The module handles SonarLint installation detection, aggregation of VS Code diagnostics from the `sonarlint` source, a change-listener subscription, mapping of `vscode.Diagnostic` to `SonarDetailItem`, and spawning of a `sonar-scanner` / `npx sonar-scanner` child process. All VS Code API access and process spawning stays inside this module.

**Blocked by:** 18

**Status:** ready-for-agent

- [ ] Create `SonarLocalScanner` with the following public interface:
  - `isSonarLintInstalled()` — returns `true` if `sonarsource.sonarlint-vscode` is installed and active.
  - `getLocalDiagnostics()` — returns all workspace diagnostics whose `source` contains `'sonar'` (case-insensitive), converted to `SonarDetailItem[]`.
  - `onDiagnosticsChanged(callback)` — subscribes to `vscode.languages.onDidChangeDiagnostics`, filters to Sonar sources, and calls `callback(items: SonarDetailItem[])`. Returns a `Disposable`.
  - `runCliScan(workspaceRoot)` — spawns `sonar-scanner` (PATH) or falls back to `npx sonar-scanner`; logs stdout/stderr to Logger; resolves with `{ ok: boolean, errorMessage?: string }`.
- [ ] Mapping from `vscode.Diagnostic` to `SonarDetailItem`: `ruleKey` from `diagnostic.code`, `line` = `range.start.line + 1`, `severity` from `DiagnosticSeverity`, `filePath` as workspace-relative path, `source = 'sonarlint'`.
- [ ] Unit tests for `isSonarLintInstalled()`, `getLocalDiagnostics()` filtering, diagnostic mapping correctness, and `runCliScan()` binary resolution using injected mocks.
- [ ] Build, typecheck, lint, and tests all pass.
