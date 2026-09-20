# 12: Connection Profile Store with Per-Profile Secrets

**What to build:** Named connection-profile storage in `ProjectDetector` replacing the single `serverUrl + projectKey + token` binding. Each profile is `{ id, name, serverUrl, projectKey }` with its token in `context.secrets` under `sonarAgent.token.<id>`. Only one profile is active at a time; `getConfig()`/`getToken()` resolve the active profile only.

**Blocked by:** 11: Issues Drilldown Filter Bar

**Status:** ready-for-agent

- [x] Add `ConnectionProfileMeta { id, name, serverUrl, projectKey, updatedAt }` type; persist `sonarAgent.profiles[]` + `sonarAgent.activeProfileId` via `WorkspaceConfigLike`.
- [x] Implement `listProfiles()`, `getActiveProfile()`, `createProfile()`, `activateProfile()`, `updateProfileToken()`, `renameProfile()`, `deleteProfile()`, `updateProfileTarget()` with slugified id from free-text name.
- [x] Store tokens per-profile in secrets (`sonarAgent.token.<id>`); in-memory token cache becomes `Map<profileId, token>`; never expose tokens outside extension host.
- [x] Redefine `getConfig()`/`getToken()` to resolve active profile only; `SonarClient` constructed per active binding with no changes to its class.
- [x] Unit tests through public `ProjectDetector` methods with fake `SecretStorageLike`/`WorkspaceConfigLike`: create/list/activate/rename/delete round-trip, active-only resolution, per-profile secret isolation.
