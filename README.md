<p align="center">
  <img src="media/icon.png" width="128" height="128" alt="Sonar Agent Logo" />
</p>

<h1 align="center">Sonar Agent</h1>

<p align="center">
  <strong>SonarQube & SonarCloud AI Assistant for VS Code</strong><br>
  <em>Bridge clean code metrics with AI-assisted fixes (Copilot, Antigravity, Claude, Roo, Continue, Cline, Codex)</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/VS_Code-^1.85.0-blue?logo=visualstudiocode" alt="VS Code" />
  <img src="https://img.shields.io/badge/SonarQube-Compatible-4B9FD5?logo=sonarqube" alt="SonarQube" />
  <img src="https://img.shields.io/badge/AI_Agents-Copilot%20%7C%20Antigravity%20%7C%20Claude%20%7C%20Roo%20%7C%20Codex-8A2BE2" alt="AI Agents" />
</p>

---

A modern VS Code extension connecting your **SonarQube** and **SonarCloud** projects directly into the editor. Monitor real-time **Overall Code quality metrics**, inspect ratings (A–E), triage issues with rich filters, and use the **"Send to Agent"** workflow to automatically generate enriched AI fix prompts for **GitHub Copilot**, **Antigravity / Gemini**, **Claude Code**, **Roo Code**, **Continue**, **Cline**, **Codex**, or your clipboard.

A powerful companion to SonarLint that bridges clean code analysis with AI-assisted remediations.

---

## Features

- **Overall Code Dashboard**: Visualizes measures for Bugs, Vulnerabilities, Security Hotspots, Code Smells, Coverage, and Duplications mirroring SonarQube's web UI.
- **Rating Badges**: Clear A–E letter grade ratings with standard Sonar color coding.
- **Multiple Connection Profiles**: Seamlessly switch between different SonarQube / SonarCloud instances (e.g. production, staging, localhost) directly from the sidebar switcher.
- **Rich Issue Triage & Filtering**: Filter issues dynamically by Severity, Type, Author, File, Rule, and toggle test files exclusion.
- **Direct Drilldown**: Click on any metric card to inspect related issues or security hotspots.
- **Jump to Code**: Navigate directly to the affected file and line inside VS Code with a single click.
- **Send to Agent (AI-Assisted Fixing)**:
  - Enriches issues with SonarQube rule documentation and local surrounding code (10 lines of context).
  - Supports targeting **GitHub Copilot**, **Antigravity / Gemini**, **Claude Code**, **Roo Code**, **Continue**, **Cline**, **Codex**, or **Clipboard**.
  - Single issue fix and **batch multi-selection** with grouped per-file prompts.
  - Specialized actions for coverage gaps (_Generate Tests_) and duplicated code blocks (_Refactor_).
- **Editor Quick Fixes (Code Actions)**: Trigger `⚡ Send to AI Agent` directly from the editor lightbulb (`Cmd+.` / `Ctrl+.`) on any SonarLint or SonarQube diagnostic.
- **Responsive Layout**: Designed for the sidebar using modern CSS Container Queries (`@container`) with adaptive 1-column (<340px) and 2-column (≥340px) layouts.
- **Strict Security & Zero Token Leakage**:
  - Tokens are stored exclusively in the OS Keychain via `vscode.SecretStorage`.
  - Tokens are never exposed in `settings.json`, Webview `postMessage`, AI prompts, or git files.
  - Warns if plaintext credentials are found in `sonar-project.properties`.

---

## Getting Started

### Installation

#### Option A: Install from `.vsix`

1. Open the Extensions view (`Cmd+Shift+X` or `Ctrl+Shift+X`).
2. Click the **`...`** (More Actions) menu in the top-right corner of the Extensions view.
3. Select **Install from VSIX...**.
4. Pick the built `.vsix` package in the root of this project.

#### Option B: Run in Development Mode

1. Open this repository in VS Code.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Press **`F5`** to launch the Extension Development Host window.

---

## Configuration & Usage

### 1. Connection Profiles

1. Click the **Sonar Agent** icon in the Activity Bar to open the sidebar.
2. If no profiles exist, click **Add Profile** to create your first connection:
   - **Profile Name**: e.g. `SonarCloud`, `Company SonarQube`, or `Localhost`
   - **Server URL**: e.g. `https://sonarcloud.io` or `https://sonar.example.com`
   - **User Token**: Generated from SonarQube (_User > My Account > Security > Generate Tokens_)
3. Use the **Profile Switcher** dropdown at any time to switch active servers or manage profiles (Add, Edit, Delete).

### 2. Project Selection

- **Automatic Detection**: The extension automatically detects `sonar.projectKey` if a `sonar-project.properties` file exists in the workspace.
- **Server Search**: Alternatively, click the project selector in the sidebar or run `Sonar Agent: Select Sonar Project` to search and pick from your server's projects.

### 3. AI Agent Dispatch

- Select your default target agent from the dropdown at the bottom of the sidebar (**GitHub Copilot**, **Antigravity**, **Claude Code**, **Roo Code**, **Continue**, **Cline**, **Codex**, or **Clipboard**).
- Click **Fix with Agent** on any issue or select multiple issues and click **Send Selected to Agent**.

---

## Commands

Access these commands via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command                                         | Identifier                   | Description                                                  |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------ |
| **Sonar Agent: Refresh**                        | `sonarAgent.refresh`         | Re-fetches latest measures and issues from SonarQube         |
| **Sonar Agent: Select Sonar Project**           | `sonarAgent.selectProject`   | Opens a QuickPick list of projects from the connected server |
| **Sonar Agent: Configure Connection**           | `sonarAgent.configure`       | Opens interactive connection configuration and settings menu |
| **Sonar Agent: Manage Connection Profiles**     | `sonarAgent.profile.manage`  | Opens profile management to add, edit, or delete profiles    |
| **Sonar Agent: Disconnect & Reset Credentials** | `sonarAgent.resetConnection` | Disconnects and removes stored SonarQube credentials         |
| **Sonar Agent: Fix Sonar Issue with AI Agent**  | `sonarAgent.fixWithAgent`    | Triggers AI fix dispatch for the active diagnostic           |
| **Sonar Agent: Show Logs**                      | `sonarAgent.showLogs`        | Opens the Sonar Agent output log channel                     |

---

## Development & Testing

```bash
# Typecheck
npm run check

# Run unit tests
npm test

# Build bundle
npm run build

# Watch mode
npm run watch

# Package .vsix
npx @vscode/vsce package --no-git-tag-version --allow-missing-repository
```

---

## Architecture

- [`src/modules/ProjectDetector.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/ProjectDetector.ts): Resolves connection profiles, workspace properties, and secure token storage.
- [`src/modules/SonarClient.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarClient.ts): SonarQube REST API client with in-memory caching and error mapping.
- [`src/modules/FileNavigator.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/FileNavigator.ts): Workspace file resolution (with monorepo fallback) and editor line jumping.
- [`src/modules/AgentDispatcher.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/AgentDispatcher.ts): Assembles enriched prompts and dispatches to Copilot, Antigravity, Claude Code, Roo Code, Continue, Cline, Codex, or Clipboard.
- [`src/modules/SonarCodeActionProvider.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarCodeActionProvider.ts): Editor Quick Fix code action provider integrating Sonar diagnostics with AI agent fix prompts.
- [`src/modules/ItemFilter.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/ItemFilter.ts): Filtering and test file exclusion logic for issue lists.
- [`src/modules/SonarOverviewViewProvider.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarOverviewViewProvider.ts): Sidebar Webview view provider with CSS container queries and message passing.

---

## License

[MIT](LICENSE.md)
