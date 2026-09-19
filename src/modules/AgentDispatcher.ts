import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import { SonarDetailItem, SonarRuleDoc } from './SonarClient.js';
import { FileNavigator } from './FileNavigator.js';

export interface CodeSnippetContext {
  snippet: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface AgentDispatcherOptions {
  fileNavigator?: FileNavigator;
  fetchRuleFn?: (ruleKey: string) => Promise<SonarRuleDoc>;
  readCodeSnippetFn?: (filePath: string, line?: number) => Promise<CodeSnippetContext | null>;
  isExtensionInstalledFn?: (extensionId: string) => boolean;
  isAntigravityEnvFn?: () => boolean;
  executeCommandFn?: (command: string, ...args: unknown[]) => Thenable<unknown> | Promise<unknown>;
  sendToAgentPanelFn?: (options: SendToAgentPanelOptions) => Thenable<void> | Promise<void>;
}

export interface SendToAgentPanelOptions {
  message?: string;
  files?: Array<{ uri: vscode.Uri; startLine?: number; endLine?: number }>;
  autoSend?: boolean;
}

export interface TargetAgent {
  id: string;
  name: string;
  description: string;
  focusCommand?: string;
}

export class AgentDispatcher {
  private readonly ruleCache = new Map<string, SonarRuleDoc>();
  private readonly fileNavigator: FileNavigator;
  private readonly fetchRuleFn?: (ruleKey: string) => Promise<SonarRuleDoc>;
  private readonly readCodeSnippetFn?: (
    filePath: string,
    line?: number,
  ) => Promise<CodeSnippetContext | null>;
  private readonly isExtensionInstalledFn: (extensionId: string) => boolean;
  private readonly isAntigravityEnvFn: () => boolean;
  private readonly executeCommandFn: (
    command: string,
    ...args: unknown[]
  ) => Thenable<unknown> | Promise<unknown>;
  private readonly sendToAgentPanelFn: (
    options: SendToAgentPanelOptions,
  ) => Thenable<void> | Promise<void>;

  constructor(options?: AgentDispatcherOptions) {
    this.fileNavigator = options?.fileNavigator ?? new FileNavigator();
    this.fetchRuleFn = options?.fetchRuleFn;
    this.readCodeSnippetFn = options?.readCodeSnippetFn;
    this.executeCommandFn =
      options?.executeCommandFn ??
      ((cmd: string, ...args: unknown[]) => vscode.commands.executeCommand(cmd, ...args));
    this.sendToAgentPanelFn =
      options?.sendToAgentPanelFn ??
      ((opts) => {
        const ext = (vscode as unknown as Record<string, unknown>).antigravityExtensibility as
          { sendToAgentPanel?: (opts: SendToAgentPanelOptions) => Thenable<void> } | undefined;
        if (ext && typeof ext.sendToAgentPanel === 'function') {
          return ext.sendToAgentPanel(opts);
        }
        return Promise.reject(new Error('antigravityExtensibility.sendToAgentPanel not available'));
      });
    this.isExtensionInstalledFn =
      options?.isExtensionInstalledFn ??
      ((id: string) => {
        try {
          return !!vscode.extensions.getExtension(id);
        } catch {
          return false;
        }
      });
    this.isAntigravityEnvFn =
      options?.isAntigravityEnvFn ??
      (() => {
        try {
          const appName = vscode.env.appName || '';
          if (appName.toLowerCase().includes('antigravity')) {
            return true;
          }
          if (
            process.env.GEMINI_CLI ||
            process.env.ANTIGRAVITY_IDE ||
            process.env.ANTIGRAVITY_AGENT
          ) {
            return true;
          }
          return false;
        } catch {
          return false;
        }
      });
  }

