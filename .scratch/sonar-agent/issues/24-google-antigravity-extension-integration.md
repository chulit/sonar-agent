# 24: Google Antigravity Extension Discovery & Dispatch

**What to build:** Target Agent discovery and dispatch recognizes the official VS Code extension `google.google-antigravity` alongside the standalone Antigravity IDE environment. When the extension is installed in regular VS Code, Antigravity Agent appears in the selector with proper priority, and Fix Prompts dispatch to Antigravity chat or focus view with clipboard fallback.

**Blocked by:** 08: Dynamic Agent Discovery & Reactive Selector UI, 15: Deepen the Agent Dispatch Seam

**Status:** ready-for-agent

- [x] Target Agent discovery inspects `google.google-antigravity` alongside existing extension identifiers when querying available assistants.
- [x] Priority ordering correctly places Antigravity directly following GitHub Copilot (`Copilot > Antigravity > Other Agent > Clipboard`).
- [x] Dispatches Fix Prompts to Antigravity chat or opens the Antigravity chat view and copies the prompt to the clipboard when targeting Antigravity.
- [x] Unit tests verify discovery of Antigravity when only `google.google-antigravity` is installed in a standard VS Code environment.
- [x] All test suites and typechecks pass with zero regressions.
