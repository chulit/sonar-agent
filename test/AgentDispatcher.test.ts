import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { AgentDispatcher } from '../src/modules/AgentDispatcher.js';
import { SonarDetailItem } from '../src/modules/SonarClient.js';
import { FileNavigator } from '../src/modules/FileNavigator.js';
import { ProjectDetector } from '../src/modules/ProjectDetector.js';

describe('AgentDispatcher - Enriched Fix Prompt Assembly', () => {
  const sampleItem: SonarDetailItem = {
    id: 'ISSUE-1',
    ruleKey: 'vue:S123',
    message:
      'Elements with ARIA roles must use a valid, non-abstract ARIA role. "toolbar" is not a valid role.',
    component: 'my-project:resources/survey/components/widgets/TugasCardGrid.vue',
    filePath: 'resources/survey/components/widgets/TugasCardGrid.vue',
    line: 168,
    type: 'BUG',
    severity: 'MAJOR',
    status: 'OPEN',
    effort: '5min',
    tags: ['accessibility', 'react'],
    creationDate: '2026-09-13T10:00:00+0000',
  };

  const sampleRule = {
    key: 'vue:S123',
    name: 'ARIA roles validity',
    cleanDesc:
      'Elements with ARIA roles must use a valid, non-abstract ARIA role to ensure accessibility.',
    recommendation: "Replace 'toolbar' with a valid ARIA role or remove the role attribute.",
  };

  it('should assemble a rich structured prompt including rule explanation and local code window', async () => {
    const fetchRuleFn = vi.fn().mockResolvedValue(sampleRule);
    const readCodeSnippetFn = vi.fn().mockResolvedValue({
      snippet: '167: line 167\n168: ---> line 168\n169: line 169',
      startLine: 167,
      endLine: 169,
      language: 'vue',
    });

    const dispatcher = new AgentDispatcher({
      fetchRuleFn,
      readCodeSnippetFn,
    });

    const prompt = await dispatcher.assemblePrompt(sampleItem);

    expect(prompt).toContain('### 📍 Location');
    expect(prompt).toContain('resources/survey/components/widgets/TugasCardGrid.vue');
    expect(prompt).toContain('Line: 168');
    expect(prompt).toContain(
      'Elements with ARIA roles must use a valid, non-abstract ARIA role. "toolbar" is not a valid role.',
    );
    expect(prompt).toContain('vue:S123');
    expect(prompt).toContain('ARIA roles validity');
    expect(prompt).toContain(
      'Elements with ARIA roles must use a valid, non-abstract ARIA role to ensure accessibility.',
    );
    expect(prompt).toContain('168: ---> line 168');
    expect(prompt).toContain('### 🎯 Instructions for Agent');
  });

  it('should cache rule documentation to avoid duplicate API requests', async () => {
    const fetchRuleFn = vi.fn().mockResolvedValue(sampleRule);
    const readCodeSnippetFn = vi.fn().mockResolvedValue({
      snippet: 'code',
      startLine: 1,
      endLine: 10,
      language: 'vue',
    });

    const dispatcher = new AgentDispatcher({
      fetchRuleFn,
      readCodeSnippetFn,
    });

    await dispatcher.assemblePrompt(sampleItem);
    await dispatcher.assemblePrompt(sampleItem);

    // fetchRuleFn should only be called once because of in-memory caching
    expect(fetchRuleFn).toHaveBeenCalledTimes(1);
  });
});