  getAvailableAgents(): TargetAgent[] {
    const agents: TargetAgent[] = [];

    // 1. GitHub Copilot
    if (
      this.isExtensionInstalledFn('github.copilot') ||
      this.isExtensionInstalledFn('github.copilot-chat')
    ) {
      agents.push({
        id: 'copilot',
        name: 'GitHub Copilot',
        description: 'VS Code Copilot Chat',
        focusCommand: 'workbench.action.chat.open',
      });
    }

    // 2. Antigravity Agent
    if (
      this.isAntigravityEnvFn() ||
      this.isExtensionInstalledFn('google.antigravity') ||
      this.isExtensionInstalledFn('google.gemini')
    ) {
      agents.push({
        id: 'antigravity',
        name: 'Antigravity Agent',
        description: 'DeepMind Antigravity Agent',
        focusCommand: 'antigravity.openChatView',
      });
    }

    // 3. Claude Code
    if (this.isExtensionInstalledFn('anthropic.claude-code')) {
      agents.push({
        id: 'claude-code',
        name: 'Claude Code',
        description: 'Anthropic Claude Code for VS Code',
        focusCommand: 'workbench.view.extension.claude-sidebar',
      });
    }

    // 4. Cline
    if (this.isExtensionInstalledFn('saoudrizwan.claude-dev')) {
      agents.push({
        id: 'cline',
        name: 'Cline',
        description: 'Autonomous AI coding agent',
        focusCommand: 'claude-dev.focus',
      });
    }

    // 4. Roo Code
    if (this.isExtensionInstalledFn('rooveterinaryinc.roo-cline')) {
      agents.push({
        id: 'roo-code',
        name: 'Roo Code',
        description: 'Roo Code coding agent',
        focusCommand: 'roo-cline.focus',
      });
    }

    // 5. Continue
    if (this.isExtensionInstalledFn('continue.continue')) {
      agents.push({
        id: 'continue',
        name: 'Continue',
        description: 'Continue open-source AI assistant',
        focusCommand: 'continue.focusContinueInputView',
      });
    }

    // Universal Fallback: Clipboard Only
    agents.push({
      id: 'clipboard',
      name: 'Clipboard Only',
      description: 'Copy prompt to clipboard',
    });

    return agents;
  }

  async getRule(ruleKey: string): Promise<SonarRuleDoc> {
    if (this.ruleCache.has(ruleKey)) {
      return this.ruleCache.get(ruleKey)!;
    }

    let doc: SonarRuleDoc;
    if (this.fetchRuleFn) {
      doc = await this.fetchRuleFn(ruleKey);
    } else {
      doc = {
        key: ruleKey,
        name: ruleKey,
        cleanDesc: 'Adhere to SonarQube quality standard for this rule.',
      };
    }

    this.ruleCache.set(ruleKey, doc);
    return doc;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.vue':
        return 'vue';
      case '.html':
        return 'html';
      case '.css':
        return 'css';
      case '.py':
        return 'python';
      case '.java':
        return 'java';
      case '.go':
        return 'go';
      case '.rs':
        return 'rust';
      default:
        return '';
    }
  }

  async readCodeSnippet(filePath: string, line?: number): Promise<CodeSnippetContext | null> {
    if (this.readCodeSnippetFn) {
      return this.readCodeSnippetFn(filePath, line);
    }

    const resolvedPath = await this.fileNavigator.resolveFilePath(filePath);
    if (!resolvedPath) {
      return null;
    }

    try {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const total = lines.length;

      const targetLine = line !== undefined && line > 0 ? line : 1;
      const startLine = Math.max(1, targetLine - 10);
      const endLine = Math.min(total, targetLine + 10);

      const snippetLines: string[] = [];
      for (let i = startLine; i <= endLine; i++) {
        const lineContent = lines[i - 1];
        const marker = i === targetLine ? ' ---> [ISSUE HERE] ' : '      ';
        snippetLines.push(`${i.toString().padStart(4, ' ')} |${marker}${lineContent}`);
      }

      return {
        snippet: snippetLines.join('\n'),
        startLine,
        endLine,
        language: this.detectLanguage(filePath),
      };
    } catch {
      return null;
    }
  }

