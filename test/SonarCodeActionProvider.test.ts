import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { SonarCodeActionProvider } from '../src/modules/SonarCodeActionProvider.js';
import { ProjectDetector } from '../src/modules/ProjectDetector.js';
import { AgentDispatcher } from '../src/modules/AgentDispatcher.js';
import { FileNavigator } from '../src/modules/FileNavigator.js';
import { SonarDetailItem } from '../src/modules/SonarClient.js';

describe('SonarCodeActionProvider', () => {
  const mockProjectDetector = {
    getConfig: vi.fn().mockResolvedValue({
      serverUrl: 'http://localhost:9000',
      projectKey: 'my-project',
    }),
    getToken: vi.fn().mockResolvedValue('fake-token'),
  } as unknown as ProjectDetector;

  const mockFileNavigator = {} as unknown as FileNavigator;

  const sampleDoc = {
    fileName: '/Users/dev/project/src/index.ts',
    uri: vscode.Uri.file('/Users/dev/project/src/index.ts'),
  } as vscode.TextDocument;

  const sampleSonarItem: SonarDetailItem = {
    id: 'issue-42',
    ruleKey: 'typescript:S2259',
    message: 'Null pointer dereference possible',
    component: 'src/index.ts',
    filePath: 'src/index.ts',
    line: 15,
    severity: 'BLOCKER',
    type: 'BUG',
    status: 'OPEN',
    tags: ['bug'],
    creationDate: '2026-10-10T08:00:00Z',
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('static providedCodeActionKinds', () => {
    it('declares QuickFix as the provided code action kind', () => {
      expect(SonarCodeActionProvider.providedCodeActionKinds).toEqual([
        vscode.CodeActionKind.QuickFix,
      ]);
    });
  });

  describe('constructor & dispatcherInstance', () => {
    it('uses provided dispatcher and exposes it via dispatcherInstance getter', () => {
      const customDispatcher = {} as AgentDispatcher;
      const provider = new SonarCodeActionProvider({
        projectDetector: mockProjectDetector,
        dispatcher: customDispatcher,
      });

      expect(provider.dispatcherInstance).toBe(customDispatcher);
    });

    it('creates default AgentDispatcher when dispatcher is omitted from options', () => {
      const providerWithNav = new SonarCodeActionProvider({
        projectDetector: mockProjectDetector,
        fileNavigator: mockFileNavigator,
      });

      expect(providerWithNav.dispatcherInstance).toBeInstanceOf(AgentDispatcher);

      const providerWithoutNav = new SonarCodeActionProvider({
        projectDetector: mockProjectDetector,
      });

      expect(providerWithoutNav.dispatcherInstance).toBeInstanceOf(AgentDispatcher);
    });
  });

  describe('provideCodeActions', () => {
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

      const undefinedSourceDiag = new vscode.Diagnostic(
        new vscode.Range(14, 0, 14, 10),
        'No source diagnostic',
        vscode.DiagnosticSeverity.Information,
      );
      undefinedSourceDiag.source = undefined;

      const actions = provider.provideCodeActions(
        sampleDoc,
        new vscode.Range(10, 0, 10, 20),
        {
          diagnostics: [sonarDiag, eslintDiag, undefinedSourceDiag],
          only: undefined,
          triggerKind: vscode.CodeActionTriggerKind.Invoke,
        },
        {} as vscode.CancellationToken,
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].title).toBe('⚡ Send to AI Agent (typescript:S3776)');
      expect(actions[0].kind).toBe(vscode.CodeActionKind.QuickFix);
      expect(actions[0].isPreferred).toBe(true);
      expect(actions[0].diagnostics).toEqual([sonarDiag]);
      expect(actions[0].command?.command).toBe('sonarAgent.fixWithAgent');
      expect(actions[0].command?.title).toBe('Send to Agent');
      expect(actions[0].command?.arguments).toEqual([sonarDiag, sampleDoc]);
    });

    it('matches various sonar source casings (e.g. sonarlint, SONARQUBE)', () => {
      const provider = new SonarCodeActionProvider({
        projectDetector: mockProjectDetector,
      });

      const lintDiag = new vscode.Diagnostic(
        new vscode.Range(5, 0, 5, 10),
        'Issue from SonarLint',
        vscode.DiagnosticSeverity.Error,
      );
      lintDiag.source = 'sonarlint';
      lintDiag.code = 'ts:S100';

      const actions = provider.provideCodeActions(
        sampleDoc,
        new vscode.Range(5, 0, 5, 10),
        {
          diagnostics: [lintDiag],
          only: undefined,
          triggerKind: vscode.CodeActionTriggerKind.Invoke,
        },
        {} as vscode.CancellationToken,
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].title).toBe('⚡ Send to AI Agent (ts:S100)');
    });

    it('handles diagnostic.code as an object with value, and undefined/null diagnostic.code', () => {
      const provider = new SonarCodeActionProvider({
        projectDetector: mockProjectDetector,
      });

      const objDiag = new vscode.Diagnostic(
        new vscode.Range(10, 0, 10, 20),
        'Object code diagnostic',
        vscode.DiagnosticSeverity.Warning,
      );
      objDiag.source = 'SonarQube';
      objDiag.code = { value: 'ts:S9999', target: vscode.Uri.file('/path') };

      const noCodeDiag = new vscode.Diagnostic(
        new vscode.Range(11, 0, 11, 20),
        'No code diagnostic',
        vscode.DiagnosticSeverity.Warning,
      );
      noCodeDiag.source = 'SonarQube';
      noCodeDiag.code = undefined;

      const emptyCodeDiag = new vscode.Diagnostic(
        new vscode.Range(12, 0, 12, 20),
        'Empty code diagnostic',
        vscode.DiagnosticSeverity.Warning,
      );
      emptyCodeDiag.source = 'SonarQube';
      emptyCodeDiag.code = '';

      const actions = provider.provideCodeActions(
        sampleDoc,
        new vscode.Range(10, 0, 12, 20),
        {
          diagnostics: [objDiag, noCodeDiag, emptyCodeDiag],
          only: undefined,
          triggerKind: vscode.CodeActionTriggerKind.Invoke,
        },
        {} as vscode.CancellationToken,
      );

      expect(actions).toHaveLength(3);
      expect(actions[0].title).toBe('⚡ Send to AI Agent (ts:S9999)');
      expect(actions[1].title).toBe('⚡ Send to AI Agent (SonarQube)');
      expect(actions[2].title).toBe('⚡ Send to AI Agent (SonarQube)');
    });
  });

  describe('executeFixWithAgent', () => {
    it('delegates to dispatchDiagnostic when passed a vscode.Diagnostic', async () => {
      const mockDispatcher = {
        dispatchDiagnostic: vi
          .fn()
          .mockResolvedValue({ ok: true, message: 'Dispatched diagnostic fix.' }),
        dispatchIssue: vi.fn(),
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

      expect(result).toEqual({ ok: true, message: 'Dispatched diagnostic fix.' });
      expect(mockDispatcher.dispatchDiagnostic).toHaveBeenCalledWith(sonarDiag, sampleDoc);
      expect(mockDispatcher.dispatchIssue).not.toHaveBeenCalled();
    });

    it('delegates to dispatchIssue when passed a SonarDetailItem (lines 68-70)', async () => {
      const mockDispatcher = {
        dispatchDiagnostic: vi.fn(),
        dispatchIssue: vi
          .fn()
          .mockResolvedValue({ ok: true, message: 'Dispatched issue fix via detail item.' }),
      } as unknown as AgentDispatcher;

      const provider = new SonarCodeActionProvider({
        projectDetector: mockProjectDetector,
        dispatcher: mockDispatcher,
      });

      const result = await provider.executeFixWithAgent(sampleSonarItem);

      expect(result).toEqual({
        ok: true,
        message: 'Dispatched issue fix via detail item.',
      });
      expect(mockDispatcher.dispatchIssue).toHaveBeenCalledWith(sampleSonarItem);
      expect(mockDispatcher.dispatchDiagnostic).not.toHaveBeenCalled();
    });
  });

  describe('executeExplainWithAgent', () => {
    it('delegates to dispatchDiagnosticExplain when passed a vscode.Diagnostic (lines 81-84)', async () => {
      const mockDispatcher = {
        dispatchDiagnosticExplain: vi
          .fn()
          .mockResolvedValue({ ok: true, message: 'Dispatched diagnostic explain.' }),
        dispatchExplain: vi.fn(),
      } as unknown as AgentDispatcher;

      const provider = new SonarCodeActionProvider({
        projectDetector: mockProjectDetector,
        dispatcher: mockDispatcher,
      });

      const sonarDiag = new vscode.Diagnostic(
        new vscode.Range(20, 0, 20, 25),
        'Cognitive complexity too high',
        vscode.DiagnosticSeverity.Warning,
      );
      sonarDiag.source = 'SonarLint';
      sonarDiag.code = 'typescript:S3776';

      const result = await provider.executeExplainWithAgent(sonarDiag, sampleDoc);

      expect(result).toEqual({ ok: true, message: 'Dispatched diagnostic explain.' });
      expect(mockDispatcher.dispatchDiagnosticExplain).toHaveBeenCalledWith(sonarDiag, sampleDoc);
      expect(mockDispatcher.dispatchExplain).not.toHaveBeenCalled();
    });

    it('delegates to dispatchExplain when passed a SonarDetailItem (lines 78-80)', async () => {
      const mockDispatcher = {
        dispatchDiagnosticExplain: vi.fn(),
        dispatchExplain: vi
          .fn()
          .mockResolvedValue({ ok: true, message: 'Dispatched rule explain.' }),
      } as unknown as AgentDispatcher;

      const provider = new SonarCodeActionProvider({
        projectDetector: mockProjectDetector,
        dispatcher: mockDispatcher,
      });

      const result = await provider.executeExplainWithAgent(sampleSonarItem);

      expect(result).toEqual({ ok: true, message: 'Dispatched rule explain.' });
      expect(mockDispatcher.dispatchExplain).toHaveBeenCalledWith(sampleSonarItem);
      expect(mockDispatcher.dispatchDiagnosticExplain).not.toHaveBeenCalled();
    });
  });
});
