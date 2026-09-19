# Sonar Agent Specification

## Problem Statement

Developers using SonarQube often struggle with context switching between the web dashboard and their code editor. When reviewing overall project health (specifically Overall Code issues, low test coverage areas, code duplications, and security hotspots), developers must manually inspect each issue on SonarQube's web UI, search for the corresponding file and line number in VS Code, interpret Sonar rules, and formulate prompts for AI coding agents to fix them. This manual workflow is error-prone, friction-heavy, and slows down codebase refactoring and quality remediation.

## Solution

**Sonar Agent** is a VS Code extension that brings SonarQube's Overall Code metrics directly into the editor's sidebar with high visual fidelity. It allows developers to:

1. View overall code metrics (Security, Reliability, Maintainability, Coverage, Duplications, Security Hotspots) with Sonar rating badges (A–E) in a responsive, container-aware sidebar card layout.
2. Filter and inspect issues, uncovered lines, code duplications, and security hotspots directly inside VS Code.
3. Jump instantly to the affected file and line with one click.
4. Dispatch single or batch-selected issues to editor AI agents (GitHub Copilot, Antigravity, Codex) with an automatically enriched Fix Prompt containing rule definitions, recommendations, local code context, and precise file coordinates.

## User Stories

1. As a developer, I want to configure the SonarQube server URL and authentication token through an onboarding form in the sidebar, so that I can connect to my SonarQube instance without manually editing configuration files.
2. As a developer, I want my SonarQube authentication token stored securely in VS Code Secrets storage, so that my credentials are never exposed in plaintext files.
3. As a developer, I want the extension to automatically detect my `projectKey` and `serverUrl` from `sonar-project.properties` in my workspace, so that I don't have to re-enter settings for each project.
4. As a developer, I want to fall back to a project picker dropdown if my workspace lacks a `sonar-project.properties` file, so that I can choose the right SonarQube project from the server.
5. As a developer, I want to view an Overall Code dashboard in the sidebar showing metric cards for Security, Reliability, Maintainability, Accepted Issues, Coverage, Duplications, and Security Hotspots, so that I have immediate visibility into overall code quality.
6. As a developer, I want each metric card to display its official Sonar rating letter (A, B, C, D, E) with standard Sonar colors, so that I can evaluate quality ratings at a glance.
7. As a developer, I want the metric cards to adapt between a single-column layout on narrow sidebars and a two-column grid on wider sidebars using container queries, so that the view is always readable regardless of how I resize my sidebar.
8. As a developer, I want to click on any metric card (e.g., Reliability, Coverage, Duplications, Security Hotspots) to filter the list below it, so that I can drill down into specific areas of concern.
9. As a developer, I want to see a detailed card for each issue containing the file path, issue title, severity, category, tags, line number, and effort estimate, matching SonarQube's web presentation.
10. As a developer, I want to click on an issue card to immediately open the local source file and position the cursor on the exact line where the issue was reported.
11. As a developer, I want the file navigation to resolve file paths accurately even in monorepo structures or when Sonar component keys have module prefixes.
12. As a developer, I want a "Send to Agent" button on each issue card, so that I can ask an AI agent to fix the issue without manually copying details.
13. As a developer, I want the Fix Prompt to automatically fetch the official Sonar rule explanation and fix recommendation from SonarQube's API, so that the AI agent has the exact rationale and guidance needed for remediation.
14. As a developer, I want the Fix Prompt to include the surrounding 10 lines of local source code around the issue, so that the agent has immediate contextual visibility.
15. As a developer, I want to select a Target Agent (GitHub Copilot, Antigravity, Codex) from a dropdown selector in the sidebar header or via a quick-pick prompt, so that I can direct the fix to my preferred assistant.
16. As a developer, I want the extension to invoke the VS Code Interactive Chat API for supported agents, so that the prompt opens directly in my chat panel ready for execution.
17. As a developer, I want an automatic clipboard copy fallback with a friendly notification if an agent's chat command is unavailable, so that I can easily paste the prompt into any agent interface.
18. As a developer, I want checkboxes on each issue card and a batch action bar ("Send X Issues to Agent"), so that I can bundle multiple related issues into a single prompt for bulk remediation.
19. As a developer, I want clicking the Coverage metric card to display files with low coverage and provide a "Generate Unit Tests" action for uncovered lines.
20. As a developer, I want clicking the Duplications metric card to display duplicated blocks and provide a "Refactor Duplicated Code" action to extract shared methods.
21. As a developer, I want a manual Refresh button in the header, so that I can update metrics immediately after re-running Sonar scanner analysis.
22. As a developer, I want the Target Agent selector to dynamically discover installed AI coding agents (GitHub Copilot, Antigravity, Cline, Roo Code, Continue) rather than showing hardcoded options, so that I only see assistants available in my environment.
23. As a developer, I want dispatching to an agent without a direct chat-query API to trigger its focus command, open the target file at the issue line, copy the enriched Fix Prompt to the clipboard, and display a helpful toast notification.

