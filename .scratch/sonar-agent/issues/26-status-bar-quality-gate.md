# 26: Status Bar Quality Gate Item

**What to build:** A persistent VS Code Status Bar item that displays the current project's Quality Gate status (`$(pass) Sonar: Passed`, `$(error) Sonar: Failed`, or `$(beaker) Sonar: Demo (Failed)`). Hovering displays a rich Markdown tooltip summarizing metrics (Bugs, Vulnerabilities, Hotspots, Code Smells, Coverage), and clicking focuses the Sonar Overview sidebar view.

**Blocked by:** 25: Try Demo Mode Onboarding

**Status:** ready-for-agent

- [ ] Status Bar item displays passing state (`$(pass) Sonar: Passed`) when Quality Gate is OK.
- [ ] Status Bar item displays failing state (`$(error) Sonar: Failed`) when Quality Gate has failed conditions.
- [ ] Status Bar item displays demo state (`$(beaker) Sonar: Demo (Failed)`) when Demo Mode is active.
- [ ] Hovering over the Status Bar item displays a rich Markdown tooltip with project key and metric breakdown.
- [ ] Clicking the Status Bar item focuses the Sonar Overview sidebar view.
- [ ] Status Bar item updates automatically on refresh, profile switch, and demo mode toggles, and clears when disconnected.
- [ ] Unit tests verify status mapping, tooltip generation, command triggering, and disposal lifecycle.
- [ ] All test suites and typechecks pass with zero regressions.
