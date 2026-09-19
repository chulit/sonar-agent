# 01: Project Scaffold & Sidebar Webview Shell with Onboarding Connection

**What to build:** A functional VS Code extension skeleton that registers the Sonar Agent sidebar view container. When opened without existing configuration, it displays an in-view onboarding form allowing the user to enter their SonarQube Server URL and User Token. Clicking "Connect & Verify" validates the credentials against the SonarQube server API, securely persists the token in VS Code SecretStorage, and transitions the sidebar into a connected state.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] VS Code extension project scaffolding configured with TypeScript, esbuild bundling, and package.json manifest.
- [x] Activity Bar icon and Sidebar Webview View Container registered and visible in VS Code.
- [x] Onboarding view rendered in sidebar with input fields for SonarQube Server URL and User Token.
- [x] Submitting credentials validates connectivity against SonarQube API (`/api/system/status` or `/api/authentication/validate`).
- [x] Successful connection securely stores the token in `context.secrets` and stores the server URL in workspace settings.
- [x] Sidebar transitions from onboarding view to connected view upon successful verification.
- [x] Meaningful error messages are displayed if connection fails (e.g. invalid URL or unauthorized 401).
