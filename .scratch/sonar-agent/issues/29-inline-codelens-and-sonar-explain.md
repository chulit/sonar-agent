# 29: Inline CodeLens & Sonar Explain Prompt Flow

**What to build:** An inline `SonarCodeLensProvider` displaying actionable CodeLens annotations above lines/functions containing Sonar issues (`⚡ Sonar: <Issue Title> • [Fix with AI] • [Explain]`). Clicking `[Fix with AI]` triggers the existing `sonarAgent.fixWithAgent` action. Clicking `[Explain]` triggers `sonarAgent.explainRuleWithAgent`, which assembles an educational prompt containing the issue location, local code snippet, rule description, and instructions for the AI assistant to explain the problem in beginner-friendly terms with clean refactoring patterns.

**Blocked by:** 28: 1-Click Clean Current File with AI

**Status:** complete

- [x] `SonarCodeLensProvider` registered for active text documents with configurable setting `sonarAgent.editor.codeLens.enabled` (default `true`).
- [x] CodeLens renders above issues with format `⚡ Sonar: <Issue Title> • [Fix with AI] • [Explain]`.
- [x] Clicking `[Fix with AI]` dispatches the issue fix prompt to the active AI agent.
- [x] Command `sonarAgent.explainRuleWithAgent` registered and wired to `[Explain]` CodeLens button.
- [x] Prompt assembler builds educational "Sonar Explain" prompt asking the AI agent to explain why the pattern is problematic and how to refactor it in simple, actionable terms.
- [x] Unit tests verify CodeLens generation, position calculation, toggle setting behavior, and explain prompt construction.
- [x] All test suites, linting, and typechecks pass with zero regressions.