## Implementation Decisions

### 1. Module Boundaries & Deep Modules

- **`ProjectDetector`**: Small interface exposing `detectConfig(workspaceRoot)` and `saveConfig(config)`. Hides file parsing of `sonar-project.properties`, VS Code configuration lookup, and `context.secrets` management.
- **`SonarClient`**: Small interface exposing `verifyConnection()`, `getOverview()`, `getDetails(category)`, `getEnrichedRule(ruleKey)`, and `fetchProjects()`. Hides HTTP authentication headers, pagination, error code translation, in-memory caching of rule documentation, and JSON mapping.
- **`AgentDispatcher`**: Small interface exposing `getAvailableAgents()`, `dispatchSingle(item, targetAgentId)`, and `dispatchBatch(items, targetAgentId)`. Hides path resolution, environment and extension discovery, code context extraction from local text documents, rule enrichment assembly, command dispatching, and clipboard fallback.
- **`SonarOverviewViewProvider`**: Implements `vscode.WebviewViewProvider`. Encapsulates the Webview HTML lifecycle, container-aware styles, dynamic dropdown population for detected agents, and the two-way message protocol between webview scripts and the extension host.

### 2. UI & Webview Architecture

- Built with **Vanilla TypeScript + HTML/CSS** with zero third-party UI framework bloat, guaranteeing instant load times in the VS Code sidebar.
- Styled using CSS **Container Queries** (`container-type: inline-size`) on the root container, allowing adaptive reflow between 1-column and 2-column metric cards based on sidebar width rather than viewport width.
- Colors and typography bound strictly to VS Code theme variables (`var(--vscode-*)`) combined with standardized Sonar rating palette tokens.
- Target Agent dropdown dynamically renders `<option>` elements from the array sent via `_syncState()`.

### 3. Agent Dispatch Contracts

- **Dynamic Discovery**:
  - `copilot`: Detected if extension `github.copilot` or `github.copilot-chat` is installed.
  - `antigravity`: Detected if running in an Antigravity IDE environment (`appName` contains Antigravity or Antigravity environment config present).
  - `claude-code`: Detected if extension `anthropic.claude-code` is installed.
  - `cline`: Detected if extension `saoudrizwan.claude-dev` is installed.
  - `roo-code`: Detected if extension `rooveterinaryinc.roo-cline` is installed.
  - `continue`: Detected if extension `continue.continue` is installed.
  - `clipboard`: Universal fallback always present at the end of the selector.
- **Dispatch Behavior**:
  - `copilot`: Triggers `workbench.action.chat.open` with `{ query: prompt }`.
  - Other agents: Triggers the agent's focus/open view command (if available), copies enriched Markdown prompt to system clipboard, opens the file at the problem line, and alerts the user.
- **Prompt Shape**: Structured Markdown containing:
  - Header with issue summary and file/line coordinates
  - Rule description and Sonar remediation recommendation
  - Code snippet window (10 lines above/below issue)
  - Explicit action prompt (Fix issue / Generate unit tests / Refactor duplication)

## Testing Decisions

### 1. Definition of a Good Test

- Tests must verify external module behavior across clean seams, not internal private state.
- No mocking of internal helper functions; test through the public methods of `SonarClient`, `ProjectDetector`, and `AgentDispatcher`.

### 2. Modules to Test

- **`ProjectDetector`**: Test parsing valid, invalid, and missing `sonar-project.properties` files, and fallback priority between properties, VS Code settings, and secrets.
- **`SonarClient`**: Test endpoint call construction, successful mapping of measures into `SonarOverview`, handling of HTTP 401/403/404 errors, and rule caching behavior.
- **`AgentDispatcher`**: Test prompt construction for single issues, batch issues, coverage prompts, duplication prompts, and verifying clipboard fallback when chat commands are mocked as unavailable.

### 3. Test Harness

- Unit testing with `mocha` or `vitest` with Node.js assertions.
- Fast execution decoupled from the live VS Code GUI via dependency injection of workspace and storage adapters.

## Out of Scope

- Running local SonarScanner CLI executions directly from the extension (the extension consumes analysis already completed on the SonarQube server).
- Writing back issue status changes (e.g., marking issues as "False Positive" or "Won't Fix" directly on SonarQube server) in version 1.0.
- Supporting SonarCloud-specific organization/enterprise multi-tenant SAML web login flows (standard User Tokens are used).

## Further Notes

- SonarQube Web API compatibility target: SonarQube 9.9 LTS and SonarQube 10.x+.
- Token storage uses VS Code's `context.secrets` API, which leverages OS-level keychains (macOS Keychain, Windows Credential Manager, Linux Secret Service).
