# 08: Dynamic Agent Discovery & Reactive Selector UI

**What to build:** The sidebar's Target Agent dropdown dynamically discovers and lists only AI coding assistants actually installed or active in the user's environment (GitHub Copilot, Antigravity Agent, Cline, Roo Code, Continue) with "Clipboard Only" as a universal fallback. Dropdown selection automatically defaults to the highest-priority active assistant (`Copilot > Antigravity > Other Agent > Clipboard`).

**Blocked by:** 05: Rule Enrichment Engine & Single-Issue "Send to Agent"

**Status:** ready-for-agent

- [x] `AgentDispatcher` inspects installed extensions (`github.copilot` / `github.copilot-chat`, `anthropic.claude-code`, `saoudrizwan.claude-dev`, `rooveterinaryinc.roo-cline`, `continue.continue`) and environment (Antigravity IDE) to assemble the list of available agents.
- [x] `getAvailableAgents()` supports dependency-injected lookup functions for reliable, isolated unit testing.
- [x] "Clipboard Only" is always included as the final fallback option.
- [x] `SonarOverviewViewProvider._syncState()` transmits `availableAgents` to the Webview via `postMessage`.
- [x] Webview dynamically updates the `<select id="target-agent-dropdown">` options from the received agents array, preserving the active or prioritized default selection.
- [x] Unit tests verify dynamic agent filtering and priority ordering across clean module seams.
