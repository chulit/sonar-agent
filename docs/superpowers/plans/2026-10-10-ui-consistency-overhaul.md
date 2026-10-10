# UI Consistency Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Sonar Agent sidebar UI to eliminate redundancy (nav tabs vs code period), dynamically streamline category filters, refine metric card layout and icons, and standardize item card badges and action buttons.

**Architecture:** Update `SonarOverviewViewProvider.ts` webview HTML/CSS/JS template. The top-level tab bar distinguishes between server-side project scope and local workspace scope. When drilldown categories (Coverage, Duplications, Issues) are viewed, filter dropdowns dynamically show only relevant fields. Metric cards feature proportional icon sizing, robust titles without truncated words, and cards display consistent SVG action buttons and non-deceptive metric badges.

**Tech Stack:** TypeScript, VS Code Webview API, Vanilla CSS with container queries (`@container`), Vitest.

## Global Constraints

- Preserve all existing postMessage protocols between Webview and extension backend (`openFile`, `sendToAgent`, `generateMissingTests`, `sendBatchToAgent`, `activeTabChanged`, `codePeriodChanged`, `issueTransition`).
- Respect zero token leakage and VS Code theme variables (`var(--vscode-*)`).
- Maintain full test suite pass rate (`npm test`).

---

### Task 1: Disambiguate Top Scope Tabs vs Code Period Switcher

**Files:**

- Modify: `src/modules/SonarOverviewViewProvider.ts:3202-3220` (HTML template), `4375-4415` (JS tab logic), `2930-2970` (CSS)
- Test: `test/WebviewProvider.test.ts`, `test/CurrentCode.test.ts`

**Interfaces:**

- Consumes: `currentCodeEnabled`, `codePeriod`, `setActiveTab(tab)`
- Produces: Disambiguated button labels: Top tab uses `Project` (or `Server / Project`) and `Local Code (N)` (or `Local / Current Code (N)`), while inner period switcher retains Sonar's standard `Overall Code` vs `New Code`.

- [ ] **Step 1: Check existing tab tests in `test/CurrentCode.test.ts` and `test/WebviewProvider.test.ts`**

Inspect tests asserting tab button text or IDs.

- [ ] **Step 2: Update tab bar HTML in `SonarOverviewViewProvider.ts`**

Change `<button id="tab-overall">` default label from "Overall Code" to "Project" or "Server Project", and `<button id="tab-current">` to "Local Code (0)" while keeping element IDs intact (`tab-overall`, `tab-current`) so all backend listeners and test DOM queries remain compatible.

- [ ] **Step 3: Update client script tab label updater**

In `_getWebviewContent()`, ensure `tabCurrent.textContent = "Local Code (" + count + ")";` preserves the count badge.

- [ ] **Step 4: Run tests and verify**

Run: `npm test test/CurrentCode.test.ts test/WebviewProvider.test.ts`
Expected: PASS.

---

### Task 2: Refine Metric Cards Icon Sizing and Text Truncation

**Files:**

- Modify: `src/modules/SonarOverviewViewProvider.ts:2350-2430` (CSS for metric cards & icons), `3305-3340` (HTML)
- Test: `test/BentoHealthRings.test.ts`, `test/WebviewProvider.test.ts`

**Interfaces:**

- Consumes: Metric card HTML elements (`.metric-card`, `.metric-icon-box`, `.metric-title`)
- Produces:
  - Slightly smaller icon boxes (e.g. from 38px/40px to 32px-34px, svg 16px-18px instead of 20px) to provide more breathing room.
  - Better typography and word wrapping/compact label for "Security Hotspots" (e.g., label as "Hotspots" or allow flex-shrink / font-size 11px) so it never truncates to "Security Hots...".

- [ ] **Step 1: Adjust `.metric-icon-box` and SVG sizes**

Reduce icon box footprint slightly (`width: 32px; height: 32px; min-width: 32px;` with svg `16px x 16px`).

- [ ] **Step 2: Fix "Security Hotspots" text truncation**

Adjust `.metric-title` style or text to `Hotspots` (with tooltip `Security Hotspots`) or responsive font-size so it cleanly displays in 2-column container query mode without ugly ellipses.

- [ ] **Step 3: Run tests and verify**

Run: `npm test`
Expected: PASS.

---

### Task 3: Category-Aware Dynamic Filter Bar

**Files:**

- Modify: `src/modules/SonarOverviewViewProvider.ts:3445-3485` (HTML), `4310-4345` (JS filter logic)
- Test: `test/WebviewProvider.test.ts`

**Interfaces:**

- Consumes: `renderIssues(items, category, period)`
- Produces: Dynamic visibility toggle for filter elements:
  - When `category === 'coverage'` or `category === 'duplications'`: hide Severity & Rule dropdown containers. Display File filter and Include Test Files.
  - When `category` is an issue category (`security`, `reliability`, `maintainability`, `hotspots`, `accepted`): show Severity, Author, File, Rule, Include Tests.

- [ ] **Step 1: Add container classes/IDs to filter items**

Wrap `#filter-severity` item in `id="filter-severity-wrapper"` and `#filter-rule` in `id="filter-rule-wrapper"`, or toggle their parent `.filter-item`.

- [ ] **Step 2: Update `renderIssues(items, category, period)` in client script**

Add dynamic visibility logic:

```javascript
const isMetricCategory = category === 'coverage' || category === 'duplications';
if (filterSeverityWrapper) filterSeverityWrapper.classList.toggle('hidden', isMetricCategory);
if (filterRuleWrapper) filterRuleWrapper.classList.toggle('hidden', isMetricCategory);
```

- [ ] **Step 3: Update `applyFiltersAndRender` and dropdown population**

Ensure filtering does not fail or filter out coverage items when severity is hidden.

- [ ] **Step 4: Run tests and verify**

Run: `npm test`
Expected: PASS.

---

### Task 4: Standardize Card Badges, Action Buttons & Icons

**Files:**

- Modify: `src/modules/SonarOverviewViewProvider.ts:4180-4275` (renderIssueCard JS)
- Test: `test/WebviewProvider.test.ts`

**Interfaces:**

- Consumes: `SonarDetailItem`
- Produces:
  - Clean non-issue badge for Coverage items (e.g., `<span class="badge-tag badge-coverage">Coverage</span>` without fake `(MAJOR)`).
  - Proper SVG icon for `Generate Unit Tests` button instead of raw emoji `⚡`.
  - Consistent spacing and visual hierarchy across all item types.

- [ ] **Step 1: Replace raw emoji `⚡` with SVG lightning icon**

Standardize button markup:

```javascript
const lightningSvg =
  '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>';
agentBtn.innerHTML = lightningSvg + agentBtnLabel;
```

- [ ] **Step 2: Clean up Coverage badge rendering**

When `item.type === 'COVERAGE'`:
Render a clean badge indicating coverage status (or omitting fake severity), and strip redundant placeholder tags (`test-coverage`, `unit-test`).

- [ ] **Step 3: Run tests and verify**

Run: `npm test`
Expected: PASS.

---

### Task 5: End-to-End Verification and Build

**Files:**

- Run linting, typechecking, and build

- [ ] **Step 1: Run format check & linter**

Run: `npm run check && npm run lint`

- [ ] **Step 2: Run full build**

Run: `npm run build`

- [ ] **Step 3: Run test suite**

Run: `npm test`
