# 14: Reset Migration and Properties-as-Suggestion

**What to build:** Reset-from-zero migration of the legacy single connection plus `sonar-project.properties` demoted to creation-time suggestion only. First run with legacy keys deletes the old token and clears old settings with a notice; the active profile is never overridden by the properties file afterwards.

**Blocked by:** 12: Connection Profile Store with Per-Profile Secrets

**Status:** ready-for-agent

- [x] Implement `migrateResetIfLegacy()` in `ProjectDetector`: detect legacy `sonarAgent.token` / `serverUrl` / `projectKey`, `secrets.delete` + settings clear, return true once; show "Single connection removed — create a profile" notice path.
- [x] Reuse `parseProperties()`/`detectWorkspaceProperties()` only to prefill server URL + projectKey inputs during profile creation; preserve plaintext-credential warning at creation time.
- [x] Guarantee `getConfig()` has no legacy fallback and no properties override after reset; switching profiles is the sole source of active binding.
- [x] Unit tests: legacy present → deleted + cleared + true; legacy absent → false; active profile stable despite properties file present; prefill helper returns suggestion values.
