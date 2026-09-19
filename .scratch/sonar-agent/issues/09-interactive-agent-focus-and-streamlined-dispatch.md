# 09: Interactive Agent Focus & Streamlined Dispatch

**What to build:** Dispatching an issue (single or batch) to an agent without a direct chat-query API (Antigravity Agent, Cline, Roo Code, Continue) executes the agent's focus/open command in VS Code (if available), copies the formatted Fix Prompt to the clipboard, opens the file at the problem line, and shows a tailored notification prompting the user to paste.

**Blocked by:** 08: Dynamic Agent Discovery & Reactive Selector UI

**Status:** ready-for-agent

- [x] Target agents define their corresponding focus/activation command IDs (e.g., Cline, Roo Code, Continue, Antigravity).
- [x] `AgentDispatcher.dispatch()` attempts to execute the target agent's focus command when targeting that agent.
- [x] Dispatching copies the enriched prompt to the clipboard and navigates to the target file and line.
- [x] GitHub Copilot continues to invoke `workbench.action.chat.open` with the pre-filled `{ query: prompt }`.
- [x] Informational toast notification confirms the prompt is ready on the clipboard specifically naming the targeted agent.
- [x] Unit tests verify dispatch command execution and clipboard fallback behavior for newly supported agents.
