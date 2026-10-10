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
24. As a developer, I want clicking the "Configure Connection" gear button in the sidebar header to open an interactive QuickPick configuration menu, so that I can update my SonarQube Server URL and token with live verification, switch projects, disconnect, or open settings.
25. As a developer, I want a reactive Filter Bar above the issues list (Severity, Author, File, Rule, Include Test Files) so that I can quickly narrow down issues of interest during drilldown review.
26. As a new user without an active SonarQube server or token, I want a "Try Demo Mode" button in the onboarding and empty profiles views, so that I can immediately explore the extension's features, metric cards, and issue triage with realistic sample data.
27. As a user exploring Demo Mode, I want to see a persistent banner informing me that Demo Mode is active with an "Exit Demo Mode" button, so that I understand I am viewing sample data and can switch back to connection setup at any time.
28. As a user in Demo Mode, I want sample metrics for Quality Gate (failed status), Bugs, Vulnerabilities, Security Hotspots, Code Smells, Coverage, and Duplications, so that I can experience the full dashboard layout and drilldown interactions.
29. As a user in Demo Mode, I want clicking "Fix with Agent" or "Send to Agent" on sample issues to generate and dispatch an enriched AI Fix Prompt, so that I can experience the core remediation workflow before connecting to a real server.
30. As a developer, I want a persistent Status Bar item displaying the current Quality Gate status (e.g. `$(pass) Sonar: Passed` or `$(error) Sonar: Failed`), so that I have ambient awareness of my code quality without having to open the sidebar.
31. As a developer, I want the Status Bar item to display a beaker icon (`$(beaker) Sonar: Demo (Failed)`) when Demo Mode is active, so that I can easily distinguish demo state from real server state.
32. As a developer, I want hovering over the Status Bar item to show a rich Markdown tooltip summarizing project key, Quality Gate conditions, and key metrics (Bugs, Vulnerabilities, Coverage), so that I can see health details without opening the sidebar.
33. As a developer, I want clicking the Status Bar item to immediately open and focus the Sonar Overview sidebar, so that I can navigate to the full dashboard with a single click.
34. As a developer, I want the Status Bar item to automatically update whenever metrics are refreshed, a profile is switched, or demo mode is toggled, so that it always reflects current workspace state.
35. As a developer browsing the VS Code Marketplace or GitHub repository, I want a dynamic demo visual and updated badges in the README, so that I can immediately understand the value and workflow of Sonar Agent before installing.
36. As a developer, I want a 1-click "Clean Current File with AI" action in the editor title bar, Command Palette, and Current Code sidebar, so that I can automatically aggregate all Sonar issues in my active file and send a unified batch fix prompt to my AI assistant.
37. As a developer, I want inline CodeLens annotations (`⚡ Sonar: <Issue Title> • [Fix with AI] • [Explain]`) above problematic lines in my code, so that I can triage and resolve issues without leaving the editor.
38. As a developer, I want clicking `[Explain]` on a Sonar CodeLens or issue to dispatch an educational prompt to my AI assistant, so that I can get a beginner-friendly explanation of why the rule matters and how to refactor it.
39. As a developer looking at low test coverage, I want an automatic test framework detector and a "Generate Missing Unit Tests" action that tailors the prompt to my project's framework (Vitest, Jest, Go test, Pytest), so that the AI generates idiomatic tests immediately.
40. As a developer committing changes, I want an optional Git Stage Guard that warns me if my staged files contain unresolved Sonar issues, so that I can fix them before pushing and avoid failing CI/CD Quality Gates.
41. As a developer reviewing metrics in the sidebar, I want responsive Bento Grid health rings (SVG circular progress) and a celebratory micro-animation when Quality Gate passes or issues reach zero, so that code quality review feels modern and rewarding.
42. As a developer practicing Clean as You Code, I want an interactive toggle between Overall Code and New Code in the Server dashboard, so that I can focus specifically on defects and coverage in my recent changes.
43. As a developer viewing New Code metrics, I want the Bento Health Rings and metrics grid to display new code metrics (`new_bugs`, `new_vulnerabilities`, `new_code_smells`, `new_coverage`, `new_duplicated_lines_density`), so that I can evaluate recent code additions at a glance.
44. As a developer drilling down into New Code issues, I want the issues drawer and drilldown lists to filter issues with `inNewCodePeriod=true`, so that I only see issues introduced during the leak period.
45. As a developer fixing issues in New Code mode, I want "Fix with AI" and "Clean Current File with AI" actions to prioritize and bundle only New Code issues into the prompt, so that remediation stays aligned with the Clean as You Code methodology.
46. As a developer tracking quality in the status bar, I want the ambient Status Bar and sidebar Quality Gate badge to reflect New Code conditions when New Code mode is active, so that I know whether my recent changes satisfy the quality gate regardless of legacy overall debt.

## Implementation Decisions

### 1. Module Boundaries & Deep Modules

