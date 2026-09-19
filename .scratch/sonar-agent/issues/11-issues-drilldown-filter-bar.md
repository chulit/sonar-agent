# 11: Issues Drilldown Filter Bar

**What to build:** An interactive filtering bar above the issues drilldown list in the Sonar Overview sidebar view. Allows developers to filter loaded issues by Severity, Author, File, Rule, and toggle the inclusion of test files with instant, reactive client-side filtering and updated issue counts.

**Blocked by:** 10: Configure Project Binding & Interactive Credentials Flow

**Status:** ready-for-agent

- [ ] Add `author?: string` to `SonarDetailItem` and extract `item.author` from SonarQube API in `SonarClient.getIssues()`.
- [ ] Render a responsive Filter Bar above `#issues-container` containing dropdowns for Severity, Author, File, Rule, and an "Include Test Files" checkbox.
- [ ] Dynamically populate Author, File, and Rule dropdown options from currently loaded issues whenever a category drilldown is fetched.
- [ ] Severity dropdown supports filtering by `All`, `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, and `INFO`.
- [ ] "Include Test Files" checkbox (checked by default) excludes test files matching common test file patterns (`*.test.*`, `*.spec.*`, `**/test/**`, `**/tests/**`, `*Test.*`) when unchecked.
- [ ] Changing any filter immediately refilters the displayed issue cards, updates the items count badge, and clears/resynchronizes the batch selection bar.
- [ ] Unit tests verify `SonarClient` parses the author field and filter logic correctly handles all combinations of filters.
