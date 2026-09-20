# Spec: Multiple Connection Profiles (Single-Active + Switcher)

Source: ADR-001 (`docs/adr-001-multiple-profiles.md`) + grilling 2026-09-20.
Scope: replaces single `serverUrl + projectKey + token` with user-named profiles, one active at a time.

## 1. Problem

Single binding forces re-entering Server URL + token when working across SonarQube servers/projects. No fast switch, no named separation of credentials.

## 2. Solution

Named **Connection Profile**s. Each profile = `{ id, name, serverUrl, projectKey }` + per-profile token in `context.secrets`. One profile is active as the current **Project Binding**. Switcher in (a) sidebar header dropdown for fast switch, (b) existing `Configure` QuickPick for full manage.

Decisions (locked):
- Identity: user free-text name, slugified to `id` (`kantor-prod`).
- Activation: single-active only. No parallel aggregate dashboard.
- Migration: reset-from-zero. On first profiles read, delete legacy `sonarAgent.token` secret + clear legacy `serverUrl`/`projectKey` settings. No auto-migrate.
- `sonar-project.properties`: suggestion-only at profile creation; never overrides active profile.
- Security invariants unchanged (CONTEXT.md): secrets-only tokens, never to Webview, never in Fix Prompts, `Authorization` header only.

## 3. User stories

1. Create profile: from empty state or Configure menu → input name → input server URL (http/https validation) → input token (password box) → live `verifyConnection()` → pick project (`fetchProjects()` + properties suggestion) → save, set active, refresh view.
2. Switch fast: header dropdown lists profiles (name + server host + projectKey); selecting verifies (or uses last-verified), sets active, rebuilds `SonarClient`, refreshes overview.
3. Manage full: Configure QuickPick gains `Switch Profile / New / Rename / Delete / Update URL & Token / Verify` entries.
4. Delete profile: confirm modal → `secrets.delete(sonarAgent.token.<id>)` → remove from list; if it was active, active becomes unset → show onboarding/empty state.
5. Rename profile: rename display name only, `id`/secret key stable.
6. First-run reset: user with legacy single config sees profiles empty state with notice "Single connection removed — create a profile"; legacy secret deleted, no silent reuse.

## 4. Module changes (deep-module discipline)

### `ProjectDetector` (owner of profile store)
New minimal surface (additive, legacy single-key methods become thin delegates then removed):
- `listProfiles(): Promise<ConnectionProfileMeta[]>` — reads `sonarAgent.profiles` (array) + `sonarAgent.activeProfileId`.
- `getActiveProfile(): Promise<{ profile, token? } | null>`
- `createProfile(input): Promise<profile>` — validates, slugifies id, stores meta, stores token to `sonarAgent.token.<id>`.
- `activateProfile(id): Promise<void>` — sets `activeProfileId`, primes in-memory token cache per-profile.
- `updateProfileToken(id, token)`, `renameProfile(id, name)`, `deleteProfile(id)`, `updateProfileTarget(id, {serverUrl, projectKey})`.
- `migrateResetIfLegacy(): Promise<boolean>` — detects legacy keys, deletes + clears, returns true if reset happened.
- `getConfig()` / `getToken()` redefined as: resolve **active profile only**. No fallback to legacy after reset.
- Token cache: `Map<profileId, token|null>` instead of single `activeToken`.

Types:
```ts
interface ConnectionProfileMeta { id: string; name: string; serverUrl: string; projectKey: string; updatedAt: string }
```

### `SonarClient`
No change. Constructed per request from active profile `{ serverUrl, token }`. No multi-target fan-out.

### `SonarOverviewViewProvider`
- Header: `<select id="profile-switcher">` populated via `_syncState()` (`profiles[]`, `activeProfileId`).
- Messages: `switchProfile {id}`, `manageProfiles` (opens Configure QuickPick).
- Empty states: `no-profiles` (first run / all deleted) vs existing `not-configured`.
- Existing metric/issues/dispatch logic unchanged, always uses active binding.

### `extension.ts` commands
- Reuse `sonarAgent.configure` (extended menu) + `sonarAgent.selectProject` (scoped to active/new profile).
- New: `sonarAgent.profile.switch` (header dropdown backing), `sonarAgent.profile.create`, `sonarAgent.profile.delete`. Or single `manageProfiles()` entry — implementer picks smallest set covering stories.

## 5. Storage & secrets contract

- Workspace/global settings (`sonarAgent` section): `profiles: ConnectionProfileMeta[]`, `activeProfileId: string | null`. No URLs/tokens outside these.
- Secrets: `sonarAgent.token.<profileId>` only. Legacy `sonarAgent.token` must not be read after `migrateResetIfLegacy()`; must be deleted.
- `sonar-project.properties` parse reused only to prefill `serverUrl`/`projectKey` inputs on create. Plaintext-credential warning preserved at creation time.

## 6. Verification & tests (seams, no internal mocks)

- `ProjectDetector`: create/list/activate/rename/delete round-trip via fake `SecretStorageLike` + `WorkspaceConfigLike`; reset deletes legacy secret + clears legacy settings; `getConfig()` reflects active only; properties file never overrides active (suggestion path tested at caller, not inside `getConfig`).
- Provider/dispatch: switching profile rebuilds client params and refreshes (test through `getConfig` + message handler, not private HTML).
- `verifyConnection()` failure on switch keeps previous active (no half-switch).

## 7. Out of scope

- Parallel multi-profile aggregate view.
- Per-folder / multi-root auto-binding.
- Auto-migration of legacy single config to `Default`.
- SonarCloud org SAML flows; token auth only.

## 8. Acceptance checklist

- [ ] Fresh install: create 2 profiles, switch via header < 2 clicks, metrics follow active.
- [ ] Legacy install: first run clears old token/settings, shows empty-profiles notice.
- [ ] Delete active profile → safe empty state, no leaked token, no crash.
- [ ] `npm test`, `npm run check`, `npm run lint`, `npm run build` green.
