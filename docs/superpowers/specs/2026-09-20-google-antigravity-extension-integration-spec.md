# Feature Spec: Google Antigravity Extension Integration

- **Date:** 2026-09-20
- **Status:** ready-for-agent
- **Primary Modules:** Agent Dispatcher (`src/modules/AgentDispatcher.ts`)
- **Related Documents:** `CONTEXT.md`, `SPEC.md`, `.scratch/sonar-agent/issues/08-dynamic-agent-discovery-and-reactive-selector-ui.md`

---

## Problem Statement

Users running standard VS Code (or derivatives) who install the official Google Antigravity extension (`google.google-antigravity`) cannot use the "Send to Agent" workflow or see "Antigravity Agent" listed in the Target Agent selector. Currently, the extension only detects the standalone Antigravity IDE environment or older legacy extension IDs (`google.antigravity`, `google.gemini`), leaving standard VS Code users with the official extension unable to target Antigravity.

## Solution

Extend the agent discovery and dispatch mechanism in `AgentDispatcher` to recognize the official `google.google-antigravity` extension ID alongside the standalone IDE and existing fallbacks. Ensure that selecting Antigravity as the Target Agent properly focuses or dispatches to the Antigravity Chat panel and gracefully falls back to clipboard copy with clear user notifications.

## User Stories

1. As a developer using standard VS Code with the `google.google-antigravity` extension installed, I want Sonar Agent to automatically detect Antigravity in the Target Agent dropdown, so that I can dispatch Sonar issues directly to my Antigravity assistant.
2. As a developer with both GitHub Copilot and `google.google-antigravity` installed, I want the discovery ordering to maintain `Copilot > Antigravity > Other Agent > Clipboard`, so that my assistant hierarchy remains predictable and consistent.
3. As a developer clicking "Send to Agent" on a single Sonar issue with `antigravity` selected, I want the extension to open the Antigravity chat or focus the chat view with the issue context and copy the enriched Fix Prompt to the clipboard, so that I can immediately ask Antigravity to fix the issue.
4. As a developer using batch selection on multiple Sonar issues, I want the batch Fix Prompt dispatched to Antigravity with all affected file references, so that Antigravity can analyze and remediate the batch together.
5. As a developer invoking the "Fix with AI Agent" Quick Fix CodeAction on a SonarQube diagnostic in the editor, I want the diagnostic to dispatch seamlessly to Antigravity if Antigravity is my default agent.
6. As a developer in an environment where Antigravity chat command execution fails, I want the enriched Fix Prompt copied to my clipboard and a helpful toast notification displayed, so that I can manually paste the prompt into the Antigravity chat without losing context.
7. As a developer working offline or in a test harness, I want agent detection and dispatch to rely on dependency-injected lookup functions without touching VS Code extension host state, so that automated unit tests can run hermetically.

## Implementation Decisions

- Module modifications: Update the agent discovery logic and dispatch flow within the agent dispatch module (`AgentDispatcher.ts`).
- Extension ID registry: Add `'google.google-antigravity'` to the list of inspected extension IDs when evaluating available target agents in `getAvailableAgents()`.
- Preservation of environment checks: Retain standalone Antigravity IDE environment detection (`appName` inspection, environment variables, and `vscode.antigravityExtensibility.sendToAgentPanel`) alongside the extension-based detection.
- Focus and activation commands: Retain and expand activation commands (`antigravity.openChatView`, `workbench.action.chat.open`, `antigravity.prioritized.chat.open`, `workbench.action.openChat`) to ensure compatibility with both the standalone IDE and the `google.google-antigravity` VS Code extension.
- Priority and default resolution: Keep Antigravity ranked second in priority immediately following GitHub Copilot (`Copilot > Antigravity > Other Agent > Clipboard`).

## Testing Decisions

- Test external behavior exclusively via public module entry points (`getAvailableAgents`, `dispatch`, `dispatchIssue`).
- Tested modules: The agent dispatch module and its interaction with the code action and overview view providers.
- Test seam: Existing constructor injection seams (`isExtensionInstalledFn`, `isAntigravityEnvFn`, `executeCommandFn`, `sendToAgentPanelFn`).
- Prior art: Existing test suites in `test/AgentDispatcher.test.ts` validating agent detection for `github.copilot`, `anthropic.claude-code`, and Antigravity IDE.

## Out of Scope

- Developing or bundling the `google.google-antigravity` extension itself.
- Reverse-engineering private, undocumented internal communication protocols of the extension beyond standard VS Code commands and public extensibility APIs.
- Altering the Fix Prompt markdown schema or Sonar rule enrichment pipeline.

## Further Notes

- The fix is low-risk and localized to agent discovery and command dispatch fallbacks.
- Ensures seamless interoperability across both Antigravity IDE standalone and standard VS Code with the official extension.
