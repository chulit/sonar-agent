# 13: Profile Switcher UI (Header Dropdown + Configure QuickPick)

**What to build:** Fast profile switching from the sidebar header plus full profile management inside the existing `Configure` QuickPick. Switching sets the active profile, rebuilds the `SonarClient` from the active binding, and refreshes the Sonar Overview view.

**Blocked by:** 12: Connection Profile Store with Per-Profile Secrets

**Status:** ready-for-agent

- [x] Render `<select id="profile-switcher">` in `SonarOverviewViewProvider` header populated via `_syncState()` with `profiles[]` + `activeProfileId` (name + host + projectKey); handle `switchProfile {id}` message with failure keeping previous active.
- [x] Extend `sonarAgent.configure` QuickPick with `Switch / New / Rename / Delete / Update URL & Token / Verify` entries wired to `ProjectDetector` profile methods with live `verifyConnection()` before save.
- [x] Add `no-profiles` empty state (distinct from `not-configured`) directing to profile creation; deleting the active profile lands safely here with secrets deleted.
- [x] Register minimal commands (`sonarAgent.profile.switch/create/delete` or single manage entry) in `extension.ts` + `package.json` contributions.
- [x] Unit/integration tests through provider message handler + detector seams: switch updates `getConfig()`, failed verify preserves active, delete-active yields empty state.