  /**
   * Assembles an enriched Fix Prompt for a single issue.
   */
  async assemblePrompt(item: SonarDetailItem): Promise<string> {
    const snippetContext = await this.readCodeSnippet(item.filePath, item.line);

    if (item.type === 'COVERAGE') {
      let prompt = `@workspace Please generate unit tests to improve test coverage for the following file:\n\n`;
      prompt += `### 📍 Target File\n`;
      prompt += `- File: \`${item.filePath}\`\n`;
      prompt += `- Status: ${item.message}\n\n`;

      if (snippetContext) {
        prompt += `### 💻 Local Code Snippet (\`${item.filePath}\`)\n`;
        prompt += `\`\`\`${snippetContext.language}\n${snippetContext.snippet}\n\`\`\`\n\n`;
      }

      prompt += `### 🎯 Instructions for Agent\n`;
      prompt += `1. Analyze the code in \`${item.filePath}\`.\n`;
      prompt += `2. Generate comprehensive unit tests covering untested functions, branches, and lines.\n`;
      prompt += `3. Use testing frameworks and conventions consistent with this project.\n`;
      return prompt;
    }

    if (item.type === 'DUPLICATION') {
      let prompt = `@workspace Please refactor duplicated code in the following file:\n\n`;
      prompt += `### 📍 Target File\n`;
      prompt += `- File: \`${item.filePath}\`\n`;
      prompt += `- Status: ${item.message}\n\n`;

      if (snippetContext) {
        prompt += `### 💻 Local Code Snippet (\`${item.filePath}\`)\n`;
        prompt += `\`\`\`${snippetContext.language}\n${snippetContext.snippet}\n\`\`\`\n\n`;
      }

      prompt += `### 🎯 Instructions for Agent\n`;
      prompt += `1. Identify repeated/duplicated code blocks in \`${item.filePath}\`.\n`;
      prompt += `2. Extract repeated logic into a helper function, shared method, or reusable module.\n`;
      prompt += `3. Ensure existing behavior, inputs, and outputs remain intact without regressions.\n`;
      return prompt;
    }

    const rule = await this.getRule(item.ruleKey);

    let prompt = `@workspace Please fix the following SonarQube issue:\n\n`;
    prompt += `### 📍 Location\n`;
    prompt += `- File: \`${item.filePath}\`\n`;
    prompt += `- Line: ${item.line || 'File level'}\n\n`;

    prompt += `### ⚠️ Issue Details\n`;
    prompt += `- Message: "${item.message}"\n`;
    prompt += `- Type: ${item.type} | Severity: ${item.severity}\n`;
    prompt += `- Sonar Rule: \`${rule.key}\` - ${rule.name}\n\n`;

    prompt += `### 📖 SonarQube Rule Details\n`;
    prompt += `${rule.cleanDesc}\n`;
    if (rule.recommendation) {
      prompt += `> Sonar Recommendation: ${rule.recommendation}\n`;
    }
    prompt += `\n`;

    if (snippetContext) {
      prompt += `### 💻 Local Code Snippet (\`${item.filePath}\` L${snippetContext.startLine}-L${snippetContext.endLine})\n`;
      prompt += `\`\`\`${snippetContext.language}\n${snippetContext.snippet}\n\`\`\`\n\n`;
    }

    prompt += `### 🎯 Instructions for Agent\n`;
    prompt += `1. Fix the issue according to the SonarQube rule without breaking existing functionality.\n`;
    prompt += `2. Maintain consistent code style with the existing codebase.\n`;
    prompt += `3. Provide the complete fixed code and concisely explain the changes.\n`;

    return prompt;
  }

  /**
   * Assembles a batch Fix Prompt grouping multiple issues by file.
   */
  async assembleBatchPrompt(items: SonarDetailItem[]): Promise<string> {
    if (items.length === 1) {
      return this.assemblePrompt(items[0]);
    }

    let prompt = `@workspace Please fix the following ${items.length} SonarQube issues:\n\n`;

    const fileGroups = new Map<string, SonarDetailItem[]>();
    for (const item of items) {
      const group = fileGroups.get(item.filePath) || [];
      group.push(item);
      fileGroups.set(item.filePath, group);
    }

    for (const [filePath, fileItems] of fileGroups) {
      prompt += `## 📁 File: \`${filePath}\` (${fileItems.length} issues)\n\n`;

      for (let idx = 0; idx < fileItems.length; idx++) {
        const item = fileItems[idx];
        const rule = await this.getRule(item.ruleKey);
        const snippetContext = await this.readCodeSnippet(item.filePath, item.line);

        prompt += `### Issue #${idx + 1}: Line ${item.line || 'File level'} [${item.severity}] ${rule.name}\n`;
        prompt += `- Message: "${item.message}"\n`;
        prompt += `- Rule: \`${rule.key}\`\n`;
        prompt += `- Guidance: ${rule.cleanDesc}\n`;

        if (snippetContext) {
          prompt += `\`\`\`${snippetContext.language}\n${snippetContext.snippet}\n\`\`\`\n`;
        }
        prompt += `\n`;
      }
    }

    prompt += `### 🎯 Instructions for Agent\n`;
    prompt += `1. Fix all listed issues sequentially per file.\n`;
    prompt += `2. Preserve existing behavior and do not break other functionality.\n`;
    prompt += `3. Explain the applied fixes concisely.\n`;

    return prompt;
  }

