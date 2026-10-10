# 31: Pre-Commit & Git Stage Guard

**What to build:** A Git Stage Guard that monitors git staged files via the VS Code Git extension API (`vscode.git`). When files are staged, it checks if any staged file contains unresolved SonarQube issues from the local cache. If issues exist, it presents an actionable warning notification: `⚠️ Staged files contain <count> unresolved Sonar issues. Clean before pushing?` with buttons `[Clean Staged Files with AI]` and `[Ignore]`. Controlled via setting `sonarAgent.gitGuard.enabled` (default `true`), with a manual command `sonarAgent.checkStagedFiles`.

**Blocked by:** 28: 1-Click Clean Current File with AI

**Status:** complete

- [x] Git extension watcher hooks into `git.repositories` state changes via `vscode.extensions.getExtension('vscode.git')`.
- [x] Configurable setting `sonarAgent.gitGuard.enabled` (default `true`) allows users to enable or disable the guard.
- [x] Command `sonarAgent.checkStagedFiles` registered to allow manual inspection of staged files.
- [x] Warning notification displays when staged files have Sonar issues, offering `[Clean Staged Files with AI]` and `[Ignore]` options.
- [x] Clicking `[Clean Staged Files with AI]` triggers batch prompt dispatching for all issues found across staged files.
- [x] Unit tests verify Git API event handling, setting toggle behavior, notification filtering, and dispatching.
- [x] All test suites, linting, and typechecks pass with zero regressions.
