# Design Spec: Deepen the Agent Dispatch Seam

- **Date:** 2026-09-20
- **Status:** Approved (Reviewed via Grilling Loop)
- **Primary Modules:** [`AgentDispatcher.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/AgentDispatcher.ts), [`SonarOverviewViewProvider.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarOverviewViewProvider.ts), [`SonarCodeActionProvider.ts`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarCodeActionProvider.ts)
- **Related Documents:** [`CONTEXT.md`](file:///Users/kholid/Documents/Project/JS/sonar-agent/CONTEXT.md), [`SPEC.md`](file:///Users/kholid/Documents/Project/JS/sonar-agent/SPEC.md), [`docs/adr-001-multiple-profiles.md`](file:///Users/kholid/Documents/Project/JS/sonar-agent/docs/adr-001-multiple-profiles.md)

---

## 1. Problem Statement & Architectural Friction

### 1.1 Shallow Dispatch Interface

Currently, [`AgentDispatcher`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/AgentDispatcher.ts) is a shallow module: its external interface exposes fragmented building blocks (`assemblePrompt`, `assembleBatchPrompt`, `getRule`, `dispatch`, `getAvailableAgents`) rather than full dispatch capabilities.

### 1.2 Redundant Caller Orchestration

Every caller wishing to delegate a Sonar issue to an AI agent—both [`SonarOverviewViewProvider`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarOverviewViewProvider.ts#L663-L708) (sidebar webview) and [`SonarCodeActionProvider`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarCodeActionProvider.ts#L59-L72) (editor quick fix)—is forced to repeat an identical 6-step ritual:

1. Query active server URL and token from `ProjectDetector`.
2. Construct a `SonarClient` instance if credentials exist.
3. Wire an ad-hoc `fetchRuleFn: (key) => client.getEnrichedRule(key)` into a freshly instantiated `AgentDispatcher`.
4. Check available agents and fallback to `sonarAgent.defaultAgent`.
5. Call `dispatcher.assemblePrompt(item)` or `assembleBatchPrompt(items)`.
6. Call `dispatcher.dispatch(prompt, agentId, item)`.

### 1.3 Constructor Dependency Injection Bypass

In [`SonarOverviewViewProvider`](file:///Users/kholid/Documents/Project/JS/sonar-agent/src/modules/SonarOverviewViewProvider.ts#L28-L29), an `AgentDispatcher` instance is injected into the constructor, but during message handling (`sendToAgent` and `sendBatchToAgent`), that injected instance is completely ignored and a new one is instantiated ad-hoc.

---

## 2. Architectural Decisions & Seams

Following the principles of deep module design:

### 2.1 Deepen `AgentDispatcher` Behind a Small, High-Leverage Seam

`AgentDispatcher` will accept `ProjectDetector` (and an injectable `sonarClientFactory` adapter for hermetic unit testing) directly at construction.
It will internally resolve active connection credentials, fetch/cache enriched rule documentation, extract local code snippets, assemble prompts, determine target agent fallbacks, and execute dispatch.

### 2.2 Three Explicit High-Level Entry Points

The public interface will provide three purpose-built dispatch methods:

1. `dispatchIssue(item: SonarDetailItem, options?: DispatchOptions): Promise<DispatchResult>`
2. `dispatchBatch(items: SonarDetailItem[], options?: DispatchOptions): Promise<DispatchResult>`
3. `dispatchDiagnostic(diagnostic: vscode.Diagnostic, document: vscode.TextDocument, options?: DispatchOptions): Promise<DispatchResult>`

### 2.3 Automated Target Agent Fallback Resolution

If `options.targetAgentId` is omitted, `AgentDispatcher` resolves the target agent internally by querying `sonarAgent.defaultAgent` from workspace configuration and validating it against installed editor extensions (`copilot`, `antigravity`, `claude`, `codex`, `cline`, `roo`, `continue`), falling back safely to `'clipboard'`.

### 2.4 Backward Compatibility for Existing Unit Tests

Low-level methods (`assemblePrompt`, `assembleBatchPrompt`, `getRule`, `getAvailableAgents`, and raw `dispatch`) remain public to ensure existing unit tests continue to pass without regression.

---

## 3. Detailed Interfaces & Contracts

### 3.1 `AgentDispatcherOptions` & Supporting Types

```typescript
export interface DispatchOptions {
  targetAgentId?: string;
}

export interface DispatchResult {
  ok: boolean;
  message: string;
}

export interface AgentDispatcherOptions {
  fileNavigator?: FileNavigator;
  projectDetector?: ProjectDetector;
  sonarClientFactory?: (config: { serverUrl: string; token: string }) => SonarClient;
  fetchRuleFn?: (ruleKey: string) => Promise<SonarRuleDoc>;
  readCodeSnippetFn?: (filePath: string, line?: number) => Promise<CodeSnippetContext | null>;
  isExtensionInstalledFn?: (extensionId: string) => boolean;
  isAntigravityEnvFn?: () => boolean;
  executeCommandFn?: (command: string, ...args: unknown[]) => Thenable<unknown> | Promise<unknown>;
  sendToAgentPanelFn?: (options: SendToAgentPanelOptions) => Thenable<void> | Promise<void>;
  getDefaultAgentFn?: () => string;
}
```

### 3.2 Public Methods on `AgentDispatcher`

```typescript
export class AgentDispatcher {
  // --- High-Level Methods (New) ---
  async dispatchIssue(item: SonarDetailItem, options?: DispatchOptions): Promise<DispatchResult>;
  async dispatchBatch(items: SonarDetailItem[], options?: DispatchOptions): Promise<DispatchResult>;
  async dispatchDiagnostic(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument,
    options?: DispatchOptions,
  ): Promise<DispatchResult>;
  async resolveTargetAgent(requestedAgentId?: string): Promise<string>;

  // --- Low-Level / Inspection Methods (Preserved for compatibility) ---
  async assemblePrompt(item: SonarDetailItem): Promise<string>;
  async assembleBatchPrompt(items: SonarDetailItem[]): Promise<string>;
  async getRule(ruleKey: string): Promise<SonarRuleDoc>;
  async readCodeSnippet(filePath: string, line?: number): Promise<CodeSnippetContext | null>;
  async getAvailableAgents(): Promise<TargetAgent[]>;
  async dispatch(
    prompt: string,
    targetAgentId: string,
    item?: SonarDetailItem,
    allItems?: SonarDetailItem[],
  ): Promise<DispatchResult>;
}
```

---

## 4. Caller Transformations

### 4.1 `SonarOverviewViewProvider`

- **Constructor:** Passes `this.projectDetector` into the default `AgentDispatcher`.
- **`_handleSendToAgent`:**
  ```typescript
  private async _handleSendToAgent(item: SonarDetailItem, targetAgentId?: string): Promise<void> {
    await this.agentDispatcher.dispatchIssue(item, { targetAgentId });
  }
  ```
- **`_handleSendBatchToAgent`:**
  ```typescript
  private async _handleSendBatchToAgent(items: SonarDetailItem[], targetAgentId?: string): Promise<void> {
    await this.agentDispatcher.dispatchBatch(items, { targetAgentId });
  }
  ```
- **Impact:** Eliminates ~40 lines of duplicate client setup and resolves the constructor DI bypass bug.

### 4.2 `SonarCodeActionProvider`

- **Constructor:** Retains dependency injection for `dispatcher?: AgentDispatcher`, defaulting to `new AgentDispatcher({ projectDetector: options.projectDetector, fileNavigator: this.fileNavigator })`.
- **`executeFixWithAgent`:**
  ```typescript
  async executeFixWithAgent(diagnostic: vscode.Diagnostic, document: vscode.TextDocument): Promise<DispatchResult> {
    return this.dispatcher.dispatchDiagnostic(diagnostic, document);
  }
  ```
- **Impact:** Shrinks `executeFixWithAgent` from 55 lines of redundant code to a single 1-line delegation.

---

## 5. Test Plan & Verification

1. **Unit Tests in `test/AgentDispatcher.test.ts`**:
   - `dispatchIssue`: Verify that when `projectDetector` is provided, `AgentDispatcher` uses `sonarClientFactory` to fetch enriched rule docs and formats prompt with rule details.
   - `dispatchBatch`: Verify batch prompt generation and delegation to active agent.
   - `dispatchDiagnostic`: Verify that diagnostic severity, range, message, and relative path are correctly mapped to a `SonarDetailItem` and dispatched.
   - `resolveTargetAgent`: Verify fallback order (`requested` -> `defaultAgent` from config -> first available agent -> `clipboard`).
2. **Regression Verification**:
   - Existing 14 unit tests in `test/AgentDispatcher.test.ts` pass without changes.
   - `test/SonarCodeActionProvider.test.ts` passes cleanly with the new `dispatchDiagnostic` implementation.
   - `test/WebviewProvider.test.ts` passes cleanly using the injected `agentDispatcher`.
3. **Full Suite Verification**:
   - `npm test` (all 88+ tests pass).
   - `npm run check` (TypeScript static analysis passes cleanly).
   - `npm run lint` (ESLint passes with 0 errors).
   - `npm run format:check` (Prettier passes).
   - `npm run build` (esbuild builds production bundle cleanly).
