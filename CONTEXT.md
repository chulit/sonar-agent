# Sonar Agent

A VS Code extension that aggregates SonarQube Overall Code metrics (Issues, Coverage, Duplications, Security Hotspots) and dispatches contextual fix prompts to editor AI agents.

## Language

### Sonar Analysis Concepts

**Overall Code**:
The complete codebase analysis across all tracked lines, distinct from the recent changes ("New Code") leak period.
_Avoid_: Full code, total code, all code

**Metric**:
A quantitative measurement or rating computed by SonarQube (e.g., Reliability Rating, Coverage percentage).
_Avoid_: Score, stat, grade

**Issue**:
A flaw or defect detected in the code by a Sonar rule, categorized by severity (Bugs, Vulnerabilities, Code Smells).
_Avoid_: Error, warning, bug (too narrow), violation

**Security Hotspot**:
A security-sensitive section of code flagged for human review to assess vulnerability risks.
_Avoid_: Vulnerability (until confirmed), security alert

**Coverage**:
The proportion of executable code lines covered by unit tests, including identified uncovered lines.
_Avoid_: Test score, test percentage

**Duplication**:
Blocks of identical or near-identical code identified across files in the project.
_Avoid_: Clone, copy-paste block

### Extension & Agent Concepts

**Project Binding**:
The active association between the workspace and a specific SonarQube server URL and project key. Only one binding is active at a time; switching bindings switches the active server, project, and token together.
_Avoid_: Connection, link, config mapping

**Connection Profile**:
A user-named stored triple (server URL + project key + token reference) that can be activated as the current Project Binding. Example: `kantor-prod`. Tokens for each profile reside exclusively in `vscode.ExtensionContext.secrets` under per-profile keys.
_Avoid_: Connection alone, account, server entry

**Target Agent**:
The specific AI coding assistant in the editor (e.g., GitHub Copilot, Antigravity, Codex) chosen to resolve a selected issue.
_Avoid_: AI, bot, assistant, LLM

**Fix Prompt**:
The enriched prompt constructed from the Sonar rule explanation, code context, and line number, dispatched to the Target Agent.
_Avoid_: Chat query, error message, instruction text

## Security Invariants

- **Zero Token Leakage**: The SonarQube authentication token must NEVER be written to `settings.json`, workspace files, or git. It must reside exclusively in OS-encrypted `vscode.ExtensionContext.secrets`.
- **No Token in Webview**: The extension host must never transmit user tokens to Webview scripts via `postMessage`.
- **No Token in AI Prompts**: Fix Prompts dispatched to AI Agents (Copilot, Antigravity, Codex, Clipboard) must strictly exclude tokens, authorization headers, or private credentials.
- **No Token in URLs**: All API requests must transmit authentication tokens via HTTP `Authorization` headers, never via URL query parameters (which leak in server access logs and proxy logs).
- **Plaintext Properties Warning**: If `sonar-project.properties` contains plaintext credentials (`sonar.login` or `sonar.token`), the extension must never commit or persist them, and should warn the user.
