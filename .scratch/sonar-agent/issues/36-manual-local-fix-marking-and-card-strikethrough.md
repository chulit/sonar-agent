# 36: Manual Local Fix Marking & Drilldown Card Strikethrough

**What to build:** Allow developers to mark any issue in the drilldown list as fixed locally via a dedicated "Mark as Fixed" button. The item immediately renders in the webview with a strikethrough message, a green "Fixed Locally" badge, and an instant "Undo" button. The set of locally fixed issue keys is persisted in `workspaceState` so that progress survives editor restarts, verified end-to-end via message passing tests.

**Blocked by:** 35

**Status:** complete

- [x] Add `toggleLocalIssueFixed` message handler in `SonarOverviewViewProvider` storing fixed issue keys in `workspaceState` (`sonarAgent.locallyFixedIssues`).
- [x] Render a "Mark as Fixed" button on issue cards in `media/webview.js` for unresolved items.
- [x] When marked as fixed, style the issue card with visual strikethrough, a green "Fixed Locally" badge, and an "Undo" action button.
- [x] Clicking "Undo" posts `toggleLocalIssueFixed` with `fixed: false`, restoring normal card styling and removing the key from `workspaceState`.
- [x] Detail list fetches and initial webview loads mark cached issues with `isFixedLocally: true` if their key exists in stored state.
- [x] Unit & integration tests in `WebviewProvider.test.ts` verifying message handling, state persistence, and webview rendering.
- [x] Build, lint, typecheck, and test suite pass cleanly.

