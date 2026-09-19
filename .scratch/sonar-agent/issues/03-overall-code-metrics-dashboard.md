# 03: Overall Code Metrics Dashboard with Container Queries

**What to build:** An Overall Code metrics dashboard rendered in the sidebar webview replicating SonarQube's visual design. It queries `/api/measures/component` for the bound project and displays the 6 metric cards (Security, Reliability, Maintainability, Coverage, Duplications, Security Hotspots) with official Sonar rating badges (A–E) and counts. The layout utilizes modern CSS Container Queries (`container-type: inline-size`) so that it seamlessly adapts between 1-column layout on narrow sidebars and 2-column grid on wider sidebars. Includes a manual Refresh button in the header.

**Blocked by:** 02: Auto-Detection of Project Configuration & Project Key Picker

**Status:** ready-for-agent

- [ ] SonarClient queries `/api/measures/component` for Overall Code metrics (`bugs`, `vulnerabilities`, `code_smells`, `coverage`, `duplicated_lines_density`, `security_hotspots`, `reliability_rating`, `sqale_rating`, `security_rating`, `lines_to_cover`, `duplicated_lines`).
- [ ] Metric cards render with exact Sonar ratings (A, B, C, D, E) styled with corresponding Sonar color tokens.
- [ ] Root dashboard container is styled with `container-type: inline-size` and adapts to 1 column below 340px and 2 columns at 340px or wider.
- [ ] Typography and base backgrounds use VS Code theme variables (`--vscode-*`) for seamless dark, light, and high-contrast support.
- [ ] A Refresh button in the header re-fetches latest measures from the server with a loading state indicator.
