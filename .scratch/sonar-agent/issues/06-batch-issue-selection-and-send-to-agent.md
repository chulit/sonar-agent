# 06: Batch Issue Selection ("Send X Issues to Agent")

**What to build:** Multi-selection capability on issue cards allowing users to select several issues and dispatch a unified remediation request. Each card provides a functional checkbox, and a sticky batch action bar displays the count of selected issues with a "Send X Issues to Agent" action. When triggered, the issues are bundled grouped by file into a single structured Fix Prompt so the AI agent can remediate multiple issues in a single pass.

**Blocked by:** 05: Rule Enrichment Engine & Single-Issue "Send to Agent"

**Status:** ready-for-agent

- [x] Checkbox selection state managed across issue cards with "Select All" and "Clear Selection" options.
- [x] Sticky action bar appears at the bottom or top of the issue list when at least one issue is selected.
- [x] Clicking "Send X Issues to Agent" compiles all selected issues grouped by local file path.
- [x] Batch Fix Prompt presents each file's issues with line numbers, rule descriptions, and corresponding code contexts in an organized format.
- [x] Dispatches the batch prompt to the active Target Agent using the established chat or clipboard dispatch workflow.
