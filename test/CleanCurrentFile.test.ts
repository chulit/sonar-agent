import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { FileIssueAggregator } from '../src/modules/FileIssueAggregator.js';
import { SonarDetailItem } from '../src/modules/SonarClient.js';
import { SonarOverviewViewProvider } from '../src/modules/SonarOverviewViewProvider.js';
import { ProjectDetector } from '../src/modules/ProjectDetector.js';
import { DemoData } from '../src/modules/DemoData.js';

describe('FileIssueAggregator & Clean Current File', () => {
  const sampleIssues: SonarDetailItem[] = [
    {
      id: 'issue-1',
      ruleKey: 'typescript:S2259',
      message: 'Null pointer dereference possible',
      component: 'src/services/UserService.ts',
      filePath: 'src/services/UserService.ts',
      line: 42,
      severity: 'CRITICAL',
      type: 'BUG',
      status: 'OPEN',
      tags: ['bug'],
      creationDate: '2026-10-09T08:30:00Z',
    },
    {
      id: 'issue-2',
      ruleKey: 'typescript:S3776',
      message: 'Cognitive complexity is too high',
      component: 'project-key:src/services/UserService.ts',
      filePath: 'src/services/UserService.ts',
      line: 55,
      severity: 'MAJOR',
      type: 'CODE_SMELL',
      status: 'OPEN',
      tags: ['complexity'],
      creationDate: '2026-10-09T08:30:00Z',
    },
    {
      id: 'issue-3',
      ruleKey: 'javascript:S3796',
      message: 'Array method map must return a value',
      component: 'src/controllers/OrderController.ts',
      filePath: 'src/controllers/OrderController.ts',
      line: 88,
      severity: 'MAJOR',
      type: 'BUG',
      status: 'OPEN',
      tags: ['bug'],
      creationDate: '2026-10-08T14:15:00Z',
    },
  ];

  describe('FileIssueAggregator', () => {
    it('finds cached issues matching exact relative file path', () => {
      const aggregator = new FileIssueAggregator({
        getCachedIssuesFn: () => sampleIssues,
        asRelativePathFn: () => 'src/services/UserService.ts',
      });

      const uri = vscode.Uri.file('/workspace/src/services/UserService.ts');
      const results = aggregator.aggregateIssuesForDocument(uri);

      expect(results).toHaveLength(2);
      expect(results[0].ruleKey).toBe('typescript:S2259');
      expect(results[1].ruleKey).toBe('typescript:S3776');
    });

    it('matches issues with project-key prefixes or Windows path backslashes', () => {
      const aggregator = new FileIssueAggregator({
        getCachedIssuesFn: () => [
          {
            id: 'win-1',
            ruleKey: 'typescript:S1186',
            message: 'Empty method',
            component: 'my-proj:src\\utils\\Helper.ts',
            filePath: 'src\\utils\\Helper.ts',
            line: 10,
            severity: 'MINOR',
            type: 'CODE_SMELL',
            status: 'OPEN',
            tags: [],
            creationDate: '2026-10-09T00:00:00Z',
          },
        ],
        asRelativePathFn: () => 'src/utils/Helper.ts',
      });

      const uri = vscode.Uri.file('/workspace/src/utils/Helper.ts');
      const results = aggregator.aggregateIssuesForDocument(uri);

      expect(results).toHaveLength(1);
      expect(results[0].ruleKey).toBe('typescript:S1186');
    });

    it('falls back to active editor Sonar diagnostics when no cached issues exist', () => {
      const mockDiagnostic: vscode.Diagnostic = {
        range: new vscode.Range(new vscode.Position(15, 0), new vscode.Position(15, 20)),
        message: 'Avoid hardcoded credentials',
        severity: vscode.DiagnosticSeverity.Error,
        source: 'SonarLint',
        code: 'javascript:S2068',
      } as any;

      const nonSonarDiagnostic: vscode.Diagnostic = {
        range: new vscode.Range(new vscode.Position(10, 0), new vscode.Position(10, 10)),
        message: 'Unused variable',
        severity: vscode.DiagnosticSeverity.Warning,
        source: 'eslint',
        code: 'no-unused-vars',
      } as any;

      const aggregator = new FileIssueAggregator({
        getCachedIssuesFn: () => sampleIssues, // contains UserService & OrderController, not Auth.ts
        getDiagnosticsFn: () => [mockDiagnostic, nonSonarDiagnostic],
        asRelativePathFn: () => 'src/auth/Auth.ts',
      });

      const uri = vscode.Uri.file('/workspace/src/auth/Auth.ts');
      const results = aggregator.aggregateIssuesForDocument(uri);

      expect(results).toHaveLength(1);
      expect(results[0].ruleKey).toBe('javascript:S2068');
      expect(results[0].message).toBe('Avoid hardcoded credentials');
      expect(results[0].severity).toBe('CRITICAL');
      expect(results[0].line).toBe(16);
      expect(results[0].filePath).toBe('src/auth/Auth.ts');
    });

    it('returns empty array when neither cache nor diagnostics contain Sonar issues', () => {
      const nonSonarDiagnostic: vscode.Diagnostic = {
        range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)),
        message: 'Type error',
        severity: vscode.DiagnosticSeverity.Error,
        source: 'typescript',
      } as any;

      const aggregator = new FileIssueAggregator({
        getCachedIssuesFn: () => [],
        getDiagnosticsFn: () => [nonSonarDiagnostic],
        asRelativePathFn: () => 'src/clean/CleanFile.ts',
      });

      const uri = vscode.Uri.file('/workspace/src/clean/CleanFile.ts');
      const results = aggregator.aggregateIssuesForDocument(uri);

      expect(results).toHaveLength(0);
    });
  });

  describe('SonarOverviewViewProvider.cleanCurrentFile', () => {
    let provider: SonarOverviewViewProvider;
    let mockDetector: any;
    let mockDispatcher: any;

    beforeEach(() => {
      mockDetector = {
        getConfig: vi
          .fn()
          .mockResolvedValue({ serverUrl: 'http://localhost:9000', projectKey: 'test' }),
        getToken: vi.fn().mockResolvedValue('test-token'),
        isConfiguredSync: vi.fn().mockReturnValue(true),
      };

      mockDispatcher = {
        dispatchBatch: vi.fn().mockResolvedValue({ ok: true, message: 'Dispatched to Copilot' }),
        getAvailableAgents: vi.fn().mockReturnValue([{ id: 'copilot', name: 'GitHub Copilot' }]),
      };

      provider = new SonarOverviewViewProvider(
        vscode.Uri.file('/fake/extension'),
        mockDetector as any,
        undefined,
        mockDispatcher as any,
      );
    });

    it('alerts and exits when no active editor or document is present', async () => {
      const infoSpy = vi.spyOn(vscode.window, 'showInformationMessage');
      const originalActive = vscode.window.activeTextEditor;
      (vscode.window as any).activeTextEditor = undefined;

      try {
        const result = await provider.cleanCurrentFile();
        expect(result.ok).toBe(false);
        expect(result.count).toBe(0);
        expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('No active editor'));
      } finally {
        (vscode.window as any).activeTextEditor = originalActive;
      }
    });

    it('notifies user when active document has 0 Sonar issues', async () => {
      const infoSpy = vi.spyOn(vscode.window, 'showInformationMessage');
      const doc = {
        uri: vscode.Uri.file('/workspace/src/Clean.ts'),
        fileName: '/workspace/src/Clean.ts',
      } as vscode.TextDocument;

      const result = await provider.cleanCurrentFile(doc);

      expect(result.ok).toBe(true);
      expect(result.count).toBe(0);
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Clean.ts. File is clean!'));
      expect(mockDispatcher.dispatchBatch).not.toHaveBeenCalled();
    });

    it('aggregates issues and dispatches batch prompt when active document has issues', async () => {
      // Set cached issues on provider
      (provider as any)._cachedServerIssues = sampleIssues;

      const doc = {
        uri: vscode.Uri.file('/workspace/src/services/UserService.ts'),
        fileName: '/workspace/src/services/UserService.ts',
      } as vscode.TextDocument;

      const result = await provider.cleanCurrentFile(doc);

      expect(result.ok).toBe(true);
      expect(result.count).toBe(2);
      expect(mockDispatcher.dispatchBatch).toHaveBeenCalledTimes(1);
      const dispatchedItems = mockDispatcher.dispatchBatch.mock.calls[0][0];
      expect(dispatchedItems).toHaveLength(2);
      expect(dispatchedItems[0].ruleKey).toBe('typescript:S2259');
      expect(dispatchedItems[1].ruleKey).toBe('typescript:S3776');
    });

    it('resolves demo mode issues when in Demo Mode', async () => {
      await provider.enableDemoMode();

      // DemoData includes 'src/services/UserService.ts'
      const doc = {
        uri: vscode.Uri.file('/workspace/src/services/UserService.ts'),
        fileName: '/workspace/src/services/UserService.ts',
      } as vscode.TextDocument;

      const result = await provider.cleanCurrentFile(doc);

      expect(result.ok).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(mockDispatcher.dispatchBatch).toHaveBeenCalledTimes(1);
    });

    it('responds to webview postMessage cleanCurrentFile command', async () => {
      const cleanSpy = vi.spyOn(provider, 'cleanCurrentFile').mockResolvedValue({
        ok: true,
        count: 1,
        message: 'Success',
      });

      let messageListener: any;
      const fakeWebviewView = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: vi.fn((listener) => {
            messageListener = listener;
          }),
          postMessage: vi.fn(),
        },
        visible: true,
        onDidChangeVisibility: vi.fn(),
      };

      provider.resolveWebviewView(fakeWebviewView as any, {} as any, {} as any);
      expect(messageListener).toBeDefined();

      await messageListener({ command: 'cleanCurrentFile' });
      expect(cleanSpy).toHaveBeenCalled();
    });

    it('filters issues to New Code period and alerts when 0 new issues exist', async () => {
      const infoSpy = vi.spyOn(vscode.window, 'showInformationMessage');
      await provider.handleSwitchCodePeriod('new');

      // Sample issues without inNewCodePeriod
      (provider as any)._cachedServerIssues = [
        {
          id: 'old-1',
          ruleKey: 'typescript:S123',
          message: 'Old issue',
          component: 'src/services/UserService.ts',
          filePath: 'src/services/UserService.ts',
          line: 10,
          severity: 'MAJOR',
          type: 'CODE_SMELL',
          status: 'OPEN',
          tags: [],
          creationDate: '2026-09-01T00:00:00Z',
          inNewCodePeriod: false,
        },
      ];

      const doc = {
        uri: vscode.Uri.file('/workspace/src/services/UserService.ts'),
        fileName: '/workspace/src/services/UserService.ts',
      } as vscode.TextDocument;

      const result = await provider.cleanCurrentFile(doc);

      expect(result.ok).toBe(true);
      expect(result.count).toBe(0);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'No new Sonar issues detected in UserService.ts for the current leak period!',
        ),
      );
      expect(mockDispatcher.dispatchBatch).not.toHaveBeenCalled();
    });

    it('dispatches only New Code issues when active code period is new', async () => {
      await provider.handleSwitchCodePeriod('new');

      (provider as any)._cachedServerIssues = [
        {
          id: 'old-1',
          ruleKey: 'typescript:S123',
          message: 'Old issue',
          component: 'src/services/UserService.ts',
          filePath: 'src/services/UserService.ts',
          line: 10,
          severity: 'MAJOR',
          type: 'CODE_SMELL',
          status: 'OPEN',
          tags: [],
          creationDate: '2026-09-01T00:00:00Z',
          inNewCodePeriod: false,
        },
        {
          id: 'new-1',
          ruleKey: 'typescript:S2259',
          message: 'New issue in leak period',
          component: 'src/services/UserService.ts',
          filePath: 'src/services/UserService.ts',
          line: 42,
          severity: 'CRITICAL',
          type: 'BUG',
          status: 'OPEN',
          tags: ['bug'],
          creationDate: '2026-10-10T00:00:00Z',
          inNewCodePeriod: true,
        },
      ];

      const doc = {
        uri: vscode.Uri.file('/workspace/src/services/UserService.ts'),
        fileName: '/workspace/src/services/UserService.ts',
      } as vscode.TextDocument;

      const result = await provider.cleanCurrentFile(doc);

      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
      expect(mockDispatcher.dispatchBatch).toHaveBeenCalledTimes(1);
      expect(mockDispatcher.dispatchBatch).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'new-1' })]),
        expect.objectContaining({ codePeriod: 'new' }),
      );
    });
  });
});
