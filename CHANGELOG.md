# [1.1.0](https://github.com/chulit/sonar-agent/compare/v1.0.0...v1.1.0) (2026-09-20)

### Bug Fixes

- **dispatcher:** safely narrow diagnostic code when mapping issue ([8af9067](https://github.com/chulit/sonar-agent/commit/8af90671af115aa3ba716c5e0945e692b72d3625))
- **docs:** add marketplace and open-vsx badges to readme ([6b40d9f](https://github.com/chulit/sonar-agent/commit/6b40d9ff8e92f7d1fa8b63bc7fc9f35023d6a49d))
- **quality:** resolve TypeScript test errors and clean code smells ([fd67901](https://github.com/chulit/sonar-agent/commit/fd679010d50e857409802cac131279112fbcab7f))
- **scan:** pass active binding to sonar-scanner CLI ([88047b9](https://github.com/chulit/sonar-agent/commit/88047b941d0979a7092a291de1bbd1c480a24490))
- **scan:** resolve static analysis and typing issues in local scanner ([98e0ce7](https://github.com/chulit/sonar-agent/commit/98e0ce79494b3a0b60bb721af0675489def395f2))

### Features

- **client:** fetch security review rating for hotspots and remove redundant endpoint ([19bdd44](https://github.com/chulit/sonar-agent/commit/19bdd44e2ed675fe02ae9d4c7fbfdb998edbbfd0))
- **current-code:** add Current Code tab with SonarLint feed and CLI scan ([a3fa40c](https://github.com/chulit/sonar-agent/commit/a3fa40c03c01b6c7029fa562b3af47c70b2de2d2))
- **dispatcher:** add Codex Agent integration and focus command dispatch ([5987f81](https://github.com/chulit/sonar-agent/commit/5987f81319d3ef3068745a45139855e5936eddba))

# [1.1.0](https://github.com/chulit/sonar-agent/compare/v1.0.0...v1.1.0) (2026-09-20)

### Bug Fixes

- **dispatcher:** safely narrow diagnostic code when mapping issue ([8af9067](https://github.com/chulit/sonar-agent/commit/8af90671af115aa3ba716c5e0945e692b72d3625))
- **quality:** resolve TypeScript test errors and clean code smells ([fd67901](https://github.com/chulit/sonar-agent/commit/fd679010d50e857409802cac131279112fbcab7f))
- **scan:** pass active binding to sonar-scanner CLI ([88047b9](https://github.com/chulit/sonar-agent/commit/88047b941d0979a7092a291de1bbd1c480a24490))
- **scan:** resolve static analysis and typing issues in local scanner ([98e0ce7](https://github.com/chulit/sonar-agent/commit/98e0ce79494b3a0b60bb721af0675489def395f2))

### Features

- **client:** fetch security review rating for hotspots and remove redundant endpoint ([19bdd44](https://github.com/chulit/sonar-agent/commit/19bdd44e2ed675fe02ae9d4c7fbfdb998edbbfd0))
- **current-code:** add Current Code tab with SonarLint feed and CLI scan ([a3fa40c](https://github.com/chulit/sonar-agent/commit/a3fa40c03c01b6c7029fa562b3af47c70b2de2d2))
- **dispatcher:** add Codex Agent integration and focus command dispatch ([5987f81](https://github.com/chulit/sonar-agent/commit/5987f81319d3ef3068745a45139855e5936eddba))

# 1.0.0 (2026-09-20)

### Bug Fixes

- **client:** sort duplications and coverage metrics and enable accepted issues drilldown ([597ee48](https://github.com/chulit/sonar-agent/commit/597ee48ec16c7e5613d56534bfd5527fc9a87b67))
- **config:** register profiles and activeProfileId settings so profile writes succeed ([2e394cf](https://github.com/chulit/sonar-agent/commit/2e394cf5fa938450a23e9595dd53718a8ae69090))
- **webview:** improve initial state sync and fix settings gear icon ([6a72a53](https://github.com/chulit/sonar-agent/commit/6a72a538f730d2281530201e71246b25fbea8a41))
- **webview:** transition immediately to connected view on credentials and fetch measures in parallel ([9c5960b](https://github.com/chulit/sonar-agent/commit/9c5960b422e7175935921768276e7baaadc6edfd))

### Features

- add searchable project combobox and fix project selection persistence ([29ada1b](https://github.com/chulit/sonar-agent/commit/29ada1b55c46f80eb6f318246d8046fa7b84bb9c))
- **agent:** implement dynamic agent discovery, focus dispatch, and Claude Code support ([7f854b8](https://github.com/chulit/sonar-agent/commit/7f854b84c1b6b5b1b99853756ea18e71bd025647))
- **assets:** add flat Sonar wave icon and update branding ([a170965](https://github.com/chulit/sonar-agent/commit/a17096561b49fe916176ed3bc569e9dfe7e2fa57))
- complete Ticket 01 - project scaffold and onboarding connection ([2d02dd4](https://github.com/chulit/sonar-agent/commit/2d02dd4de04ae032cfe5d48a60e9ddd6d0f9a195))
- complete Ticket 02 - auto-detection of project config and project key picker ([ec38110](https://github.com/chulit/sonar-agent/commit/ec381102f5370f9efeae8b270eab3b8941e4bc45))
- complete Ticket 03 - overall code metrics dashboard with container queries ([18ca0d4](https://github.com/chulit/sonar-agent/commit/18ca0d45b7f7070e3b871b7c7a46ae07e08c75b5))
- complete Ticket 04 - issues drilldown and local file navigation ([9cf2000](https://github.com/chulit/sonar-agent/commit/9cf20004088821158fd641ee6d4a09aa6fe203a5))
- complete Tickets 05, 06, 07 - rule enrichment, batch send, and coverage/duplications actions ([ad23cfc](https://github.com/chulit/sonar-agent/commit/ad23cfce3969b7f7cf6c072657a56e429ece1f24))
- **config:** add interactive connection quickpick and credentials wizard ([437844c](https://github.com/chulit/sonar-agent/commit/437844c2fdafef1b09f9c146e0127dcace21cd7a))
- **logging:** add Sonar Agent LogOutputChannel with automatic URL and token redaction ([b9537d3](https://github.com/chulit/sonar-agent/commit/b9537d3a0528a9f753b1b8a6d47279f6affd4887))
- **profiles:** add connection profile store with per-profile secrets ([fff4b12](https://github.com/chulit/sonar-agent/commit/fff4b12cd49cf92866b5f4e5203ba899582de089))
- **profiles:** add profile switcher UI with manage menu and no-profiles state ([cfd26c0](https://github.com/chulit/sonar-agent/commit/cfd26c048fe57510e121f4a408e0f86227ef1fc2))
- **profiles:** migrate legacy single connection and demote properties to suggestion ([e990b84](https://github.com/chulit/sonar-agent/commit/e990b843d0c225541f30b75473d97316bae1268d))
- **webview:** add reactive issues filter bar for severity, author, file, rule, and tests ([62d3fe3](https://github.com/chulit/sonar-agent/commit/62d3fe37855792db26982bff1cdefe1cddb19de1))
