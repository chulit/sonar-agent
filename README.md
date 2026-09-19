# Sonar Agent: SonarQube & SonarCloud AI Assistant for VS Code

A modern VS Code extension connecting your **SonarQube** and **SonarCloud** projects directly into the editor. Monitor real-time **Overall Code quality metrics**, inspect ratings (A–E), and use the **"Send to Agent"** workflow to automatically generate enriched AI fix prompts for **GitHub Copilot**, **Antigravity / Gemini**, **Codex**, or your clipboard.

A powerful companion to SonarLint that bridges clean code analysis with AI-assisted remediations.

---

## Features

- **Overall Code Dashboard**: Visualizes measures for Bugs, Vulnerabilities, Security Hotspots, Code Smells, Coverage, and Duplications mirroring SonarQube's web UI.
- **Rating Badges**: Clear A–E letter grade ratings with standard Sonar color coding.
- **Direct Drilldown**: Click on any metric card to inspect related issues or hotspots.
- **Jump to Code**: Navigate directly to the affected file and line inside VS Code with a single click.
- **Send to Agent (AI-Assisted Fixing)**:
  - Enriches issues with SonarQube rule documentation and local surrounding code (10 lines of context).
  - Supports targeting **GitHub Copilot**, **Antigravity / Gemini**, **Codex**, or **Clipboard**.
  - Single issue fix and **batch multi-selection** with grouped per-file prompts.
  - Specialized actions for coverage gaps (⚡ *Generate Tests*) and duplicated code blocks (⚡ *Refactor*).
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
4. Pick `sonar-agent-0.1.0.vsix` located in the root of this project.

#### Option B: Run in Development Mode
1. Open this repository in VS Code.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Press **`F5`** to launch the Extension Development Host window.

---

## Configuration & Usage

1. Click the **Sonar Agent** icon in the Activity Bar to open the sidebar.
2. Enter your SonarQube server details:
   - **Server URL**: e.g. `https://sonar.example.com` or `http://localhost:9000`
   - **User Token**: Generated from SonarQube (*User > My Account > Security > Generate Tokens*)
3. Click **Connect**. The extension validates credentials against `/api/authentication/validate` and stores your token securely.
4. **Project Detection**:
   - The extension automatically detects `sonar.projectKey` if a `sonar-project.properties` file exists in the workspace.
   - Alternatively, click **Select / Change Project** to search and choose a project from your server.

---

## Commands

Access these commands via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Identifier | Description |
|---|---|---|
| **Sonar Agent: Refresh Metrics** | `sonarAgent.refreshMetrics` | Re-fetches latest measures and issues from SonarQube |
| **Sonar Agent: Select Project** | `sonarAgent.selectProject` | Opens a QuickPick list of projects from the connected server |

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

- [`src/modules/ProjectDetector.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/ProjectDetector.ts): Resolves workspace configuration, properties files, and secure token management.
- [`src/modules/SonarClient.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarClient.ts): SonarQube REST API client with in-memory caching and error mapping.
- [`src/modules/FileNavigator.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/FileNavigator.ts): Workspace file resolution (with monorepo fallback) and editor line jumping.
- [`src/modules/AgentDispatcher.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/AgentDispatcher.ts): Assembles enriched prompts and dispatches to Copilot/VS Code Chat or Clipboard.
- [`src/modules/SonarOverviewViewProvider.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarOverviewViewProvider.ts): Sidebar Webview view provider with CSS container queries and message passing.

---

## License

MIT
