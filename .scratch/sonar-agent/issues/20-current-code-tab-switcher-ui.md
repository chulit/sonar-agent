# 20: Current Code Tab Switcher UI

**What to build:** Add a tab bar to the connected-dashboard view in the sidebar webview, immediately below the Project & Target Agent selector card. The bar renders two tabs — **Overall Code** and **Current Code (N)** — and wires up the two-way message protocol so the extension host and webview stay in sync on which tab is active.

**Blocked by:** 18

**Status:** ready-for-agent

- [x] Add tab bar HTML (`#tab-bar`) with buttons `#tab-overall` and `#tab-current` below the project/agent selector card in `SonarOverviewViewProvider`'s HTML template. Tab bar is rendered only when `sonarAgent.currentCode.enabled` is `true`.
- [x] Add `#overall-tab-panel` and `#current-tab-panel` wrapper divs; existing metrics grid and issues section move inside `#overall-tab-panel`.
- [x] Webview script: clicking a tab sends `{ command: 'switchTab', tab: 'overallCode' | 'currentCode' }` to the extension host.
- [x] Extension host handles `switchTab` message and responds with `{ type: 'tabState', activeTab: string }`.
- [x] Webview script toggles `.active` class on tab buttons and shows/hides the correct panel on `tabState` message receipt.
- [x] Extension host updates the badge count via `{ type: 'currentCodeCount', count: number }` message; webview script reflects this in the tab label.
- [x] Tab switcher uses VS Code theme variables for active/inactive states; follows existing icon-btn hover and focus-visible patterns.
- [x] Build, typecheck, lint, and tests all pass.
