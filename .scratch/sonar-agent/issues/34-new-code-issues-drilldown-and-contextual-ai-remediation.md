# 34: New Code Issues Drilldown & Contextual AI Remediation

**What to build:** Filter the SonarQube issues list and drilldown drawer to only show issues introduced in the New Code period (`inNewCodePeriod=true`) whenever New Code mode is active. Ensure that clicking "Fix with AI", "Send to Agent", or running "Clean Current File with AI" in New Code mode scopes the prompt strictly to New Code issues, empowering the Clean as You Code remediation paradigm.

**Blocked by:** 33

**Status:** ready-for-agent

- [ ] Update `SonarClient.getIssues(projectKey, category, inNewCodePeriod)` to pass `inNewCodePeriod=true` when requested.
- [ ] In `SonarOverviewViewProvider`, pass active `codePeriod` when querying issues for drilldown and drawer lists.
- [ ] Update "Clean Current File with AI" and `AgentDispatcher` batch prompt builders to respect active `codePeriod`, prioritizing or filtering issues to New Code when active.
- [ ] Add empty state indicator in issues list when 0 issues exist in New Code period.
- [ ] Unit tests for `SonarClient.getIssues` with `inNewCodePeriod`, drilldown filtering, and prompt generation scoping.
- [ ] Build, typecheck, lint, and tests all pass.
