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
The configuration associating the active workspace with a specific SonarQube server URL and project key.
_Avoid_: Connection, link, config mapping

**Target Agent**:
The specific AI coding assistant in the editor (e.g., GitHub Copilot, Antigravity, Codex) chosen to resolve a selected issue.
_Avoid_: AI, bot, assistant, LLM

**Fix Prompt**:
The enriched prompt constructed from the Sonar rule explanation, code context, and line number, dispatched to the Target Agent.
_Avoid_: Chat query, error message, instruction text
