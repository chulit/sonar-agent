# Current Code Tab — Design Specification

**Date:** 2026-09-20
**Status:** Draft

---

## Problem Statement

Developers using Sonar Agent can inspect Overall Code metrics pulled from a remote SonarQube server, but have no way to see whether their current local edits or uncommitted code introduce Sonar issues *before* pushing to CI or running a full server scan. The result is a slow feedback loop: issues are discovered only after a full sonar-scanner run lands on the server, not at the moment code is written.

---

## Solution

Add a **Current Code** tab to the Sonar Agent sidebar webview. The tab surfaces Sonar issues detected in the local workspace using two complementary sources:

1. **SonarLint (default, real-time)** — reads diagnostics published by the `sonarsource.sonarlint-vscode` extension via the VS Code Diagnostics API. Requires SonarLint to be installed. Updates automatically as the developer edits files.
2. **SonarScanner CLI (on-demand, full-project)** — executes `sonar-scanner` (or `npx sonar-scanner`) as a background process and fetches the refreshed issue list from the SonarQube server after scan completion.

The feature can be fully disabled via an extension setting. When disabled, the tab is hidden and all background listeners are unregistered.

---

## User Stories

1. As a developer, I want a **Current Code** tab next to **Overall Code** in the sidebar header so that I can switch between server-side metrics and local issue detection without leaving the extension.
2. As a developer, I want the **Current Code** tab badge to show the live count of detected issues `(N)` so that I can glance at the tab header and immediately know whether my local changes have any problems.
3. As a developer, I want the **Current Code** tab to default to the SonarLint source so that I get instant, real-time feedback as I type without manual intervention.
4. As a developer, I want to be able to change the issue source (SonarLint vs SonarScanner CLI) via VS Code Settings (`sonarAgent.currentCode.source`) so that I can opt into the full-project scan mode if I need broader coverage.
5. As a developer, I want to disable the **Current Code** feature entirely via VS Code Settings (`sonarAgent.currentCode.enabled: false`) so that I can keep the sidebar minimal if I prefer not to use local scanning.
6. As a developer, I want to see a friendly banner with a one-click **"Install SonarLint Extension"** button when I select the SonarLint source but `sonarsource.sonarlint-vscode` is not installed, so that I can get set up without leaving VS Code.
7. As a developer, I want the banner to also offer a **"Run Full Scan via CLI"** alternative when SonarLint is not installed, so that I have an immediate option even without SonarLint.
8. As a developer, I want each issue card in **Current Code** to display the same information as Overall Code cards — severity badge, category badge, rule ID, issue message, file path, and line number — so that the experience is consistent and familiar.
9. As a developer, I want to click on an issue card in **Current Code** to jump to the exact file and line in the editor, so that I can immediately inspect and fix the code.
10. As a developer, I want a **"Send to Agent"** button on each issue card in **Current Code** so that I can dispatch an AI Fix Prompt directly from the local issue without switching tabs.
11. As a developer, I want checkboxes on each issue card and a batch action bar (**"Send X Issues to Agent"**) in **Current Code** so that I can batch-dispatch multiple local issues to my AI agent in one action.
12. As a developer, I want the Fix Prompt for a **Current Code** issue to include the official Sonar rule documentation fetched from my connected SonarQube server when a connection is active, so that the AI agent has full remediation context.
13. As a developer, I want the Fix Prompt to fall back gracefully to the SonarLint diagnostic message and local code snippet when no server connection is configured, so that dispatching still works offline.
14. As a developer, I want a sub-bar in the **Current Code** tab showing the current source label (e.g., `Source: SonarLint (Live)` or `Source: SonarScanner`) and a **"Run Full Scan"** button, so that I can trigger a CLI scan at any time without opening settings.
15. As a developer, I want a progress indicator in the VS Code Status Bar (e.g., `$(sync~spin) Sonar Agent: Scanning…`) while the SonarScanner CLI runs in the background, so that I know the scan is in progress without the editor freezing.
16. As a developer, I want the issue list to refresh automatically after a SonarScanner CLI run completes, so that I see updated results immediately.
17. As a developer, I want a **"Clean"** empty state with a green checkmark icon when no issues are detected in the Current Code tab, so that I get positive confirmation that my local code is issue-free.
18. As a developer, I want the **Current Code** tab to display issues from the entire workspace (all files the project contains, not just open editors), so that I can see the full scope of local issues even for files I haven't opened.
19. As a developer, I want the SonarLint real-time overlay to update the issue list as I save files, so that fixing an issue causes its card to disappear immediately from the list.

