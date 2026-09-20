# 16: Extract Connection Profile Wizard

**What to build:** Extract interactive prompt wizard methods (`promptConfigureConnection`, `promptProjectSelection`, `promptUpdateCredentials`, `promptManageProfiles`, `promptCreateProfile`) from `SonarOverviewViewProvider.ts` into a dedicated deep module `ConnectionProfileWizard.ts`. Wire `SonarOverviewViewProvider` to delegate to this wizard with an `onConfigChanged: () => this._syncState()` callback.

**Blocked by:** none

**Status:** complete

- [x] Create `src/modules/ConnectionProfileWizard.ts` accepting `ProjectDetector`, `sonarClientFactory`, and `onConfigChanged` callback.
- [x] Migrate `promptConfigureConnection`, `promptProjectSelection`, `promptUpdateCredentials`, `promptManageProfiles`, and `promptCreateProfile` from `SonarOverviewViewProvider` to `ConnectionProfileWizard`.
- [x] Wire `SonarOverviewViewProvider` constructor to instantiate `ConnectionProfileWizard` and delegate prompt methods and webview messages to it.
- [x] Add unit tests in `test/ConnectionProfileWizard.test.ts` verifying all interactive wizard flows.
- [x] Verify existing tests in `test/ConfigureConnection.test.ts` and extension commands in `src/extension.ts` continue to pass without regression.
