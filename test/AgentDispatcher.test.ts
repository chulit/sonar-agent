import { describe, it, expect, vi } from 'vitest';
import { AgentDispatcher } from '../src/modules/AgentDispatcher.js';
import { SonarDetailItem } from '../src/modules/SonarClient.js';
import { FileNavigator } from '../src/modules/FileNavigator.js';

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
    filePath: 'src/App.vue',
    line: 42,
    type: 'BUG',
    severity: 'MAJOR',
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
