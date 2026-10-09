# 25: SonarQube Cloud Organization Support

**What to build:** First-class SonarQube Cloud (sonarcloud.io) support via an optional
`organization` key. Several SonarCloud API endpoints (`/api/projects/search`,
`/api/components/search*`, `/api/rules/show`) return HTTP 400 without the
`organization` query parameter, which broke project auto-discovery and rule
enrichment (rule name/description in Fix Prompts) for SonarCloud users. Endpoints
that already work with fully-qualified project keys (issues, measures, hotspots,
quality gate) are left untouched.

**Blocked by:** none

**Status:** done

- [x] `SonarClientConfig.organization` added; `organization` query param appended to
      `fetchProjects()` endpoints and `getEnrichedRule()` (`/api/rules/show`) only
      when configured — self-hosted SonarQube URLs stay byte-identical.
- [x] `ProjectDetector`: `organization` on `ConnectionProfileMeta` /
      `CreateProfileInput` / `UpdateProfileTargetInput` / `ResolvedProjectConfig`;
      `setOrganization()`; `sonar.organization` parsed from `sonar-project.properties`;
      exported `isSonarCloudUrl()` helper.
- [x] `ConnectionProfileWizard`: prompts for the organization key when the server URL
      is sonarcloud.io (update-credentials flow and new-profile flow); threads it
      through the client factory for verification and project discovery.
- [x] `AgentDispatcher`: factory config carries `organization` so rule enrichment works.
- [x] `SonarOverviewViewProvider`: webview onboarding form gains an optional
      Organization Key field; all `SonarClient` constructions receive the configured org.
- [x] `package.json`: new `sonarAgent.organization` setting.
- [x] Unit tests: 17 new (client URL building, detector round-trip/properties parsing,
      `isSonarCloudUrl`, wizard prompting/threading). 160/160 pass; `tsc`, ESLint
      (0 errors), and `esbuild` production build all clean.
