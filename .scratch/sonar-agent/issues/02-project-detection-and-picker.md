# 02: Auto-Detection of Project Configuration & Project Key Picker

**What to build:** Automatic discovery of the active project's SonarQube binding from `sonar-project.properties` in the workspace root. If the file is not present or `sonar.projectKey` is missing, the extension fetches available projects from the SonarQube server (`/api/projects/search`) and presents an interactive project dropdown picker in the sidebar header, saving the selected project key to workspace configuration.

**Blocked by:** 01: Project Scaffold & Sidebar Webview Shell with Onboarding Connection

**Status:** ready-for-agent

- [ ] ProjectDetector reads `sonar-project.properties` in workspace root and extracts `sonar.projectKey` and `sonar.host.url`.
- [ ] If `sonar.projectKey` is found, the project binding is established automatically and reflected in the sidebar header.
- [ ] If `sonar-project.properties` is absent, the extension queries `/api/projects/search` on the connected SonarQube server.
- [ ] The user can choose a project from an interactive dropdown selector in the sidebar header or via a project picker command.
- [ ] The selected project key is persisted in VS Code workspace configuration (`sonarAgent.projectKey`).
- [ ] A settings button allows the user to re-select or change the active project binding at any time.
