# 25: Try Demo Mode Onboarding

**What to build:** An interactive "Try Demo Mode" button in the onboarding and empty profiles views. Activating it populates the sidebar with realistic sample measures (Quality Gate Failed, rating badges A–E, and sample issues across categories). An accent banner at the top indicates Demo Mode is active with an "Exit Demo Mode" button to return. Users can triage sample issues and trigger "Fix with Agent" to dispatch enriched Fix Prompts to their selected AI assistant.

**Blocked by:** None (can start immediately)

**Status:** complete

- [x] "Try Demo Mode" button is prominently visible in the onboarding and no-profiles views.
- [x] Clicking "Try Demo Mode" displays an active dashboard with failing Quality Gate status, realistic metrics, and sample issues.
- [x] A persistent banner at the top indicates Demo Mode is active and provides an "Exit Demo Mode" button.
- [x] Clicking "Exit Demo Mode" returns the sidebar to the unconfigured/onboarding view.
- [x] Sample issues support category filtering, severity indicators, and "Fix with Agent" prompt dispatching to AI assistants.
- [x] Unit tests verify entering Demo Mode, rendering demo metrics, exiting Demo Mode, and dispatching sample issues.
- [x] All test suites and typechecks pass with zero regressions.
