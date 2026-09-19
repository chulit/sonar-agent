# AGENTS.md

Guidance and operating rules for AI coding agents working on the **Sonar Agent** VS Code extension.

## Pointers

- **Domain Glossary**: [CONTEXT.md](CONTEXT.md): canonical terminology. Use defined terms exclusively.
- **Specification**: [SPEC.md](SPEC.md): 21 user stories, implementation decisions, and test seams.
- **Active Tickets**: [.scratch/sonar-agent/issues/](.scratch/sonar-agent/issues/): tracer-bullet tickets with blocking edges.

## Working on Tickets

Work the frontier: pick the lowest-numbered ticket in `.scratch/sonar-agent/issues/` whose blockers are marked complete.

For each ticket:

1. **Vertical slice**: Touch all layers (UI, API/Client, State, Tests) needed to deliver the ticket's end-to-end behavior.
2. **Deep module discipline**: Keep interfaces minimal. Place complex behavior, formatting, caching, and network details behind small module interfaces.
3. **Verify locally**: Run tests and verify the build before marking acceptance criteria.
4. **Mark complete**: Update the ticket checkboxes from `[ ]` to `[x]` and commit the work cleanly.

## Architecture & Seams

The codebase is organized around four deep modules:

- `ProjectDetector`: Resolves workspace `sonar-project.properties`, fallback settings, and secrets storage.
- `SonarClient`: Encapsulates SonarQube REST API calls (`/api/measures/*`, `/api/issues/*`, `/api/rules/*`), caching, and error status mapping.
- `AgentDispatcher`: Assembles enriched Fix Prompts (rule docs + local code snippet + coordinates) and dispatches via VS Code chat command or clipboard fallback.
- `SonarOverviewViewProvider`: Implements `vscode.WebviewViewProvider` with responsive CSS container queries (`@container`) and message passing.

## Development & Verification Loops

- **Build**: `npm run build` (bundles with esbuild into `dist/extension.js`)
- **Watch**: `npm run watch` (fast iterative re-bundle)
- **Test**: `npm test` (executes unit tests against module seams)
- **Lint / Typecheck**: `npm run lint` (ESLint analysis), `npm run lint:fix` (auto-fix), & `npm run check` (TypeScript static analysis)
- **Format**: `npm run format` (Prettier code formatter) & `npm run format:check` (verify formatting)

## Conventions

- **UI Aesthetics**: Replicate SonarQube card hierarchy and badge styling. Always use VS Code theme variables (`var(--vscode-*)`) for base colors and contrast.
- **Container Queries**: Use `container-type: inline-size` for responsive sidebar reflows instead of viewport media queries.
- **Security & Zero Token Leakage**:
  - Persist user tokens exclusively via `vscode.ExtensionContext.secrets` (OS Keychain).
  - Never transmit tokens to Webview via `postMessage`.
  - Never include credentials or tokens in Fix Prompts sent to AI agents.
  - Never pass tokens in URL query strings (only in `Authorization` headers).
  - Redact/strip any token strings from error messages and logs.
