# ADR-001: Multiple Connection Profiles (Single-Active + Switcher)

Date: 2026-09-20
Status: Accepted (grilled)

## Context

`ProjectDetector` stores a single `serverUrl + projectKey + token` (`sonarAgent.token`).
User wants multiple SonarQube targets without re-entering URL/token each time.

## Decision

1. **Model**: Named `Connection Profile`s, user-named free text (e.g. `kantor-prod`).
   Only **one profile active** at a time as the current `Project Binding`.
2. **Switcher UI**: Both — quick dropdown in sidebar header + full manage (add/rename/delete/switch/verify) in existing `Configure` QuickPick.
3. **Properties file**: `sonar-project.properties` is only a suggestion when creating a new profile, never overrides the active profile afterwards.
4. **Migration**: Reset from zero. Existing single config is discarded on first use of profiles (token deleted via `secrets.delete`, config keys cleared). No auto-migrate to `Default`.
5. **Security invariants preserved**: per-profile tokens in `context.secrets` only (`sonarAgent.token.<profileId>`), never to Webview, never in Fix Prompts, `Authorization` header only.

## Consequences

- `ProjectDetector` interface grows minimally: `listProfiles()`, `getActiveProfileId()`, `activateProfile(id)`, `saveProfile()`, `deleteProfile()`; `SonarClient` stays single-target (constructed per active binding).
- `SonarOverviewViewProvider` needs active-profile state sync + header dropdown.
- Rejected alternatives: multi-active parallel dashboard (complexity, API fan-out), per-folder auto-binding (conflicts with single-active choice), always-override from properties (fights user switch intent).

## Next

`/to-spec` then `/to-tickets`: (1) profile store + secrets, (2) header dropdown + QuickPick manage, (3) properties-as-suggestion + reset migration.
