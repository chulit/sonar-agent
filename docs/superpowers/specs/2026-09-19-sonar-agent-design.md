# Sonar Agent VS Code Extension - Design Specification

## 1. Overview & Objective

**Sonar Agent** adalah ekstensi VS Code yang menghubungkan workspace pengembang dengan server SonarQube untuk memantau metrik **Overall Code** (bukan hanya New Code) dan mendelegasikan perbaikan masalah kode secara langsung ke editor AI Agent (seperti GitHub Copilot, Antigravity, dan Codex).

Ekstensi ini mereplikasi tampilan dashboard visual SonarQube (kartu metrik Reliability, Security, Maintainability, Coverage, Duplications, dan Security Hotspots) di sidebar VS Code, memungkinkan navigasi langsung ke file/baris terkait, serta menyediakan tombol aksi cerdas **"Send to Agent"** yang menyusun prompt kaya konteks (kode lokal + deskripsi aturan SonarQube + rekomendasi perbaikan).

---

## 2. Architecture & Deep Modules

Mengikuti prinsip **Deep Modules** (_small interface, rich behavior hidden inside, clear seams_):

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension                      │
│                                                             │
│  ┌───────────────────────────┐     ┌─────────────────────┐  │
│  │   SonarOverviewView       │◄───►│   ExtensionHost     │  │
│  │   (Sidebar Webview)       │     │   (Coordinator)     │  │
│  └───────────────────────────┘     └──────────┬──────────┘  │
│                                               │             │
│              ┌────────────────────────────────┼──────────┐  │
│              ▼                                ▼          ▼  │
│     ┌───────────────────┐             ┌───────────────┐ ┌┴────────────┐
│     │   SonarClient     │             │AgentDispatcher│ │Project      │
│     │   (Deep Module)   │             │(Deep Module)  │ │Detector     │
│     │ Small Interface:  │             │Small Interf.: │ │(Deep Module)│
│     │ - getOverview()   │             │- dispatch()   │ │- getConf()  │
│     │ - getDetails(cat) │             │- getAgents()  │ └─────────────┘
│     │ - getEnrichedRule │             └───────┬───────┘       │
│     └─────────┬─────────┘                     │               │
└───────────────┼───────────────────────────────┼───────────────┼─────
                ▼                               ▼               ▼
         SonarQube Server            VS Code Chat / LM API   Workspace
          (REST API)                 (Copilot, Antigravity)  (.properties)
