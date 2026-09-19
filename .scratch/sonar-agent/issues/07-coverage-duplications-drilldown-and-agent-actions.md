# 07: Coverage & Duplications Drilldown with Specialized Agent Actions

**What to build:** Specialized drilldown views and AI agent actions for the Coverage and Duplications metric cards. Clicking the Coverage card queries `/api/measures/component_tree` for files with uncovered lines and provides a "Send to Agent (Generate Tests)" action. Clicking the Duplications card queries for components with duplicate blocks and provides a "Send to Agent (Refactor Duplications)" action to help extract reusable helpers or functions.

**Blocked by:** 05: Rule Enrichment Engine & Single-Issue "Send to Agent"

**Status:** ready-for-agent

- [ ] Clicking the Coverage card queries `/api/measures/component_tree` with metric `uncovered_lines` and lists files sorted by uncovered line count.
- [ ] Each coverage item includes a "Send to Agent" button that generates a prompt directing the AI agent to write comprehensive unit tests covering the missing lines.
- [ ] Clicking the Duplications card queries for components with `duplicated_lines_density` and lists files with duplicate code blocks.
- [ ] Each duplication item includes a "Send to Agent" button that prompts the AI agent to refactor and extract duplicate logic into a shared helper/utility.
- [ ] Dispatching uses the same Target Agent selector with chat command or clipboard fallback.