- **`ProjectDetector`**: Small interface exposing `detectConfig(workspaceRoot)` and `saveConfig(config)`. Hides file parsing of `sonar-project.properties`, VS Code configuration lookup, and `context.secrets` management.
- **`SonarClient`**: Small interface exposing `verifyConnection()`, `getOverview(projectKey, codePeriod?)`, `getDetails(category)`, `getIssues(projectKey, category?, inNewCodePeriod?)`, `getQualityGateStatus(projectKey, codePeriod?)`, `getEnrichedRule(ruleKey)`, and `fetchProjects()`. Hides HTTP authentication headers, pagination, error code translation, in-memory caching of rule documentation, and JSON mapping. Supports Clean as You Code by fetching `new_*` metric keys and scoping issues to `inNewCodePeriod=true`.
- **`AgentDispatcher`**: Small interface exposing `getAvailableAgents()`, `dispatchSingle(item, targetAgentId)`, and `dispatchBatch(items, targetAgentId)`. Hides path resolution, environment and extension discovery, code context extraction from local text documents, rule enrichment assembly, command dispatching, and clipboard fallback. Scopes batch/file fix prompts to New Code when active.
- **`SonarOverviewViewProvider`**: Implements `vscode.WebviewViewProvider`. Encapsulates the Webview HTML lifecycle, container-aware styles, dynamic dropdown population for detected agents, the two-way message protocol between webview scripts and the extension host, manages Demo Mode state toggles, and handles the interactive `[Overall Code | New Code]` segmented control with `workspaceState` persistence.
- **`DemoData`**: Dedicated deep module encapsulating rich, realistic sample metrics, Quality Gate failure conditions, and mock issues with rule descriptions and snippet lines. Completely isolated from network dependencies.
- **`SonarStatusBar`**: Encapsulates `vscode.StatusBarItem` lifecycle (`createStatusBarItem`, update, dispose). Translates Quality Gate status (Passed, Failed, Warning, Demo, Disconnected) into clean icons, text, and rich markdown tooltips with single-click focus navigation, dynamically reflecting whether Overall or New Code period is currently selected.
- **`SonarCodeLensProvider`**: Implements `vscode.CodeLensProvider`. Encapsulates line coordinate mapping for Sonar diagnostics/cached issues and produces `[Fix with AI]` and `[Explain]` command lenses.
- **`TestFrameworkDetector`**: Inspects workspace manifests (`package.json`, `go.mod`, `pyproject.toml`) and returns detected testing frameworks, test templates, and runner conventions for enriched prompt generation.
- **`GitStageGuard`**: Integrates with the VS Code Git extension API (`vscode.git`). Monitors staged files and verifies them against cached Sonar issues, triggering interactive warning notifications and one-click AI resolution.

### 2. UI & Webview Architecture

- Built with **Vanilla TypeScript + HTML/CSS** with zero third-party UI framework bloat, guaranteeing instant load times in the VS Code sidebar.
- Styled using CSS **Container Queries** (`container-type: inline-size`) on the root container, allowing adaptive reflow between 1-column and 2-column metric cards based on sidebar width rather than viewport width.
- Colors and typography bound strictly to VS Code theme variables (`var(--vscode-*)`) combined with standardized Sonar rating palette tokens.
- Interactive **Segmented Control** (`[Overall Code | New Code]`) located within the Server tab header to toggle between lifetime project debt and Clean as You Code metrics.
- Onboarding and No Profiles views present an explicit secondary action button: `⚡ Try Demo Mode (Instant Preview)`.
- When Demo Mode is active, an accent demo banner is pinned at the top with an `Exit Demo Mode` button.

### 3. Agent Dispatch Contracts

- **Dynamic Discovery**:
  - `copilot`: Detected if extension `github.copilot` or `github.copilot-chat` is installed.
  - `antigravity`: Detected if running in an Antigravity IDE environment or if extension `google.google-antigravity` is installed.
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
- No mocking of internal helper functions; test through the public methods of `SonarClient`, `ProjectDetector`, `AgentDispatcher`, `SonarOverviewViewProvider`, and `SonarStatusBar`.

### 2. Modules to Test

- **`ProjectDetector`**: Test parsing valid, invalid, and missing `sonar-project.properties` files, and fallback priority between properties, VS Code settings, and secrets.
- **`SonarClient`**: Test endpoint call construction, successful mapping of measures into `SonarOverview`, handling of HTTP 401/403/404 errors, and rule caching behavior.
- **`AgentDispatcher`**: Test prompt construction for single issues, batch issues, coverage prompts, duplication prompts, and verifying clipboard fallback when chat commands are mocked as unavailable.
- **`SonarOverviewViewProvider`**: Test `enableDemoMode` and `disableDemoMode` message handling, payload delivery to webview, and state recovery.
- **`SonarStatusBar`**: Test status formatting (`$(pass)`, `$(error)`, `$(beaker)`), markdown tooltip generation, click command registration, and hide/dispose lifecycle.

### 3. Test Harness

- Unit testing with `vitest` with Node.js assertions.
- Fast execution decoupled from the live VS Code GUI via dependency injection of workspace and storage adapters.

## Out of Scope

- Running local SonarScanner CLI executions directly from the extension (the extension consumes analysis already completed on the SonarQube server).
- Writing back issue status changes (e.g., marking issues as "False Positive" or "Won't Fix" directly on SonarQube server) in version 1.0.
- Supporting SonarCloud-specific organization/enterprise multi-tenant SAML web login flows (standard User Tokens are used).
- Cross-window state synchronization for demo mode (scoped per extension host instance).

## Further Notes

- SonarQube Web API compatibility target: SonarQube 9.9 LTS and SonarQube 10.x+.
- Token storage uses VS Code's `context.secrets` API, which leverages OS-level keychains (macOS Keychain, Windows Credential Manager, Linux Secret Service).
