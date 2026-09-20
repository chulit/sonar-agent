import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { SonarCodeActionProvider } from '../src/modules/SonarCodeActionProvider.js';
import { ProjectDetector } from '../src/modules/ProjectDetector.js';
import { AgentDispatcher } from '../src/modules/AgentDispatcher.js';

describe('SonarCodeActionProvider', () => {
  const mockProjectDetector = {
    getConfig: vi.fn().mockResolvedValue({
      serverUrl: 'http://localhost:9000',
      projectKey: 'my-project',
    }),
    getToken: vi.fn().mockResolvedValue('fake-token'),
  } as unknown as ProjectDetector;

  const sampleDoc = {
    fileName: '/Users/dev/project/src/index.ts',
    uri: vscode.Uri.file('/Users/dev/project/src/index.ts'),
  } as vscode.TextDocument;

  it('should provide CodeAction for SonarQube diagnostics only', () => {
    const provider = new SonarCodeActionProvider({
      projectDetector: mockProjectDetector,
    });

    const sonarDiag = new vscode.Diagnostic(
      new vscode.Range(10, 0, 10, 20),
      'Refactor this function to reduce complexity',
      vscode.DiagnosticSeverity.Warning,
    );
    sonarDiag.source = 'SonarQube';
    sonarDiag.code = 'typescript:S3776';

    const eslintDiag = new vscode.Diagnostic(
      new vscode.Range(12, 0, 12, 10),
      'Unused variable',
      vscode.DiagnosticSeverity.Warning,
    );
    eslintDiag.source = 'eslint';

    const actions = provider.provideCodeActions(
      sampleDoc,
      new vscode.Range(10, 0, 10, 20),
      {
        diagnostics: [sonarDiag, eslintDiag],
        only: undefined,
        triggerKind: vscode.CodeActionTriggerKind.Invoke,
      },
      {} as vscode.CancellationToken,
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe('⚡ Send to AI Agent (typescript:S3776)');
    expect(actions[0].kind).toBe(vscode.CodeActionKind.QuickFix);
    expect(actions[0].command?.command).toBe('sonarAgent.fixWithAgent');
    expect(actions[0].command?.arguments?.[0]).toBe(sonarDiag);
    expect(actions[0].command?.arguments?.[1]).toBe(sampleDoc);
  });

  it('should execute fixWithAgent and delegate to AgentDispatcher', async () => {
    const mockDispatcher = {
      dispatchDiagnostic: vi
        .fn()
        .mockResolvedValue({ ok: true, message: 'Dispatched to Antigravity Chat.' }),
    } as unknown as AgentDispatcher;

    const provider = new SonarCodeActionProvider({
      projectDetector: mockProjectDetector,
      dispatcher: mockDispatcher,
    });

    const sonarDiag = new vscode.Diagnostic(
      new vscode.Range(15, 0, 15, 30),
      'Extract this nested ternary',
      vscode.DiagnosticSeverity.Error,
    );
    sonarDiag.source = 'SonarQube';
    sonarDiag.code = 'typescript:S3358';

    const result = await provider.executeFixWithAgent(sonarDiag, sampleDoc);

    expect(result.ok).toBe(true);
    expect(mockDispatcher.dispatchDiagnostic).toHaveBeenCalledWith(sonarDiag, sampleDoc);
  });
});
