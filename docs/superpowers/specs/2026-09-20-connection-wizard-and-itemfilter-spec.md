# Design Spec: Connection Profile Wizard Extraction & ItemFilter Retirement

- **Date:** 2026-09-20
- **Status:** Approved (Reviewed via Grilling Loop)
- **Primary Modules:**
  - Candidate 2: [`src/modules/ConnectionProfileWizard.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/ConnectionProfileWizard.ts) (New), [`src/modules/SonarOverviewViewProvider.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarOverviewViewProvider.ts), [`src/extension.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/extension.ts)
  - Candidate 3: [`src/modules/ItemFilter.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/ItemFilter.ts) (Retired), [`test/ItemFilter.test.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/test/ItemFilter.test.ts) (Retired)
- **Related Documents:** [`CONTEXT.md`](file:///Users/kholid/Documents/Project/JS/sonar-agent/CONTEXT.md), [`SPEC.md`](file:///Users/kholid/Documents/Project/JS/sonar-agent/SPEC.md), [`docs/adr-001-multiple-profiles.md`](file:///Users/kholid/Documents/Project/JS/sonar-agent/docs/adr-001-multiple-profiles.md)

---

## 1. Candidate 2: Extract Connection Profile Wizard

### 1.1 Problem Statement & Architectural Friction

Currently, [`SonarOverviewViewProvider.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarOverviewViewProvider.ts) acts as a monolithic _God Object_ (~2,700 lines). Over ~500 lines (lines 154 to 660) are occupied by interactive prompt wizards:

1. `promptProjectSelection()`: QuickPick for searching & selecting projects on the SonarQube server.
2. `promptConfigureConnection()`: QuickPick for main connection menu (status check, update credentials, switch profile, disconnect).
3. `promptUpdateCredentials()`: InputBoxes for Server URL & Personal Access Token, connectivity verification via `SonarClient`.
4. `promptManageProfiles()`: QuickPick for listing profiles, switching active profile, renaming, deleting.
5. `promptCreateProfile()`: Wizard for creating a new named connection profile with URL & token.

These prompt routines have no dependency on the Webview DOM/HTML lifecycle; they only depend on `ProjectDetector`, `SonarClient`, and VS Code `window` dialogs.

### 1.2 Module Architecture & Interface

Extract this logic into a dedicated deep module: [`ConnectionProfileWizard`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/ConnectionProfileWizard.ts).

```typescript
export interface ConnectionProfileWizardOptions {
  projectDetector: ProjectDetector;
  sonarClientFactory?: (config: { serverUrl: string; token: string }) => SonarClient;
  onConfigChanged?: () => Promise<void> | void;
  // Test seam injection:
  showQuickPickFn?: typeof vscode.window.showQuickPick;
  showInputBoxFn?: typeof vscode.window.showInputBox;
  showInformationMessageFn?: typeof vscode.window.showInformationMessage;
  showErrorMessageFn?: typeof vscode.window.showErrorMessage;
}

export class ConnectionProfileWizard {
  constructor(private readonly options: ConnectionProfileWizardOptions) {}

  public async promptConfigureConnection(): Promise<void>;
  public async promptProjectSelection(): Promise<void>;
  public async promptUpdateCredentials(initialUrl?: string, initialToken?: string): Promise<void>;
  public async promptManageProfiles(): Promise<void>;
  public async promptCreateProfile(): Promise<void>;
}
```

### 1.3 Caller Refactoring in `SonarOverviewViewProvider`

1. `SonarOverviewViewProvider` instantiates `ConnectionProfileWizard` in its constructor:
   ```typescript
   this.connectionWizard = new ConnectionProfileWizard({
     projectDetector: this.projectDetector,
     onConfigChanged: () => this._syncState(),
   });
   ```
2. `SonarOverviewViewProvider` delegates its existing public methods (`promptConfigureConnection`, `promptProjectSelection`, `promptManageProfiles`, `promptCreateProfile`) directly to `this.connectionWizard`.
3. Webview message handlers (`switchProfile`, `createProfile`, `selectProject`, `configureConnection`) delegate to `this.connectionWizard`.
4. Result: `SonarOverviewViewProvider.ts` sheds ~500 lines of complex UI wizard logic while preserving 100% backward compatibility for tests in `test/ConfigureConnection.test.ts` and extension commands in `src/extension.ts`.

---

## 2. Candidate 3: Retire Orphaned ItemFilter Module

### 2.1 Problem Statement & Dead Code Analysis

[`src/modules/ItemFilter.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/ItemFilter.ts) contains:

- `isTestFile(filePath?: string): boolean`
- `filterSonarItems(items: SonarDetailItem[], options: SonarItemFilterOptions): SonarDetailItem[]`

An audit of the codebase reveals:

1. `ItemFilter.ts` has **0 imports** across `src/`.
2. In `SonarOverviewViewProvider.ts` (~line 2253), filtering is performed directly in client-side vanilla JavaScript in the Webview DOM script for immediate, latency-free table row filtering when users select dropdowns or toggle checkboxes.
3. Maintaining `ItemFilter.ts` and its 10 unit tests in `test/ItemFilter.test.ts` represents unnecessary overhead and violates YAGNI (Ponytail anti-overengineering).

### 2.2 Decision & Actions

1. Delete `src/modules/ItemFilter.ts`.
2. Delete `test/ItemFilter.test.ts`.
3. Ensure no dangling exports or unused imports remain.

---

## 3. Implementation Phases & Tickets

- **Ticket 16**: `16-extract-connection-profile-wizard.md`
  - Implement `ConnectionProfileWizard` with unit tests in `test/ConnectionProfileWizard.test.ts`.
  - Refactor `SonarOverviewViewProvider` to delegate all prompt flows to `connectionWizard`.
  - Verify all existing `test/ConfigureConnection.test.ts` and extension commands work cleanly.
- **Ticket 17**: `17-retire-orphaned-item-filter.md`
  - Delete `src/modules/ItemFilter.ts` and `test/ItemFilter.test.ts`.
  - Verify build, tests, typecheck, and lint pass with 0 errors.
