# 37: Optimistic Metric Recalibration & AI Dispatch Auto-Marking

**What to build:** Recalibrate the Overview dashboard metric cards (Bugs, Vulnerabilities, Code Smells) to optimistically decrement their counts based on locally fixed issues, and display an informative `(X fixed locally)` sub-badge below the number. Automatically mark issues as fixed locally whenever they are dispatched to an AI Agent via "Send to Agent" or "Fix with AI", eliminating tedious manual tagging after remediation.

**Blocked by:** 36

**Status:** complete

- [x] Compute optimistic counts in `SonarOverviewViewProvider` by subtracting fixed issues from their respective category counts before posting overview state to the webview.
- [x] Render the recalibrated count and an informative `(X fixed locally)` indicator on metric cards in `media/webview.js`.
- [x] Auto-mark dispatched issue keys in `_handleSendToAgent` and `_handleSendBatchToAgent` in `SonarOverviewViewProvider`.
- [x] Provide a batch action in the multi-select bar to "Mark Selected as Fixed" locally.
- [x] Add an option in the UI or command palette to reset all local fixes back to the server baseline.
- [x] Unit & integration tests verifying optimistic metric computation, agent auto-marking, and overview state delivery.
- [x] Build, lint, typecheck, and test suite pass cleanly.
