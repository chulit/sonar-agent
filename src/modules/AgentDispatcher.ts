import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import { SonarClient, SonarDetailItem, SonarRuleDoc } from './SonarClient.js';
import { FileNavigator } from './FileNavigator.js';
import { ProjectDetector } from './ProjectDetector.js';

export interface CodeSnippetContext {
  snippet: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface DispatchOptions {
  targetAgentId?: string;
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
  private readonly projectDetector?: ProjectDetector;
  private readonly sonarClientFactory: (config: {
    serverUrl: string;
    token: string;
  }) => SonarClient;
  private readonly getDefaultAgentFn: () => string;
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
    this.projectDetector = options?.projectDetector;
    this.sonarClientFactory =
      options?.sonarClientFactory ??
      ((cfg) => new SonarClient({ serverUrl: cfg.serverUrl, token: cfg.token }));
    this.getDefaultAgentFn =
      options?.getDefaultAgentFn ??
      (() =>
        vscode.workspace.getConfiguration('sonarAgent').get<string>('defaultAgent', 'copilot'));
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
        focusCommand: 'claude-vscode.editor.openLast',
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

    // 6. Codex
    if (
      this.isExtensionInstalledFn('openai.chatgpt') ||
      this.isExtensionInstalledFn('openai.openai-chatgpt') ||
      this.isExtensionInstalledFn('codex.codex')
    ) {
      agents.push({
        id: 'codex',
        name: 'Codex Agent',
        description: 'OpenAI Codex AI Assistant',
        focusCommand: 'chatgpt.openSidebar',
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

    let doc: SonarRuleDoc | undefined;
    if (this.fetchRuleFn) {
      doc = await this.fetchRuleFn(ruleKey);
    } else if (this.projectDetector) {
      try {
        const config = await this.projectDetector.getConfig();
        const token = await this.projectDetector.getToken();
        if (config.serverUrl && token) {
          const client = this.sonarClientFactory({ serverUrl: config.serverUrl, token });
          doc = await client.getEnrichedRule(ruleKey);
        }
      } catch {
        // Fall back to basic placeholder if rule enrichment fails
      }
    }

    doc ??= {
      key: ruleKey,
      name: ruleKey,
      cleanDesc: 'Adhere to SonarQube quality standard for this rule.',
    };

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

  private async dispatchCopilot(prompt: string): Promise<{ ok: boolean; message: string }> {
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

  private async collectAntigravityFiles(
    items: SonarDetailItem[],
  ): Promise<Array<{ uri: vscode.Uri; startLine?: number; endLine?: number }>> {
    const files: Array<{ uri: vscode.Uri; startLine?: number; endLine?: number }> = [];
    const seenUris = new Set<string>();

    for (const it of items) {
      if (!it.filePath) continue;
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
    return files;
  }

  private async tryOpenAntigravityChat(prompt: string): Promise<boolean> {
    const commands = [
      'workbench.action.chat.open',
      'antigravity.prioritized.chat.open',
      'workbench.action.openChat',
    ];
    for (const cmd of commands) {
      try {
        await this.executeCommandFn(cmd, { query: prompt });
        return true;
      } catch {
        // continue trying next command
      }
    }
    return false;
  }

  private async dispatchAntigravity(
    prompt: string,
    item?: SonarDetailItem,
    allItems?: SonarDetailItem[],
  ): Promise<{ ok: boolean; message: string }> {
    try {
      let itemsToProcess: SonarDetailItem[] = [];
      if (allItems && allItems.length > 0) {
        itemsToProcess = allItems;
      } else if (item) {
        itemsToProcess = [item];
      }
      const files = await this.collectAntigravityFiles(itemsToProcess);

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

    if (await this.tryOpenAntigravityChat(prompt)) {
      vscode.window.showInformationMessage('Dispatched Fix Prompt to Antigravity Chat!');
      return { ok: true, message: 'Dispatched to Antigravity Chat.' };
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

  private async focusTargetAgent(targetAgentId: string, matchedAgent?: TargetAgent): Promise<void> {
    if (targetAgentId === 'claude-code') {
      const claudeCommands = [
        'claude-vscode.editor.openLast',
        'claude-vscode.sidebar.open',
        'claude-vscode.focus',
      ];
      for (const cmd of claudeCommands) {
        try {
          await this.executeCommandFn(cmd);
          break;
        } catch {
          // continue trying next command
        }
      }
    } else if (targetAgentId === 'codex') {
      const codexCommands = ['chatgpt.openSidebar'];
      for (const cmd of codexCommands) {
        try {
          await this.executeCommandFn(cmd);
          try {
            await this.executeCommandFn('chatgpt.addToThread');
          } catch {
            // The Codex extension may not have an active editor selection.
          }
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

    if (item?.line) {
      await this.fileNavigator.openFileAtLine(item.filePath, item.line);
    }

    if (targetAgentId === 'copilot') {
      return this.dispatchCopilot(prompt);
    }

    if (targetAgentId === 'antigravity') {
      return this.dispatchAntigravity(prompt, item, allItems);
    }

    if (targetAgentId === 'claude-code') {
      try {
        await this.executeCommandFn('claude-vscode.editor.open', undefined, prompt);
        try {
          await this.executeCommandFn('claude-vscode.insertAtMention');
        } catch {
          // The Claude Code extension may not have an active editor selection.
        }
        vscode.window.showInformationMessage('Dispatched Fix Prompt to Claude Code.');
        return { ok: true, message: 'Dispatched to Claude Code.' };
      } catch {
        // The Claude Code prompt command is unavailable in older extension versions.
      }
    }

    const matchedAgent = this.getAvailableAgents().find((a) => a.id === targetAgentId);
    const fallbackNames: Record<string, string> = {
      'claude-code': 'Claude Code',
      cline: 'Cline',
      'roo-code': 'Roo Code',
      continue: 'Continue',
      codex: 'Codex Agent',
    };
    const agentName = matchedAgent?.name ?? fallbackNames[targetAgentId] ?? 'Clipboard';

    await this.focusTargetAgent(targetAgentId, matchedAgent);

    if (targetAgentId === 'clipboard') {
      vscode.window.showInformationMessage('Fix Prompt copied to clipboard!');
      return { ok: true, message: 'Prompt ready in clipboard.' };
    }

    vscode.window.showInformationMessage(
      `Fix Prompt copied to clipboard for ${agentName}! Paste it into your agent chat.`,
    );

    return { ok: true, message: `Prompt ready in clipboard for ${agentName}.` };
  }

  /**
   * Resolves target agent using requested ID or active configuration fallback.
   */
  async resolveTargetAgent(requestedAgentId?: string): Promise<string> {
    const available = this.getAvailableAgents();
    if (requestedAgentId && available.some((a) => a.id === requestedAgentId)) {
      return requestedAgentId;
    }
    if (requestedAgentId === 'clipboard') {
      return 'clipboard';
    }
    const defaultAgent = this.getDefaultAgentFn();
    if (defaultAgent && available.some((a) => a.id === defaultAgent)) {
      return defaultAgent;
    }
    return available[0]?.id || 'clipboard';
  }

  /**
   * Dispatches a single SonarQube issue to the resolved or specified Target Agent.
   */
  async dispatchIssue(
    item: SonarDetailItem,
    options?: DispatchOptions,
  ): Promise<{ ok: boolean; message: string }> {
    const targetAgentId = await this.resolveTargetAgent(options?.targetAgentId);
    const prompt = await this.assemblePrompt(item);
    return this.dispatch(prompt, targetAgentId, item);
  }

  /**
   * Dispatches a batch of SonarQube issues to the resolved or specified Target Agent.
   */
  async dispatchBatch(
    items: SonarDetailItem[],
    options?: DispatchOptions,
  ): Promise<{ ok: boolean; message: string }> {
    if (!items || items.length === 0) {
      return { ok: false, message: 'No items to dispatch.' };
    }
    const targetAgentId = await this.resolveTargetAgent(options?.targetAgentId);
    const prompt = await this.assembleBatchPrompt(items);
    return this.dispatch(prompt, targetAgentId, items[0], items);
  }

  /**
   * Dispatches an editor diagnostic (e.g. from SonarLint / CodeAction) to the Target Agent.
   */
  async dispatchDiagnostic(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument,
    options?: DispatchOptions,
  ): Promise<{ ok: boolean; message: string }> {
    let severity: SonarDetailItem['severity'] = 'MAJOR';
    if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
      severity = 'CRITICAL';
    } else if (diagnostic.severity === vscode.DiagnosticSeverity.Information) {
      severity = 'MINOR';
    } else if (diagnostic.severity === vscode.DiagnosticSeverity.Hint) {
      severity = 'INFO';
    }

    const relativePath = vscode.workspace.asRelativePath
      ? vscode.workspace.asRelativePath(document.uri)
      : document.fileName;

    let codeVal = '';
    const code = diagnostic.code;
    if (typeof code === 'string') {
      codeVal = code;
    } else if (typeof code === 'number') {
      codeVal = String(code);
    } else if (typeof code === 'object' && code !== null) {
      codeVal = code.value !== undefined && code.value !== null ? String(code.value) : '';
    }

    const item: SonarDetailItem = {
      id: codeVal || 'sonar-issue',
      ruleKey: codeVal,
      message: diagnostic.message,
      component: relativePath,
      filePath: relativePath,
      line: diagnostic.range.start.line + 1,
      severity,
      type: 'CODE_SMELL',
      status: 'OPEN',
      tags: [],
      creationDate: new Date().toISOString(),
    };

    return this.dispatchIssue(item, options);
  }
}
