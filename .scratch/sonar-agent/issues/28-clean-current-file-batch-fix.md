# 28: 1-Click Clean Current File with AI

**What to build:** A 1-Click "Clean Current File with AI" feature that aggregates all SonarQube issues in the currently active editor file (using a hybrid lookup of SonarClient cached issues by matching relative file path and fallback to active VS Code Sonar diagnostics). Exposes an editor title bar action button (`$(sparkle) Clean Current File with AI`), a command palette command (`sonarAgent.cleanCurrentFile`), and an action button in the sidebar Current Code view. Assembles an enriched batch fix prompt containing all file issues and dispatches it directly to the active AI agent.

**Blocked by:** 25: Try Demo Mode Onboarding, 26: Status Bar Quality Gate Item

**Status:** ready-for-agent

- [ ] Hybrid file issue aggregator finds all Sonar issues for the active text editor document (SonarClient cache + fallback to active editor diagnostics).
- [ ] Command `sonarAgent.cleanCurrentFile` registered and exposed in Command Palette.
- [ ] Editor title bar action button (`$(sparkle) Clean Current File with AI`) added under `editor/title` with `when: editorTextFocus` condition.
- [ ] Sidebar Current Code view displays a "Clean File with AI" batch action button when issues exist for the current file.
- [ ] Dispatches a comprehensive batch prompt including file path, rule summaries, line numbers, and code context to the selected AI assistant.
- [ ] Displays informative notification if no Sonar issues are detected in the active file.
- [ ] Unit tests verify file path matching, hybrid fallback resolution, command dispatching, and notification on clean files.
- [ ] All test suites, linting, and typechecks pass with zero regressions.