describe('AgentDispatcher - Dynamic Target Agent Discovery', () => {
  it('should discover installed agents and include Clipboard Only at the end', () => {
    const installed = new Set(['github.copilot-chat', 'saoudrizwan.claude-dev']);
    const dispatcher = new AgentDispatcher({
      isExtensionInstalledFn: (id) => installed.has(id),
      isAntigravityEnvFn: () => false,
    });

    const agents = dispatcher.getAvailableAgents();
    expect(agents.map((a) => a.id)).toEqual(['copilot', 'cline', 'clipboard']);
    expect(agents[agents.length - 1].id).toBe('clipboard');
  });

  it('should detect Antigravity when running in Antigravity environment', () => {
    const dispatcher = new AgentDispatcher({
      isExtensionInstalledFn: () => false,
      isAntigravityEnvFn: () => true,
    });

    const agents = dispatcher.getAvailableAgents();
    expect(agents.map((a) => a.id)).toEqual(['antigravity', 'clipboard']);
    expect(agents[0].name).toBe('Antigravity Agent');
  });

  it('should discover Claude Code when anthropic.claude-code is installed', () => {
    const installed = new Set(['anthropic.claude-code']);
    const dispatcher = new AgentDispatcher({
      isExtensionInstalledFn: (id) => installed.has(id),
      isAntigravityEnvFn: () => false,
    });

    const agents = dispatcher.getAvailableAgents();
    expect(agents.map((a) => a.id)).toEqual(['claude-code', 'clipboard']);
    expect(agents[0].name).toBe('Claude Code');
    expect(agents[0].focusCommand).toBe('workbench.view.extension.claude-sidebar');
  });

  it('should preserve priority ordering: copilot > antigravity > others > clipboard', () => {
    const installed = new Set([
      'github.copilot',
      'anthropic.claude-code',
      'continue.continue',
      'rooveterinaryinc.roo-cline',
      'saoudrizwan.claude-dev',
    ]);
    const dispatcher = new AgentDispatcher({
      isExtensionInstalledFn: (id) => installed.has(id),
      isAntigravityEnvFn: () => true,
    });

    const agents = dispatcher.getAvailableAgents();
    expect(agents.map((a) => a.id)).toEqual([
      'copilot',
      'antigravity',
      'claude-code',
      'cline',
      'roo-code',
      'continue',
      'clipboard',
    ]);
  });

  it('should fallback to only Clipboard Only when no AI agents are installed or active', () => {
    const dispatcher = new AgentDispatcher({
      isExtensionInstalledFn: () => false,
      isAntigravityEnvFn: () => false,
    });

    const agents = dispatcher.getAvailableAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('clipboard');
    expect(agents[0].name).toBe('Clipboard Only');
  });
});