---

## Implementation Decisions

### 1. New Module: `SonarLocalScanner`

Introduce a new deep module `SonarLocalScanner` with a small public interface:

- `getSource()` — returns the currently configured source (`'sonarlint' | 'cli'`).
- `isSonarLintInstalled()` — checks whether `sonarsource.sonarlint-vscode` is installed and active via the VS Code Extensions API.
- `getLocalDiagnostics()` — aggregates all diagnostics across the workspace whose `source` property matches `'sonarlint'` (case-insensitive).
- `onDiagnosticsChanged(callback)` — subscribes to `vscode.languages.onDidChangeDiagnostics` and invokes `callback` with the updated merged diagnostics, filtering only Sonar sources. Returns a `Disposable`.
- `runCliScan(workspaceRoot, options)` — spawns `sonar-scanner` (resolved via PATH, or `npx sonar-scanner` as fallback) as a non-blocking child process, streams stderr/stdout to the Logger channel, and emits lifecycle events `onScanStart` / `onScanEnd(success: boolean)`.

This module hides all VS Code Diagnostics API access, process spawning, and source selection behind a single seam, keeping `SonarOverviewViewProvider` free of scanner implementation details.

### 2. Tab Switcher in `SonarOverviewViewProvider`

The existing connected-dashboard HTML gains a tab bar immediately below the Project & Target Agent selector card:

```
[ Overall Code ]   [ Current Code (N) ]
```

- Clicking a tab sends a `switchTab` message from the webview to the extension host.
- The extension host responds with a `tabState` message that includes the active tab identifier.
- The webview script toggles visibility of `#overall-tab-panel` and `#current-tab-panel` accordingly.
- The badge `(N)` in the Current Code tab is updated whenever a `currentCodeCount` message is received.

### 3. Listener Lifecycle in `SonarOverviewViewProvider`

- When the **Current Code** tab becomes active: `SonarLocalScanner.onDiagnosticsChanged()` is registered; its disposable is stored.
- When the user switches back to **Overall Code** or the webview is hidden: the diagnostics listener disposable is removed.
- When `sonarAgent.currentCode.enabled` is `false`: no listener is ever registered and the tab bar is omitted from the HTML.

### 4. Data Flow: SonarLint → Issue Card

```
vscode.languages.onDidChangeDiagnostics
  → SonarLocalScanner.onDiagnosticsChanged callback
    → map vscode.Diagnostic → SonarDetailItem shape
    → postMessage { type: 'currentCodeItems', items: [...] }
      → webview renders issue cards (identical markup to Overall Code drilldown cards)
```

Mapping from `vscode.Diagnostic` to `SonarDetailItem`:
- `id` — URI + diagnostic range hash
- `ruleKey` — `diagnostic.code` (when object, use `.value`; raw string otherwise)
- `message` — `diagnostic.message`
- `filePath` — workspace-relative path derived from `diagnostic.uri`
- `line` — `diagnostic.range.start.line + 1`
- `severity` — mapped from `vscode.DiagnosticSeverity` (Error→BLOCKER, Warning→MAJOR, Information→MINOR, Hint→INFO)
- `type` — defaulted to `'CODE_SMELL'` with rule-prefix heuristics
- `source` — `'sonarlint'`

### 5. Fix Prompt Enrichment

`AgentDispatcher.dispatchDiagnostic()` already exists and handles the SonarLint code action flow. For the Current Code tab dispatch path:

- If a server connection is active, call `SonarClient.getEnrichedRule(ruleKey)` for documentation; fall back to the SonarLint message if that fails.
- The Fix Prompt shape remains identical to the Overall Code Fix Prompt (rule doc + code snippet ±10 lines + explicit action prompt).

