# 35: New Code Quality Gate Evaluation & Ambient Status Bar

**What to build:** Evaluate SonarQube Quality Gate status specifically for New Code conditions (`projectStatus.conditions` with `metricKey` matching `new_*`). Update the sidebar Quality Gate badge and the ambient VS Code Status Bar to reflect the New Code evaluation when New Code mode is active (e.g., `$(pass) Sonar (New): Passed` vs `$(error) Sonar (New): Failed`), with hover tooltips detailing New Code conditions.

**Blocked by:** 33

**Status:** complete

- [x] Update `SonarClient.getQualityGateStatus(projectKey, codePeriod)` to evaluate only `new_*` conditions when `codePeriod === 'new'`.
- [x] Update sidebar Quality Gate badge in `SonarOverviewViewProvider` to show New Code gate status when New Code mode is active.
- [x] Update `SonarStatusBar` item text, tooltip, and icon to reflect active `codePeriod` (e.g. `$(pass) Sonar (New): Passed`).
- [x] Markdown tooltip in `SonarStatusBar` lists individual New Code conditions and actual vs threshold values.
- [x] Unit tests for `SonarClient.getQualityGateStatus` new code evaluation and `SonarStatusBar` period-aware formatting.
- [x] Build, typecheck, lint, and tests all pass.
