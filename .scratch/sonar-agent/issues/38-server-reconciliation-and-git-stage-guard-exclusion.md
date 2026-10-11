# 38: Server Scan Reconciliation & Git Stage Guard Exclusion

**What to build:** Automatically reconcile stored locally fixed issue keys against fresh server responses when metrics are refreshed, purging keys for issues that the server confirms are resolved while retaining keys for issues still awaiting server analysis. Update `GitStageGuard` so that issues marked as fixed locally are excluded from cached issue evaluation, preventing false-positive blocking warnings when staging files for commit.

**Blocked by:** 37

**Status:** complete

- [x] Implement server reconciliation in `SonarOverviewViewProvider` during `_resolveOverview` / `fetchProjectOverview` to prune fixed keys that no longer exist in server issue responses.
- [x] Preserve locally fixed keys across refresh if the issue is still returned by the server (awaiting CI scan).
- [x] Filter out locally fixed issues from `getAllCachedIssues()` in `SonarOverviewViewProvider` so `GitStageGuard.getCachedIssuesFn` automatically receives only genuinely unresolved issues.
- [x] Verify `GitStageGuard` does not prompt warning notifications when all staged issues are marked as locally fixed.
- [x] Update Status Bar tooltip to include a note when local fixes are pending remote CI scan verification.
- [x] Unit tests in `WebviewProvider.test.ts` and `GitStageGuard.test.ts` verifying server reconciliation and guard exclusion.
- [x] Build, lint, typecheck, and test suite pass cleanly.
