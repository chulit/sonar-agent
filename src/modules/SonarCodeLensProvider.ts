import * as vscode from 'vscode';
import { FileIssueAggregator } from './FileIssueAggregator.js';

export interface SonarCodeLensProviderOptions {
  fileIssueAggregator?: FileIssueAggregator;
  isCodeLensEnabledFn?: () => boolean;
}

export class SonarCodeLensProvider implements vscode.CodeLensProvider {
  private readonly fileIssueAggregator: FileIssueAggregator;
  private readonly isCodeLensEnabledFn: () => boolean;
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(options?: SonarCodeLensProviderOptions) {
    this.fileIssueAggregator = options?.fileIssueAggregator ?? new FileIssueAggregator();
    this.isCodeLensEnabledFn =
      options?.isCodeLensEnabledFn ??
      (() =>
        vscode.workspace
          .getConfiguration('sonarAgent')
          .get<boolean>('editor.codeLens.enabled', true));
  }

  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token?: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    if (!this.isCodeLensEnabledFn()) {
      return [];
    }

    const issues = this.fileIssueAggregator.aggregateIssuesForDocument(document);
    if (!issues || issues.length === 0) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    for (const item of issues) {
      const line = item.line && item.line > 0 ? item.line - 1 : 0;
      const range = new vscode.Range(line, 0, line, 0);

      const title = item.message.length > 50 ? `${item.message.slice(0, 47)}...` : item.message;

      // Push Header, Fix, and Explain lenses together
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: `⚡ Sonar: ${title}`,
          command: 'sonarAgent.fixWithAgent',
          arguments: [item, document],
        }),
        new vscode.CodeLens(range, {
          title: '[Fix with AI]',
          command: 'sonarAgent.fixWithAgent',
          arguments: [item, document],
        }),
        new vscode.CodeLens(range, {
          title: '[Explain]',
          command: 'sonarAgent.explainRuleWithAgent',
          arguments: [item, document],
        }),
      );
    }

    return codeLenses;
  }
}