describe('AgentDispatcher - Interactive Dispatching', () => {
  const sampleItem: SonarDetailItem = {
    id: 'ISSUE-1',
    ruleKey: 'vue:S123',
    message: 'Fix this',
    component: 'my-project:src/App.vue',
    filePath: 'src/App.vue',
    line: 42,
    type: 'BUG',
    severity: 'MAJOR',
    status: 'OPEN',
    tags: ['bug'],
    creationDate: '2026-09-13T10:00:00+0000',
  };

  it('should trigger focus command when dispatching to Claude Code', async () => {
    const executedCommands: string[] = [];
    const openFileAtLine = vi.fn().mockResolvedValue(true);
    const mockNavigator = { openFileAtLine } as unknown as FileNavigator;

    const dispatcher = new AgentDispatcher({
      fileNavigator: mockNavigator,
      isExtensionInstalledFn: (id) => id === 'anthropic.claude-code',
      executeCommandFn: async (cmd) => {
        executedCommands.push(cmd);
        return undefined;
      },
    });

    const res = await dispatcher.dispatch('prompt content', 'claude-code', sampleItem);
    expect(res.ok).toBe(true);
    expect(executedCommands).toContain('workbench.view.extension.claude-sidebar');
    expect(openFileAtLine).toHaveBeenCalledWith('src/App.vue', 42);
    expect(res.message).toContain('Claude Code');
  });

  it('should trigger focus command when dispatching to Cline', async () => {
    const executedCommands: string[] = [];
    const openFileAtLine = vi.fn().mockResolvedValue(true);
    const mockNavigator = { openFileAtLine } as unknown as FileNavigator;

    const dispatcher = new AgentDispatcher({
      fileNavigator: mockNavigator,
      isExtensionInstalledFn: (id) => id === 'saoudrizwan.claude-dev',
      executeCommandFn: async (cmd) => {
        executedCommands.push(cmd);
        return undefined;
      },
    });

    const res = await dispatcher.dispatch('prompt content', 'cline', sampleItem);
    expect(res.ok).toBe(true);
    expect(executedCommands).toContain('claude-dev.focus');
    expect(openFileAtLine).toHaveBeenCalledWith('src/App.vue', 42);
    expect(res.message).toContain('Cline');
  });

  it('should discover Codex Agent when openai.chatgpt is installed', () => {
    const installed = new Set(['openai.chatgpt']);
    const dispatcher = new AgentDispatcher({
      isExtensionInstalledFn: (id) => installed.has(id),
      isAntigravityEnvFn: () => false,
    });

    const agents = dispatcher.getAvailableAgents();
    expect(agents.map((a) => a.id)).toEqual(['codex', 'clipboard']);
    expect(agents[0].name).toBe('Codex Agent');
    expect(agents[0].focusCommand).toBe('chatgpt.focus');
  });

  it('should trigger focus command when dispatching to Codex Agent', async () => {
    const executedCommands: string[] = [];
    const openFileAtLine = vi.fn().mockResolvedValue(true);
    const mockNavigator = { openFileAtLine } as unknown as FileNavigator;

    const dispatcher = new AgentDispatcher({
      fileNavigator: mockNavigator,
      isExtensionInstalledFn: (id) => id === 'openai.chatgpt',
      executeCommandFn: async (cmd) => {
        executedCommands.push(cmd);
        return undefined;
      },
    });

    const res = await dispatcher.dispatch('prompt content', 'codex', sampleItem);
    expect(res.ok).toBe(true);
    expect(executedCommands).toContain('chatgpt.focus');
    expect(openFileAtLine).toHaveBeenCalledWith('src/App.vue', 42);
    expect(res.message).toContain('Codex Agent');
  });

  it('should dispatch directly to Antigravity chat when chat open command succeeds', async () => {
    const executedCommands: { cmd: string; args?: unknown }[] = [];
    const openFileAtLine = vi.fn().mockResolvedValue(true);
    const mockNavigator = { openFileAtLine } as unknown as FileNavigator;

    const dispatcher = new AgentDispatcher({
      fileNavigator: mockNavigator,
      isExtensionInstalledFn: () => false,
      isAntigravityEnvFn: () => true,
      executeCommandFn: async (cmd, args) => {
        executedCommands.push({ cmd, args });
        return undefined;
      },
    });

    const res = await dispatcher.dispatch('prompt content', 'antigravity', sampleItem);
    expect(res.ok).toBe(true);
    expect(res.message).toBe('Dispatched to Antigravity Chat.');
    expect(executedCommands[0].cmd).toBe('workbench.action.chat.open');
    expect(executedCommands[0].args).toEqual({ query: 'prompt content' });
    expect(openFileAtLine).toHaveBeenCalledWith('src/App.vue', 42);
  });

  it('should open Antigravity chat view if direct query command throws', async () => {
    const executedCommands: string[] = [];
    const openFileAtLine = vi.fn().mockResolvedValue(true);
    const mockNavigator = { openFileAtLine } as unknown as FileNavigator;

    const dispatcher = new AgentDispatcher({
      fileNavigator: mockNavigator,
      isExtensionInstalledFn: () => false,
      isAntigravityEnvFn: () => true,
      executeCommandFn: async (cmd) => {
        executedCommands.push(cmd);
        if (cmd === 'antigravity.openChatView') {
          return undefined;
        }
        throw new Error('Command not found');
      },
    });

    const res = await dispatcher.dispatch('prompt content', 'antigravity', sampleItem);
    expect(res.ok).toBe(true);
    expect(res.message).toBe('Chat opened and prompt ready in clipboard.');
    expect(executedCommands).toContain('antigravity.openChatView');
    expect(openFileAtLine).toHaveBeenCalledWith('src/App.vue', 42);
  });

  it('should call sendToAgentPanelFn directly with file mentions and prompt when available', async () => {
    let capturedOptions: unknown = null;
    const openFileAtLine = vi.fn().mockResolvedValue(true);
    const resolveFilePath = vi.fn().mockResolvedValue('/abs/path/src/App.vue');
    const mockNavigator = { openFileAtLine, resolveFilePath } as unknown as FileNavigator;

    const dispatcher = new AgentDispatcher({
      fileNavigator: mockNavigator,
      isExtensionInstalledFn: () => false,
      isAntigravityEnvFn: () => true,
      sendToAgentPanelFn: async (opts) => {
        capturedOptions = opts;
      },
    });

    const res = await dispatcher.dispatch('prompt content', 'antigravity', sampleItem);
    expect(res.ok).toBe(true);
    expect(res.message).toBe('Dispatched to Antigravity Chat.');
    expect(capturedOptions).not.toBeNull();
    const opts = capturedOptions as {
      message: string;
      autoSend: boolean;
      files: Array<{ startLine: number; endLine: number }>;
    };
    expect(opts.message).toBe('prompt content');
    expect(opts.autoSend).toBe(false);
    expect(opts.files).toHaveLength(1);
    expect(opts.files[0].startLine).toBe(41); // 0-indexed line 42
    expect(opts.files[0].endLine).toBe(41);
  });
});

