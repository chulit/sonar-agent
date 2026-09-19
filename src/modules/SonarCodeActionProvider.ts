import * as vscode from 'vscode';
import { AgentDispatcher } from './AgentDispatcher.js';
import { ProjectDetector } from './ProjectDetector.js';
import { SonarClient, SonarDetailItem } from './SonarClient.js';
import { FileNavigator } from './FileNavigator.js';

export interface SonarCodeActionProviderOptions {
  projectDetector: ProjectDetector;
  fileNavigator?: FileNavigator;
  dispatcher?: AgentDispatcher;
}

export class SonarCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly projectDetector: ProjectDetector;
  private readonly fileNavigator: FileNavigator;
  private readonly customDispatcher?: AgentDispatcher;

  constructor(options: SonarCodeActionProviderOptions) {
    this.projectDetector = options.projectDetector;
    this.fileNavigator = options.fileNavigator ?? new FileNavigator();
    this.customDispatcher = options.dispatcher;
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source && diagnostic.source.toLowerCase().includes('sonar')) {
        const title = diagnostic.code
          ? `⚡ Send to AI Agent (${diagnostic.code})`
          : '⚡ Send to AI Agent (SonarQube)';

        const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
        action.command = {
          command: 'sonarAgent.fixWithAgent',
          title: 'Send to Agent',
          arguments: [diagnostic, document],
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        actions.push(action);
      }
    }

    return actions;
  }

  async executeFixWithAgent(
    diagnostic: vscode.Diagnostic,
    document: vscode.TextDocument,
  ): Promise<{ ok: boolean; message: string }> {
    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();

    let client: SonarClient | undefined;
    if (config.serverUrl && token) {
      client = new SonarClient({ serverUrl: config.serverUrl, token });
    }

    const dispatcher =
      this.customDispatcher ??
      new AgentDispatcher({
        fileNavigator: this.fileNavigator,
        fetchRuleFn: client ? (ruleKey) => client!.getEnrichedRule(ruleKey) : undefined,
      });

    const availableAgents = await dispatcher.getAvailableAgents();
    const configuredAgent = vscode.workspace
      .getConfiguration('sonarAgent')
      .get<string>('defaultAgent');

    let targetAgentId = configuredAgent;
    if (!targetAgentId || !availableAgents.some((a) => a.id === targetAgentId)) {
      targetAgentId = availableAgents[0]?.id || 'antigravity';
    }

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

    const item: SonarDetailItem = {
      id: String(diagnostic.code || 'sonar-issue'),
      ruleKey: String(diagnostic.code || ''),
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

    const prompt = await dispatcher.assemblePrompt(item);
    return dispatcher.dispatch(prompt, targetAgentId, item);
  }
}