```

### 2.1. `ProjectDetector` Module

- **Tanggung Jawab**: Mendeteksi konfigurasi SonarQube untuk workspace saat ini.
- **Interface**:
  ```typescript
  export interface ProjectConfig {
    serverUrl: string;
    projectKey: string;
    token?: string;
  }

  export interface IProjectDetector {
    detectConfig(workspaceRoot: string): Promise<ProjectConfig | null>;
    saveConfig(config: Partial<ProjectConfig>): Promise<void>;
  }
  ```
- **Hidden Implementation**:
  - Membaca `sonar-project.properties` di root workspace (`sonar.host.url`, `sonar.projectKey`).
  - Fallback ke VS Code configuration (`sonarAgent.serverUrl`, `sonarAgent.projectKey`).
  - Mengambil token secara aman dari `vscode.ExtensionContext.secrets`.

### 2.2. `SonarClient` Module

- **Tanggung Jawab**: Mengabstraksi komunikasi HTTP REST API dengan SonarQube server, caching aturan, pagination, dan error handling.
- **Interface**:
  ```typescript
  export interface SonarOverview {
    security: { count: number; rating: 'A' | 'B' | 'C' | 'D' | 'E' };
    reliability: { count: number; rating: 'A' | 'B' | 'C' | 'D' | 'E' };
    maintainability: { count: number; rating: 'A' | 'B' | 'C' | 'D' | 'E' };
    acceptedIssues: { count: number };
    coverage: { percentage: number; linesToCover: number };
    duplications: { percentage: number; duplicatedLines: number };
    securityHotspots: { count: number; rating?: string };
  }

  export interface SonarDetailItem {
    id: string;
    ruleKey: string;
    message: string;
    component: string;
    line?: number;
    type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'HOTSPOT' | 'COVERAGE' | 'DUPLICATION';
    severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
    status: string;
    effort?: string;
    tags: string[];
    creationDate: string;
    duplicatedBlockSnippet?: string;
  }

  export interface SonarRuleDoc {
    key: string;
    name: string;
    htmlDesc: string;
    cleanDesc: string;
    recommendation: string;
  }

  export interface ISonarClient {
    verifyConnection(): Promise<boolean>;
    getOverview(): Promise<SonarOverview>;
    getDetails(
      category: 'issues' | 'coverage' | 'duplications' | 'hotspots',
    ): Promise<SonarDetailItem[]>;
    getEnrichedRule(ruleKey: string): Promise<SonarRuleDoc>;
    fetchProjects(): Promise<{ key: string; name: string }[]>;
  }
  ```
- **Endpoints SonarQube yang Digunakan**:
  - `GET /api/measures/component?component={projectKey}&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density,security_hotspots,reliability_rating,sqale_rating,security_rating,lines_to_cover,duplicated_lines`
  - `GET /api/issues/search?componentKeys={projectKey}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`
  - `GET /api/hotspots/search?projectKey={projectKey}&status=TO_REVIEW`
  - `GET /api/rules/show?key={ruleKey}`
  - `GET /api/measures/component_tree?component={projectKey}&metricKeys=uncovered_lines,duplicated_lines_density`

### 2.3. `AgentDispatcher` Module

- **Tanggung Jawab**: Merangkai prompt cerdas (rule + code context + exact line) dan mengirimkannya ke AI Agent atau clipboard.
- **Interface**:
  ```typescript
  export interface TargetAgent {
    id: string;
    name: string;
    command?: string;
  }

  export interface IAgentDispatcher {
    getAvailableAgents(): TargetAgent[];
    dispatchSingle(item: SonarDetailItem, targetAgentId: string): Promise<void>;
    dispatchBatch(items: SonarDetailItem[], targetAgentId: string): Promise<void>;
  }
  ```
- **Hidden Implementation**:
  - Resolusi lokasi file lokal dari `item.component` (menggunakan path lokal atau pencarian via `vscode.workspace.findFiles`).
  - Mengambil snippet kode lokal sekitar 10 baris di atas dan di bawah baris masalah.
  - Memanggil `SonarClient.getEnrichedRule(item.ruleKey)`.
  - Membuat format prompt khusus:
    - **Issues / Hotspots**: Instruksi perbaikan bug/code smell/vulnerability dengan konteks aturan Sonar.
    - **Coverage**: Instruksi pembuatan unit test untuk baris kode yang belum ter-cover.
    - **Duplications**: Instruksi refactoring (ekstraksi method/helper) untuk blok kode duplikat.
  - Mengirim prompt ke VS Code Chat API (`workbench.action.chat.open`) jika agent mendukung, atau otomatis menyalin ke clipboard + menampilkan notifikasi toast yang ramah.

### 2.4. `SonarOverviewViewProvider` Module

- **Tanggung Jawab**: Webview sidebar yang menampilkan onboarding / metrics dashboard / list issues.
- **Interface**: Implements `vscode.WebviewViewProvider`.
- **Fitur UI**:
  - Onboarding Welcome View jika server belum dikonfigurasi.
  - Header dengan nama project, selector Target Agent, tombol refresh & settings.
  - Metric Cards Grid (Security, Reliability, Maintainability, Coverage, Duplications, Hotspots) dengan status badge & rating huruf (A-E).
  - List View interaktif dengan checkbox multi-select dan tombol batch "Send X to Agent".
  - Navigasi file "Jump to Code".

---

## 3. Webview UI & Modern Styling Specification

- **Responsive Container Queries**: Menggunakan CSS `container-type: inline-size` pada `.sonar-dashboard`.
  - Lebar < 340px: Grid metrik berubah otomatis menjadi 1 kolom vertikal.
  - Lebar >= 340px: Grid metrik tampil 2 kolom (sesuai layout asli SonarQube).
- **Visual Design**:
  - Sesuai panduan _size-aware-styling_ dan _VS Code Webview guidelines_.
  - Warna rating Sonar:
    - Rating A: `#00aa5e`
    - Rating B: `#81b300`
    - Rating C: `#eabe06`
    - Rating D: `#ed7d20`
    - Rating E: `#d4333f`
  - Warna dan font mengikuti tema VS Code (`var(--vscode-editor-foreground)`, `var(--vscode-sideBar-background)`, dll.).
- **Zero Framework Bloat**: Menggunakan Vanilla HTML/CSS + Modern TypeScript untuk performa maksimal dan start-up instan di sidebar.

---

## 4. Error Handling & Edge Cases

1. **Server Unreachable / Invalid Token**:
   - Menampilkan alert status koneksi yang jelas di sidebar dengan tombol "Re-configure".
2. **Path Mapping Mismatch (Monorepo)**:
   - Jika `item.component` tidak langsung ditemukan di root workspace, fallback otomatis menjalankan `vscode.workspace.findFiles(`**/${path.basename(item.component)}`)` untuk menemukan path lokal yang akurat.
3. **Target Agent Extension Tidak Aktif**:
   - Fallback otomatis: Prompt disalin ke clipboard pengguna + file dibuka ke baris terkait + notifikasi petunjuk untuk mem-paste prompt ke chat agent pilihan pengguna.
4. **Offline / Cache**:
   - Aturan Sonar (`/api/rules/show`) di-cache di memori agar permintaan berulang tidak membebani network.

---

## 5. Testing & Verification Strategy

- **Unit Tests (`mocha` / `vitest`)**:
  - `ProjectDetector`: Menguji parsing file `sonar-project.properties`.
  - `SonarClient`: Menguji deserialisasi response JSON SonarQube menjadi model data typed.
  - `AgentDispatcher`: Menguji perakitan prompt dan formatting snippet kode.
- **Manual Verification**:
  - Menguji onboarding connect dengan mock SonarQube server atau instance lokal/remote.
  - Menguji responsivitas layout sidebar saat di-drag sempit (< 300px) dan lebar (> 500px).
  - Menguji tombol "Jump to Code" dan "Send to Agent" (Copilot / Antigravity / Clipboard fallback).
