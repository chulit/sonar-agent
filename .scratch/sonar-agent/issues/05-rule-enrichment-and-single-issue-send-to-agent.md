# 05: Rule Enrichment Engine & Single-Issue "Send to Agent"

**What to build:** An automated rule enrichment and agent dispatch mechanism for individual issues. Each issue card features a "Send to Agent" button. Clicking it fetches the comprehensive Sonar rule documentation (`/api/rules/show`), extracts a 10-line surrounding snippet of the local source code around the issue line, assembles an enriched Markdown Fix Prompt, and dispatches it to the user's selected Target Agent (GitHub Copilot, Antigravity, or Codex) via VS Code Chat API or automatic clipboard copy fallback.

**Blocked by:** 04: Issues List Drilldown & Local File Navigation ("Jump to Code")

**Status:** ready-for-agent

- [ ] Target Agent selector dropdown in the sidebar header with options for GitHub Copilot, Antigravity, and Codex, with default saved in settings.
- [ ] Clicking "Send to Agent" fetches rule details from `/api/rules/show` with in-memory caching for performance.
- [ ] AgentDispatcher extracts 10 lines of surrounding code from the local file around the issue line.
- [ ] Enriched Fix Prompt is assembled containing file path, line number, rule key, rule description, Sonar remediation recommendation, and source snippet.
- [ ] For GitHub Copilot, triggers `workbench.action.chat.open` with the pre-filled prompt query.
- [ ] For Antigravity, Codex, or missing chat commands, copies the formatted prompt to the clipboard and shows a toast notification with the target file opened.