  /**
   * Dispatches the assembled prompt to the specified Target Agent or clipboard.
   */
  async dispatch(
    prompt: string,
    targetAgentId: string,
    item?: SonarDetailItem,
    allItems?: SonarDetailItem[],
  ): Promise<{ ok: boolean; message: string }> {
    try {
      await vscode.env.clipboard.writeText(prompt);
    } catch {
      // ignore clipboard error in headless test environments
    }

    if (item && item.line) {
      await this.fileNavigator.openFileAtLine(item.filePath, item.line);
    }

    if (targetAgentId === 'copilot') {
      try {
        await this.executeCommandFn('workbench.action.chat.open', {
          query: prompt,
        });
        vscode.window.showInformationMessage('Dispatched Fix Prompt to GitHub Copilot Chat!');
        return { ok: true, message: 'Dispatched to GitHub Copilot Chat.' };
      } catch {
        vscode.window.showInformationMessage(
          'Prompt copied to clipboard! Paste it into GitHub Copilot Chat.',
        );
        return { ok: true, message: 'Copied to clipboard (Copilot chat command not found).' };
      }
    }

    if (targetAgentId === 'antigravity') {
      try {
        const files: Array<{ uri: vscode.Uri; startLine?: number; endLine?: number }> = [];
        const itemsToProcess = allItems && allItems.length > 0 ? allItems : item ? [item] : [];
        const seenUris = new Set<string>();

        for (const it of itemsToProcess) {
          if (it.filePath) {
            const resolvedPath = await this.fileNavigator.resolveFilePath(it.filePath);
            if (resolvedPath && !seenUris.has(resolvedPath)) {
              seenUris.add(resolvedPath);
              const line = it.line && it.line > 0 ? it.line - 1 : 0;
              files.push({
                uri: vscode.Uri.file(resolvedPath),
                startLine: line,
                endLine: line,
              });
            }
          }
        }

        await this.sendToAgentPanelFn({
          message: prompt,
          files: files.length > 0 ? files : undefined,
          autoSend: false,
        });

        vscode.window.showInformationMessage('Dispatched Fix Prompt to Antigravity Chat!');
        return { ok: true, message: 'Dispatched to Antigravity Chat.' };
      } catch {
        // Fallback to command execution if sendToAgentPanel fails
      }

      for (const cmd of [
        'workbench.action.chat.open',
        'antigravity.prioritized.chat.open',
        'workbench.action.openChat',
      ]) {
        try {
          await this.executeCommandFn(cmd, { query: prompt });
          vscode.window.showInformationMessage('Dispatched Fix Prompt to Antigravity Chat!');
          return { ok: true, message: 'Dispatched to Antigravity Chat.' };
        } catch {
          // continue trying next command
        }
      }

      try {
        await this.executeCommandFn('antigravity.openChatView');
        vscode.window.showInformationMessage(
          'Antigravity Chat opened & prompt copied to clipboard! Press Cmd+V / Ctrl+V to paste.',
        );
        return { ok: true, message: 'Chat opened and prompt ready in clipboard.' };
      } catch {
        vscode.window.showInformationMessage(
          'Fix Prompt copied to clipboard for Antigravity Agent! Paste it into your agent chat.',
        );
        return { ok: true, message: 'Prompt ready in clipboard for Antigravity Agent.' };
      }
    }

    const matchedAgent = this.getAvailableAgents().find((a) => a.id === targetAgentId);
    const agentName =
      matchedAgent?.name ||
      (targetAgentId === 'claude-code'
        ? 'Claude Code'
        : targetAgentId === 'cline'
          ? 'Cline'
          : targetAgentId === 'roo-code'
            ? 'Roo Code'
            : targetAgentId === 'continue'
              ? 'Continue'
              : 'Clipboard');

    if (targetAgentId === 'claude-code') {
      const claudeCommands = [
        'workbench.view.extension.claude-sidebar',
        'claude-code.focus',
        'claude.focus',
      ];
      for (const cmd of claudeCommands) {
        try {
          await this.executeCommandFn(cmd);
          break;
        } catch {
          // continue trying next command
        }
      }
    } else if (matchedAgent?.focusCommand) {
      try {
        await this.executeCommandFn(matchedAgent.focusCommand);
      } catch {
        // focus command failed or not registered, proceed to clipboard notice
      }
    }

    if (targetAgentId === 'clipboard') {
      vscode.window.showInformationMessage('Fix Prompt copied to clipboard!');
      return { ok: true, message: 'Prompt ready in clipboard.' };
    }

    vscode.window.showInformationMessage(
      `Fix Prompt copied to clipboard for ${agentName}! Paste it into your agent chat.`,
    );

    return { ok: true, message: `Prompt ready in clipboard for ${agentName}.` };
  }
}
