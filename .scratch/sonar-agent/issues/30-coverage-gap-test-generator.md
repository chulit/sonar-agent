# 30: Test Generator from Coverage Gap

**What to build:** An automated test generator workflow that inspects files with coverage gaps and dispatches a tailored unit test creation prompt to the active AI agent. Detects project test framework automatically from workspace manifests (`package.json` for Vitest/Jest/Mocha, `go.mod` for Go test, `pyproject.toml` or `pytest.ini` for Pytest). Adds a prominent "Generate Missing Tests" button in the Coverage drilldown view and command `sonarAgent.generateMissingTests` for the active file.

**Blocked by:** 28: 1-Click Clean Current File with AI

**Status:** ready-for-agent

- [ ] Test framework detector identifies installed test frameworks and runner configurations (Vitest, Jest, Mocha, Go test, Pytest) from workspace manifest files.
- [ ] Command `sonarAgent.generateMissingTests` registered and exposed in Command Palette and Coverage drilldown item actions.
- [ ] Prompt assembler builds comprehensive test generation prompt specifying target functions, detected framework syntax, mocking conventions, and target coverage goals.
- [ ] Coverage drilldown in sidebar displays a "⚡ Generate Unit Tests" button next to low-coverage files.
- [ ] Unit tests verify test framework detection, prompt generation with custom frameworks, and command execution.
- [ ] All test suites, linting, and typechecks pass with zero regressions.