### 6. CLI Runner Sub-flow

- **Trigger:** User clicks **"Run Full Scan"** → webview sends `runCliScan` message → extension host invokes `SonarLocalScanner.runCliScan()`.
- **Progress:** Status Bar message `$(sync~spin) Sonar Agent: Scanning…` for the scan duration, cleared on scan end.
- **On success:** Extension host calls `SonarClient.getIssues()` to fetch refreshed server data and posts `currentCodeItems` to the webview.
- **On failure:** Extension host posts an `error` message to the webview with the last stderr line.

### 7. Settings Schema

Two new settings in `package.json` `contributes.configuration`:

| Key | Type | Default | Description |
|---|---|---|---|
| `sonarAgent.currentCode.enabled` | boolean | `true` | Show the Current Code tab and enable local issue detection. |
| `sonarAgent.currentCode.source` | enum `'sonarlint' \| 'cli'` | `'sonarlint'` | Default source for Current Code issue detection. |

### 8. Empty States

| Condition | UI |
|---|---|
| SonarLint selected + not installed | Friendly banner: "Install SonarLint Extension" link + "Run Full Scan via CLI" button |
| SonarLint selected + no issues | Green checkmark: *"No Sonar issues detected. Clean & ready!"* |
| CLI selected + no scan run yet | Prompt card: *"Run a full scan to see issues."* + "Run Full Scan" button |
| CLI selected + scanning | Status bar spinner + loading overlay within tab |

---

## Testing Decisions

### What Makes a Good Test

Tests verify the public behavior of `SonarLocalScanner` through its module interface — they do not inspect internal VS Code API call sequences or child process internals. Inject VS Code adapters as dependencies for offline testing.

### Modules to Test

**`SonarLocalScanner`**:
- `isSonarLintInstalled()` returns `true` when the extensions mock includes `sonarsource.sonarlint-vscode`.
- `getLocalDiagnostics()` returns only diagnostics whose `source` contains `'sonar'` and omits diagnostics from other sources (e.g., `'eslint'`, `'typescript'`).
- `onDiagnosticsChanged()` invokes the callback when the diagnostics change event fires with a URI covered by the workspace.
- Mapping from `vscode.Diagnostic` to `SonarDetailItem` produces correct `ruleKey`, `line`, `severity`, and `filePath` for representative inputs.
- `runCliScan()` resolves the binary via PATH mock, spawns the process, and emits `onScanEnd(true)` when the process exits with code 0.

**`SonarOverviewViewProvider`** (existing test file):
- Posting `switchTab` with `tab: 'currentCode'` causes `currentCodeItems` sync to be requested.
- When `sonarAgent.currentCode.enabled` is `false`, no diagnostics listener is registered.

### Prior Art

Existing test seams in `test/WebviewProvider.test.ts` mock `postMessage` and assert outgoing message types — the same pattern applies for `currentCodeItems` messages.

---

## Out of Scope

- Displaying Code Coverage and Duplication metrics in the **Current Code** tab (SonarLint does not provide these locally).
- Inline annotations / gutter icons for Current Code issues (VS Code's native squiggles from SonarLint already cover this).
- Authenticated SonarLint Connected Mode setup (users configure SonarLint independently).
- Writing issue status back to SonarQube server (e.g., marking as "False Positive") from the Current Code tab.
- A filter bar in the **Current Code** tab (deferred; issue count is typically small for local changes).

---

## Further Notes

- `SonarCodeActionProvider` already integrates with SonarLint diagnostics via the VS Code code-actions lightbulb. `SonarLocalScanner` and `SonarCodeActionProvider` are independent consumers of the same VS Code Diagnostics stream — no deduplication needed.
- If `sonar-scanner` is not found on PATH and `npx` is also unavailable, the CLI scan button shows a contextual error: *"sonar-scanner not found. Install SonarQube Scanner CLI or ensure npx is available."*
- `SonarDetailItem` type reuse means existing `AgentDispatcher.dispatchIssue()` and batch dispatch paths work unchanged for Current Code items.
