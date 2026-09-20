import * as vscode from 'vscode';
import { ProjectDetector } from './modules/ProjectDetector.js';
import { SonarOverviewViewProvider } from './modules/SonarOverviewViewProvider.js';
import { SonarCodeActionProvider } from './modules/SonarCodeActionProvider.js';
import { Logger } from './modules/Logger.js';

export function activate(context: vscode.ExtensionContext) {
  const logChannel = Logger.initialize();
  context.subscriptions.push(logChannel);
  Logger.info('Sonar Agent extension activated.');

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

  const codeActionProvider = new SonarCodeActionProvider({
    projectDetector,
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SonarOverviewViewProvider.viewType, overviewProvider),
    vscode.commands.registerCommand('sonarAgent.refresh', async () => {
      await overviewProvider.refresh();
    }),
    vscode.commands.registerCommand('sonarAgent.configure', async () => {
      await overviewProvider.promptConfigureConnection();
    }),
    vscode.commands.registerCommand('sonarAgent.selectProject', async () => {
      await overviewProvider.promptProjectSelection();
    }),
    vscode.commands.registerCommand('sonarAgent.profile.manage', async () => {
      await overviewProvider.promptManageProfiles();
    }),
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
    vscode.commands.registerCommand('sonarAgent.showLogs', () => {
      Logger.show();
    }),
    vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, codeActionProvider, {
      providedCodeActionKinds: SonarCodeActionProvider.providedCodeActionKinds,
    }),
    vscode.commands.registerCommand(
      'sonarAgent.fixWithAgent',
      async (diagnostic: vscode.Diagnostic, document: vscode.TextDocument) => {
        if (!diagnostic || !document) return;
        await codeActionProvider.executeFixWithAgent(diagnostic, document);
      },
    ),
  );

  void projectDetector.migrateResetIfLegacy().then((migrated) => {
    if (!migrated) {
      return;
    }
    Logger.info('Legacy single connection removed; directing user to create a profile.');
    vscode.window
      .showInformationMessage(
        'Single connection removed — create a profile to reconnect.',
        'New Profile',
      )
      .then((selection) => {
        if (selection === 'New Profile') {
          void overviewProvider.promptCreateProfile();
        }
      });
  });
}

export function deactivate() {
  Logger.dispose();
}
