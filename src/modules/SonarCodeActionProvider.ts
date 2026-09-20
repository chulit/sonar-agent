import * as vscode from 'vscode';
import { AgentDispatcher } from './AgentDispatcher.js';
import { ProjectDetector } from './ProjectDetector.js';
import { FileNavigator } from './FileNavigator.js';

export interface SonarCodeActionProviderOptions {
  projectDetector: ProjectDetector;
  fileNavigator?: FileNavigator;
  dispatcher?: AgentDispatcher;
}

export class SonarCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly dispatcher: AgentDispatcher;

  constructor(options: SonarCodeActionProviderOptions) {
    this.dispatcher =
      options.dispatcher ??
      new AgentDispatcher({
        projectDetector: options.projectDetector,
        fileNavigator: options.fileNavigator,
      });
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
    return this.dispatcher.dispatchDiagnostic(diagnostic, document);
  }
}
