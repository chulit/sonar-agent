# 22: CLI Runner — Full Project Scan via sonar-scanner

**What to build:** When the user clicks **"Run Full Scan"** in the Current Code sub-bar, the extension spawns `sonar-scanner` (or falls back to `npx sonar-scanner`) in the background without blocking the editor. A VS Code Status Bar spinner indicates progress. On completion the Current Code issue list refreshes automatically from the SonarQube server. Failures surface as a clear inline error without crashing the extension.

**Blocked by:** 19

**Status:** ready-for-agent

- [x] Webview sends `{ command: 'runCliScan' }` when the **"Run Full Scan"** button is clicked.
- [x] Extension host handles `runCliScan` message: calls `SonarLocalScanner.runCliScan(workspaceRoot)`.
- [x] While the scan runs, extension host shows a VS Code Status Bar item `$(sync~spin) Sonar Agent: Scanning…`; clears it on scan end.
- [x] Extension host posts `{ type: 'scanStatus', scanning: true/false }` to the webview; webview shows/hides a loading overlay inside `#current-tab-panel`.
- [x] On scan success (`ok: true`): extension host calls `SonarClient.getIssues(projectKey)` and posts `{ type: 'currentCodeItems', items }` to the webview.
- [x] On scan failure (`ok: false`): extension host posts `{ type: 'error', message: errorMessage }` to the webview; webview renders an inline error card with the last stderr line.
- [x] If `sonar-scanner` binary is not found on PATH and `npx` is unavailable, `runCliScan()` resolves with `{ ok: false, errorMessage: 'sonar-scanner not found. Install SonarQube Scanner CLI or ensure npx is available.' }`.
- [x] Build, typecheck, lint, and tests all pass.