describe('AgentDispatcher - Deep Dispatch Seam', () => {
  const sampleItem: SonarDetailItem = {
    id: 'ISSUE-1',
    ruleKey: 'typescript:S123',
    message: 'Remove this unused variable.',
    component: 'my-project:src/index.ts',
    filePath: 'src/index.ts',
    line: 10,
    type: 'CODE_SMELL',
    severity: 'MAJOR',
    status: 'OPEN',
    tags: ['clean-code'],
    creationDate: '2026-09-13T10:00:00+0000',
  };

  describe('resolveTargetAgent', () => {
    it('should return requested agent if installed and available', async () => {
      const dispatcher = new AgentDispatcher({
        isExtensionInstalledFn: (id) => id === 'github.copilot',
      });
      const resolved = await dispatcher.resolveTargetAgent('copilot');
      expect(resolved).toBe('copilot');
    });

    it('should return clipboard if requested is clipboard', async () => {
      const dispatcher = new AgentDispatcher({
        isExtensionInstalledFn: () => false,
      });
      const resolved = await dispatcher.resolveTargetAgent('clipboard');
      expect(resolved).toBe('clipboard');
    });

    it('should fallback to defaultAgent setting if available and no valid agent requested', async () => {
      const dispatcher = new AgentDispatcher({
        isExtensionInstalledFn: (id) => id === 'anthropic.claude-code',
        getDefaultAgentFn: () => 'claude-code',
      });
      const resolved = await dispatcher.resolveTargetAgent();
      expect(resolved).toBe('claude-code');
    });

    it('should fallback to first available agent if default agent not installed', async () => {
      const dispatcher = new AgentDispatcher({
        isExtensionInstalledFn: (id) => id === 'github.copilot',
        getDefaultAgentFn: () => 'roo-code',
      });
      const resolved = await dispatcher.resolveTargetAgent();
      expect(resolved).toBe('copilot');
    });

    it('should fallback to clipboard if no agent extensions installed', async () => {
      const dispatcher = new AgentDispatcher({
        isExtensionInstalledFn: () => false,
        isAntigravityEnvFn: () => false,
      });
      const resolved = await dispatcher.resolveTargetAgent();
      expect(resolved).toBe('clipboard');
    });
  });

  describe('getRule with dynamic ProjectDetector', () => {
    it('should dynamically query ProjectDetector and enrich rule via SonarClient', async () => {
      const mockProjectDetector = {
        getConfig: vi.fn().mockResolvedValue({
          serverUrl: 'http://sonar.internal:9000',
          projectKey: 'proj-1',
        }),
        getToken: vi.fn().mockResolvedValue('sqp_token123'),
      } as unknown as ProjectDetector;

      const mockGetEnrichedRule = vi.fn().mockResolvedValue({
        key: 'typescript:S123',
        name: 'Unused local variable',
        cleanDesc: 'Unused local variables should be removed.',
      });

      const mockClientFactory = vi.fn().mockReturnValue({
        getEnrichedRule: mockGetEnrichedRule,
      });

      const dispatcher = new AgentDispatcher({
        projectDetector: mockProjectDetector,
        sonarClientFactory: mockClientFactory,
      });

      const doc1 = await dispatcher.getRule('typescript:S123');
      expect(doc1.name).toBe('Unused local variable');
      expect(mockProjectDetector.getConfig).toHaveBeenCalled();
      expect(mockProjectDetector.getToken).toHaveBeenCalled();
      expect(mockClientFactory).toHaveBeenCalledWith({
        serverUrl: 'http://sonar.internal:9000',
        token: 'sqp_token123',
      });
      expect(mockGetEnrichedRule).toHaveBeenCalledWith('typescript:S123');

      // Subsequent call should hit cache without re-querying client
      const doc2 = await dispatcher.getRule('typescript:S123');
      expect(doc2).toBe(doc1);
      expect(mockGetEnrichedRule).toHaveBeenCalledTimes(1);
    });

    it('should fall back gracefully to placeholder rule if client fails', async () => {
      const mockProjectDetector = {
        getConfig: vi.fn().mockRejectedValue(new Error('Network error')),
        getToken: vi.fn().mockResolvedValue(undefined),
      } as unknown as ProjectDetector;

      const dispatcher = new AgentDispatcher({
        projectDetector: mockProjectDetector,
      });

      const doc = await dispatcher.getRule('typescript:S999');
      expect(doc.key).toBe('typescript:S999');
      expect(doc.cleanDesc).toBe('Adhere to SonarQube quality standard for this rule.');
    });
  });

  describe('dispatchIssue', () => {
    it('should resolve agent, assemble prompt, and dispatch single issue', async () => {
      let dispatchedPrompt = '';
      let dispatchedAgent = '';
      const dispatcher = new AgentDispatcher({
        isExtensionInstalledFn: () => false,
        fetchRuleFn: async (key) => ({
          key,
          name: 'Rule Name',
          cleanDesc: 'Rule Clean Description',
        }),
      });
      vi.spyOn(dispatcher, 'dispatch').mockImplementation(async (prompt, targetAgentId) => {
        dispatchedPrompt = prompt;
        dispatchedAgent = targetAgentId;
        return { ok: true, message: 'Dispatched' };
      });

      const result = await dispatcher.dispatchIssue(sampleItem, { targetAgentId: 'clipboard' });
      expect(result.ok).toBe(true);
      expect(dispatchedAgent).toBe('clipboard');
      expect(dispatchedPrompt).toContain('### 📍 Location');
      expect(dispatchedPrompt).toContain('Rule Clean Description');
    });
  });

  describe('dispatchBatch', () => {
    it('should return ok: false if items list is empty', async () => {
      const dispatcher = new AgentDispatcher();
      const result = await dispatcher.dispatchBatch([]);
      expect(result.ok).toBe(false);
      expect(result.message).toBe('No items to dispatch.');
    });

    it('should assemble batch prompt and dispatch multiple issues', async () => {
      let dispatchedPrompt = '';
      const dispatcher = new AgentDispatcher({
        fetchRuleFn: async (key) => ({
          key,
          name: 'Sample Rule',
          cleanDesc: 'Guidance',
        }),
      });
      vi.spyOn(dispatcher, 'dispatch').mockImplementation(async (prompt) => {
        dispatchedPrompt = prompt;
        return { ok: true, message: 'Batch dispatched' };
      });

      const items: SonarDetailItem[] = [
        sampleItem,
        { ...sampleItem, id: 'ISSUE-2', line: 20, message: 'Second issue' },
      ];

      const result = await dispatcher.dispatchBatch(items, { targetAgentId: 'clipboard' });
      expect(result.ok).toBe(true);
      expect(dispatchedPrompt).toContain('Please fix the following 2 SonarQube issues');
      expect(dispatchedPrompt).toContain('Issue #1: Line 10');
      expect(dispatchedPrompt).toContain('Issue #2: Line 20');
    });
  });

  describe('dispatchDiagnostic', () => {
    it('should map diagnostic properties correctly and dispatch issue', async () => {
      let capturedItem: SonarDetailItem | undefined;
      const dispatcher = new AgentDispatcher();
      vi.spyOn(dispatcher, 'dispatchIssue').mockImplementation(async (item) => {
        capturedItem = item;
        return { ok: true, message: 'Diagnostic dispatched' };
      });

      const diag = new vscode.Diagnostic(
        new vscode.Range(14, 0, 14, 25),
        'Consider reducing cyclomatic complexity',
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = 'typescript:S3776';

      const doc = {
        fileName: '/Users/dev/my-project/src/app.ts',
        uri: vscode.Uri.file('/Users/dev/my-project/src/app.ts'),
      } as vscode.TextDocument;

      const result = await dispatcher.dispatchDiagnostic(diag, doc);
      expect(result.ok).toBe(true);
      expect(capturedItem).toBeDefined();
      expect(capturedItem?.ruleKey).toBe('typescript:S3776');
      expect(capturedItem?.message).toBe('Consider reducing cyclomatic complexity');
      expect(capturedItem?.line).toBe(15); // 1-indexed
      expect(capturedItem?.severity).toBe('CRITICAL'); // Error -> CRITICAL
    });

    it('should map Information and Hint severities correctly', async () => {
      const items: SonarDetailItem[] = [];
      const dispatcher = new AgentDispatcher();
      vi.spyOn(dispatcher, 'dispatchIssue').mockImplementation(async (item) => {
        items.push(item);
        return { ok: true, message: 'ok' };
      });

      const doc = {
        fileName: '/Users/dev/my-project/src/app.ts',
        uri: vscode.Uri.file('/Users/dev/my-project/src/app.ts'),
      } as vscode.TextDocument;

      const infoDiag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 10),
        'Info message',
        vscode.DiagnosticSeverity.Information,
      );
      await dispatcher.dispatchDiagnostic(infoDiag, doc);

      const hintDiag = new vscode.Diagnostic(
        new vscode.Range(1, 0, 1, 10),
        'Hint message',
        vscode.DiagnosticSeverity.Hint,
      );
      await dispatcher.dispatchDiagnostic(hintDiag, doc);

      expect(items[0].severity).toBe('MINOR');
      expect(items[1].severity).toBe('INFO');
    });

    it('should extract ruleKey correctly when diagnostic.code is an object, number, or undefined', async () => {
      const items: SonarDetailItem[] = [];
      const dispatcher = new AgentDispatcher();
      vi.spyOn(dispatcher, 'dispatchIssue').mockImplementation(async (item) => {
        items.push(item);
        return { ok: true, message: 'ok' };
      });

      const doc = {
        fileName: '/Users/dev/my-project/src/app.ts',
        uri: vscode.Uri.file('/Users/dev/my-project/src/app.ts'),
      } as vscode.TextDocument;

      const objDiag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 5), 'Object code issue');
      objDiag.code = {
        value: 'typescript:S1234',
        target: vscode.Uri.file('/rules/typescript/S1234'),
      };

      const numDiag = new vscode.Diagnostic(new vscode.Range(1, 0, 1, 5), 'Number code issue');
      numDiag.code = 404;

      const undefDiag = new vscode.Diagnostic(new vscode.Range(2, 0, 2, 5), 'No code issue');

      await dispatcher.dispatchDiagnostic(objDiag, doc);
      await dispatcher.dispatchDiagnostic(numDiag, doc);
      await dispatcher.dispatchDiagnostic(undefDiag, doc);

      expect(items[0].ruleKey).toBe('typescript:S1234');
      expect(items[0].id).toBe('typescript:S1234');
      expect(items[1].ruleKey).toBe('404');
      expect(items[1].id).toBe('404');
      expect(items[2].ruleKey).toBe('');
      expect(items[2].id).toBe('sonar-issue');
    });
  });
});
