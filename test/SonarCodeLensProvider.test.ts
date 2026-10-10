import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { SonarCodeLensProvider } from '../src/modules/SonarCodeLensProvider.js';
import { AgentDispatcher } from '../src/modules/AgentDispatcher.js';
import { SonarCodeActionProvider } from '../src/modules/SonarCodeActionProvider.js';
import { FileIssueAggregator } from '../src/modules/FileIssueAggregator.js';
import { SonarDetailItem } from '../src/modules/SonarClient.js';

describe('SonarCodeLensProvider & Sonar Explain Prompt Flow', () => {
  const sampleItem: SonarDetailItem = {
    id: 'issue-1',
    ruleKey: 'typescript:S2259',
    message: 'Null pointer dereference possible: user.profile may be undefined',
    component: 'src/services/UserService.ts',
    filePath: 'src/services/UserService.ts',
    line: 42,
    severity: 'CRITICAL',
    type: 'BUG',
    status: 'OPEN',
    tags: ['bug'],
    creationDate: '2026-10-09T08:30:00Z',
  };

  const sampleDoc = {
    uri: vscode.Uri.file('/workspace/src/services/UserService.ts'),
    fileName: '/workspace/src/services/UserService.ts',
    getText: () => 'const user = getUser();\nconsole.log(user.profile.name);',
  } as unknown as vscode.TextDocument;

  describe('SonarCodeLensProvider', () => {
    it('generates 3 CodeLens items per issue: header, [Fix with AI], and [Explain]', () => {
      const mockAggregator = {
        aggregateIssuesForDocument: vi.fn().mockReturnValue([sampleItem]),
      } as unknown as FileIssueAggregator;

      const provider = new SonarCodeLensProvider({
        fileIssueAggregator: mockAggregator,
        isCodeLensEnabledFn: () => true,
      });

      const lenses = provider.provideCodeLenses(sampleDoc);

      expect(lenses).toHaveLength(3);

      // Line 42 (1-based) -> Line 41 (0-based)
      expect(lenses[0].range.start.line).toBe(41);
      expect(lenses[1].range.start.line).toBe(41);
      expect(lenses[2].range.start.line).toBe(41);

      // 1. Header lens
      expect(lenses[0].command?.title).toContain('⚡ Sonar:');
      expect(lenses[0].command?.title).toContain('Null pointer dereference');
      expect(lenses[0].command?.command).toBe('sonarAgent.fixWithAgent');

      // 2. Fix with AI button
      expect(lenses[1].command?.title).toBe('[Fix with AI]');
      expect(lenses[1].command?.command).toBe('sonarAgent.fixWithAgent');
      expect(lenses[1].command?.arguments?.[0]).toEqual(sampleItem);

      // 3. Explain button
      expect(lenses[2].command?.title).toBe('[Explain]');
      expect(lenses[2].command?.command).toBe('sonarAgent.explainRuleWithAgent');
      expect(lenses[2].command?.arguments?.[0]).toEqual(sampleItem);
    });

    it('returns empty array when CodeLens is disabled via configuration', () => {
      const mockAggregator = {
        aggregateIssuesForDocument: vi.fn().mockReturnValue([sampleItem]),
      } as unknown as FileIssueAggregator;

      const provider = new SonarCodeLensProvider({
        fileIssueAggregator: mockAggregator,
        isCodeLensEnabledFn: () => false,
      });

      const lenses = provider.provideCodeLenses(sampleDoc);
      expect(lenses).toHaveLength(0);
      expect(mockAggregator.aggregateIssuesForDocument).not.toHaveBeenCalled();
    });

    it('returns empty array when active document has 0 Sonar issues', () => {
      const mockAggregator = {
        aggregateIssuesForDocument: vi.fn().mockReturnValue([]),
      } as unknown as FileIssueAggregator;

      const provider = new SonarCodeLensProvider({
        fileIssueAggregator: mockAggregator,
        isCodeLensEnabledFn: () => true,
      });

      const lenses = provider.provideCodeLenses(sampleDoc);
      expect(lenses).toHaveLength(0);
    });

    it('fires onDidChangeCodeLenses event when refreshed', () => {
      const provider = new SonarCodeLensProvider({
        isCodeLensEnabledFn: () => true,
      });

      let fired = false;
      provider.onDidChangeCodeLenses(() => {
        fired = true;
      });

      provider.refresh();
      expect(fired).toBe(true);
    });
  });

  describe('AgentDispatcher & Sonar Explain Prompt Flow', () => {
    let dispatcher: AgentDispatcher;

    beforeEach(() => {
      dispatcher = new AgentDispatcher({
        isExtensionInstalledFn: (id: string) => id === 'github.copilot',
        isAntigravityEnvFn: () => false,
        fetchRuleFn: async (ruleKey: string) => ({
          key: ruleKey,
          name: 'Null pointers should not be dereferenced',
          cleanDesc:
            'A null pointer dereference occurs when a reference with a null value is used.',
          recommendation: 'Check that objects are non-null before accessing members.',
        }),
        readCodeSnippetFn: async () => ({
          snippet: 'console.log(user.profile.name);',
          startLine: 40,
          endLine: 45,
          language: 'typescript',
        }),
      });
    });

    it('assembles an educational Sonar Explain prompt with rule context and refactoring guidance', async () => {
      const prompt = await dispatcher.assembleExplainPrompt(sampleItem);

      expect(prompt).toContain('@workspace Please explain the following SonarQube rule and issue');
      expect(prompt).toContain('`src/services/UserService.ts`');
      expect(prompt).toContain('Line: 42');
      expect(prompt).toContain('`typescript:S2259`');
      expect(prompt).toContain('Null pointers should not be dereferenced');
      expect(prompt).toContain('console.log(user.profile.name);');
      expect(prompt).toContain('before-and-after code examples');
      expect(prompt).toContain('beginner-friendly');
    });

    it('dispatches explain prompt to active agent', async () => {
      const executeCommandSpy = vi
        .spyOn(vscode.commands, 'executeCommand')
        .mockResolvedValue(undefined as any);

      const result = await dispatcher.dispatchExplain(sampleItem, { targetAgentId: 'copilot' });
      expect(result.ok).toBe(true);
      expect(executeCommandSpy).toHaveBeenCalledWith(
        'workbench.action.chat.open',
        expect.objectContaining({
          query: expect.stringContaining('@workspace Please explain the following SonarQube rule'),
        }),
      );
    });

    it('dispatches diagnostic explain prompt via SonarCodeActionProvider', async () => {
      const mockDetector: any = {
        getConfig: vi
          .fn()
          .mockResolvedValue({ serverUrl: 'http://localhost:9000', projectKey: 'test' }),
        getToken: vi.fn().mockResolvedValue('token'),
      };

      const dispatchExplainSpy = vi.spyOn(dispatcher, 'dispatchExplain').mockResolvedValue({
        ok: true,
        message: 'Dispatched explain',
      });

      const codeActionProvider = new SonarCodeActionProvider({
        projectDetector: mockDetector,
        dispatcher,
      });

      const diagnostic: vscode.Diagnostic = {
        range: new vscode.Range(new vscode.Position(41, 0), new vscode.Position(41, 20)),
        message: 'Null pointer dereference',
        severity: vscode.DiagnosticSeverity.Error,
        source: 'SonarLint',
        code: 'typescript:S2259',
      } as any;

      const result = await codeActionProvider.executeExplainWithAgent(diagnostic, sampleDoc);
      expect(result.ok).toBe(true);
      expect(dispatchExplainSpy).toHaveBeenCalledTimes(1);
      const dispatchedItem = dispatchExplainSpy.mock.calls[0][0];
      expect(dispatchedItem.ruleKey).toBe('typescript:S2259');
      expect(dispatchedItem.line).toBe(42);
    });
  });
});
