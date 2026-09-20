# 18: Current Code Settings & Feature Flag

**What to build:** Register two new VS Code settings — `sonarAgent.currentCode.enabled` (boolean, default `true`) and `sonarAgent.currentCode.source` (enum `'sonarlint' | 'cli'`, default `'sonarlint'`) — in `package.json`. When `enabled` is `false`, the Current Code tab bar is omitted entirely from the webview HTML and no background listeners are ever registered, keeping the sidebar minimal.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Add `sonarAgent.currentCode.enabled` (boolean, default `true`) to `package.json` `contributes.configuration`.
- [ ] Add `sonarAgent.currentCode.source` (enum `'sonarlint' | 'cli'`, default `'sonarlint'`) to `package.json` `contributes.configuration`.
- [ ] `SonarOverviewViewProvider` reads `sonarAgent.currentCode.enabled` at `resolveWebviewView` time and passes it as a flag to the HTML template.
- [ ] When `enabled = false`, the tab bar HTML is not rendered and no `onDidChangeDiagnostics` listener is registered.
- [ ] Build, typecheck, lint, and tests all pass.
