import * as vscode from 'vscode';
import { ProjectDetector } from './modules/ProjectDetector.js';
import { SonarOverviewViewProvider } from './modules/SonarOverviewViewProvider.js';
import { SonarCodeActionProvider } from './modules/SonarCodeActionProvider.js';

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const projectDetector = new ProjectDetector({
    secretStorage: context.secrets,
    workspaceConfig: {
      get: <T>(sec: string, def?: T) =>
        vscode.workspace.getConfiguration('sonarAgent').get<T>(sec, def as T),
      update: (sec: string, val: any, target?: boolean | number) =>
        vscode.workspace.getConfiguration('sonarAgent').update(sec, val, target),
    },
    workspaceRoot,
  });

  const overviewProvider = new SonarOverviewViewProvider(context.extensionUri, projectDetector);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SonarOverviewViewProvider.viewType, overviewProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sonarAgent.refresh', async () => {
      await overviewProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sonarAgent.configure', async () => {
      await vscode.commands.executeCommand('sonarAgent.overviewView.focus');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sonarAgent.selectProject', async () => {
      await overviewProvider.promptProjectSelection();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sonarAgent.resetConnection', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Are you sure you want to disconnect and remove stored SonarQube credentials?',
        { modal: true },
        'Disconnect',
      );
      if (confirm === 'Disconnect') {
        await projectDetector.deleteToken();
        await overviewProvider.refresh();
        vscode.window.showInformationMessage('SonarQube credentials have been removed.');
      }
    }),
  );

  const codeActionProvider = new SonarCodeActionProvider({
    projectDetector,
  });

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, codeActionProvider, {
      providedCodeActionKinds: SonarCodeActionProvider.providedCodeActionKinds,
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'sonarAgent.fixWithAgent',
      async (diagnostic: vscode.Diagnostic, document: vscode.TextDocument) => {
        if (!diagnostic || !document) return;
        await codeActionProvider.executeFixWithAgent(diagnostic, document);
      },
    ),
  );
}

export function deactivate() {}
