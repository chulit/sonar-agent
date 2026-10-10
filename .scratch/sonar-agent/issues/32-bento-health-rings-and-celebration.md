# 32: Bento Health Rings & Quality Gate Celebration

**What to build:** Enhances the Sonar Overview webview cards with responsive SVG circular progress rings (donut charts for Coverage percentage and color-coded rating rings for Security, Reliability, and Maintainability). Adds a celebratory dopamine micro-animation (subtle confetti burst, pulsing green glow, and a "Clean Code Streak maintained!" badge) when Quality Gate transitions from FAILED to PASSED or all issues in the active view are resolved.

**Blocked by:** 27: Demo Preview Asset & Documentation Polish

**Status:** ready-for-agent

- [ ] Metric cards incorporate responsive SVG circular progress rings showing percentage and rating scores.
- [ ] Circular health rings adapt seamlessly across narrow and wide sidebar containers via `@container` queries.
- [ ] When Quality Gate status transitions from FAILED to PASSED or zero issues are reached, triggers a celebration micro-animation (green pulse glow and subtle celebratory confetti).
- [ ] Displays a gamified badge: `🎉 0 Issues Reached! Clean Code streak maintained`.
- [ ] Animations strictly adhere to `prefers-reduced-motion` media query to ensure accessibility compliance.
- [ ] Unit tests verify SVG ring rendering calculations, status transition detection, and reduced motion fallbacks.
- [ ] All test suites, linting, and typechecks pass with zero regressions.
