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
}

export interface TargetAgent {
  id: 'copilot' | 'antigravity' | 'codex' | 'clipboard';
  name: string;
  description: string;
}

export class AgentDispatcher {
  private readonly ruleCache = new Map<string, SonarRuleDoc>();
  private readonly fileNavigator: FileNavigator;
  private readonly fetchRuleFn?: (ruleKey: string) => Promise<SonarRuleDoc>;
  private readonly readCodeSnippetFn?: (
    filePath: string,
    line?: number,
  ) => Promise<CodeSnippetContext | null>;

  constructor(options?: AgentDispatcherOptions) {
    this.fileNavigator = options?.fileNavigator ?? new FileNavigator();
    this.fetchRuleFn = options?.fetchRuleFn;
    this.readCodeSnippetFn = options?.readCodeSnippetFn;
  }

  getAvailableAgents(): TargetAgent[] {
    return [
      { id: 'copilot', name: 'GitHub Copilot', description: 'VS Code Copilot Chat' },
      { id: 'antigravity', name: 'Antigravity', description: 'Deepmind Antigravity Agent' },
      { id: 'codex', name: 'Codex', description: 'Codex Agent' },
      { id: 'clipboard', name: 'Clipboard Only', description: 'Copy prompt to clipboard' },
    ];
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

    // Group items by file path
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
  ): Promise<{ ok: boolean; message: string }> {
    // 1. Always copy prompt to clipboard for user convenience and universal backup
    try {
      await vscode.env.clipboard.writeText(prompt);
    } catch {
      // ignore clipboard error in headless test environments
    }

    // 2. If single item with coordinates, navigate editor to that line
    if (item && item.line) {
      await this.fileNavigator.openFileAtLine(item.filePath, item.line);
    }

    // 3. Dispatch to specific Target Agent
    if (targetAgentId === 'copilot') {
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
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

    // For Antigravity, Codex, or Clipboard fallback:
    const agentName =
      targetAgentId === 'antigravity'
        ? 'Antigravity Agent'
        : targetAgentId === 'codex'
          ? 'Codex Agent'
          : 'Clipboard';

    vscode.window.showInformationMessage(
      `Fix Prompt copied to clipboard for ${agentName}! Paste it into your agent chat.`,
    );

    return { ok: true, message: `Prompt ready in clipboard for ${agentName}.` };
  }
}
