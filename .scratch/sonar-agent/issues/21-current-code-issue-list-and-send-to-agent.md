# 21: Current Code Issue List, Real-time Feed & Send to Agent

**What to build:** Wire the Current Code tab to `SonarLocalScanner` so that the tab populates with real-time SonarLint issue cards as the developer works. Each card is identical in layout to Overall Code drilldown cards, supports jump-to-file, single and batch Send-to-Agent dispatch (with server rule enrichment when connected, SonarLint message fallback when offline), and the tab shows contextual empty states.

**Blocked by:** 19, 20

**Status:** ready-for-agent

- [ ] `SonarOverviewViewProvider` registers `SonarLocalScanner.onDiagnosticsChanged()` when the Current Code tab becomes active; disposes the listener when switching to Overall Code or when the webview is hidden.
- [ ] Extension host posts `{ type: 'currentCodeItems', items: SonarDetailItem[] }` to the webview on each diagnostics change.
- [ ] Webview script renders issue cards in `#current-tab-panel` using the same card markup and CSS classes as the Overall Code drilldown (severity badge, category badge, rule ID, message, file path, line number).
- [ ] Clicking an issue card sends `openFile` message; extension host opens the file at the reported line via `FileNavigator`.
- [ ] **Empty state — SonarLint not installed:** friendly banner with **"Install SonarLint Extension"** button (`vscode.commands.executeCommand('workbench.extensions.installExtension', 'sonarsource.sonarlint-vscode')`) and a **"Run Full Scan via CLI"** secondary button.
- [ ] **Empty state — no issues:** green checkmark icon + *"No Sonar issues detected. Clean & ready!"* message.
- [ ] Sub-bar inside `#current-tab-panel` shows source label (`Source: SonarLint (Live)` or `Source: SonarScanner`) and a **"Run Full Scan"** button.
- [ ] Each issue card has a **"Send to Agent"** button; clicking sends `sendToAgent` message with the `SonarDetailItem`. Extension host calls `AgentDispatcher.dispatchIssue(item)`, fetching rule docs from server if a connection is active, falling back to SonarLint message otherwise.
- [ ] Each issue card has a checkbox; selecting multiple reveals a batch action bar **"Send X Issues to Agent"** that calls `AgentDispatcher.dispatchBatch(items)`.
- [ ] Build, typecheck, lint, and tests all pass.
