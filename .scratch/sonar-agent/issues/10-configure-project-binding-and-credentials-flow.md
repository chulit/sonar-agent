# 10: Configure Project Binding & Interactive Credentials Flow

**What to build:** An interactive VS Code QuickPick configuration workflow triggered by the "Configure Connection" gear button (`sonarAgent.configure`) and command palette. Allows developers to view active connection details, update their SonarQube Server URL and User Token with live connection verification, switch the active Project Binding, disconnect and reset stored credentials, or open extension settings.

**Blocked by:** 09: Interactive Agent Focus & Streamlined Dispatch

**Status:** ready-for-agent

- [x] Command `sonarAgent.configure` displays an interactive QuickPick menu showing dynamic details (active Server URL, Project Binding, settings, and disconnect).
- [x] Option "Update Server URL & Token" prompts for Server URL (with HTTP/HTTPS validation) and User Token (password input) adhering to the zero token leakage invariant.
- [x] Live connection verification runs via `SonarClient.verifyConnection()` with a progress notification prior to saving credentials.
- [x] Verification failures present clear error feedback with "Retry" (preserving user inputs) and "Cancel" (preserving existing credentials) actions.
- [x] Successful connection updates persist the token in OS Keychain (`context.secrets`) and server URL in workspace settings.
- [x] Automatically triggers the project selection picker if no project key was detected in `sonar-project.properties` or if switching to a new server without an active project.
- [x] Sidebar Sonar Overview view automatically refreshes its metrics and state once credentials or configuration change.
- [x] Comprehensive unit tests cover the QuickPick menu interactions, connection verification paths (success, retry, cancel), credential persistence, and error handling.
