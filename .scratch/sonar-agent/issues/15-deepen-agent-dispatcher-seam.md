# 15: Deepen Agent Dispatcher Seam

**What to build:** Deepen `AgentDispatcher` into a high-leverage module that accepts `ProjectDetector` directly, automates rule documentation fetching and target agent resolution, and exposes three simple entry points (`dispatchIssue`, `dispatchBatch`, `dispatchDiagnostic`). Eliminate duplicate 6-step prompt orchestration in `SonarOverviewViewProvider` and `SonarCodeActionProvider`, and fix the constructor dependency injection bypass.

**Blocked by:** none

**Status:** complete

- [x] Add `projectDetector`, `sonarClientFactory`, and `getDefaultAgentFn` to `AgentDispatcherOptions` with dynamic credential resolution and rule enrichment in `AgentDispatcher.getRule()`.
- [x] Implement `resolveTargetAgent(requestedAgentId?: string)` with workspace configuration fallback (`sonarAgent.defaultAgent`) and installed extension validation.
- [x] Implement `dispatchIssue(item, options?)`, `dispatchBatch(items, options?)`, and `dispatchDiagnostic(diagnostic, document, options?)` on `AgentDispatcher`.
- [x] Refactor `SonarOverviewViewProvider` to inject `projectDetector` into default `AgentDispatcher` and delegate `_handleSendToAgent` and `_handleSendBatchToAgent` directly to `dispatchIssue` and `dispatchBatch`.
- [x] Refactor `SonarCodeActionProvider.executeFixWithAgent` to delegate directly to `dispatcher.dispatchDiagnostic(diagnostic, document)`.
- [x] Add comprehensive unit tests in `test/AgentDispatcher.test.ts` covering dynamic rule enrichment, batch dispatch, diagnostic mapping, and agent fallback resolution.
- [x] Verify full test suite, linting, typecheck, formatting, and build pass cleanly.
