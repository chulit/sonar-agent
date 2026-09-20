import * as vscode from 'vscode';
import { ProjectDetector } from './ProjectDetector.js';
import { SonarClient } from './SonarClient.js';
import { Logger } from './Logger.js';

export type ProfileAction =
  'switchProfile' | 'newProfile' | 'renameProfile' | 'deleteProfile' | 'verifyConnection';

export interface ConnectionProfileWizardOptions {
  projectDetector: ProjectDetector;
  sonarClientFactory?: (config: { serverUrl: string; token: string }) => SonarClient;
  onConfigChanged?: () => Promise<void> | void;
  promptProjectSelectionFn?: () => Promise<void>;
  showQuickPickFn?: typeof vscode.window.showQuickPick;
  showInputBoxFn?: typeof vscode.window.showInputBox;
  showInformationMessageFn?: typeof vscode.window.showInformationMessage;
  showWarningMessageFn?: typeof vscode.window.showWarningMessage;
  showErrorMessageFn?: typeof vscode.window.showErrorMessage;
  withProgressFn?: typeof vscode.window.withProgress;
  executeCommandFn?: typeof vscode.commands.executeCommand;
}

export class ConnectionProfileWizard {
  private readonly projectDetector: ProjectDetector;
  private readonly onConfigChanged?: () => Promise<void> | void;

  constructor(private readonly options: ConnectionProfileWizardOptions) {
    this.projectDetector = options.projectDetector;
    this.onConfigChanged = options.onConfigChanged;
  }

  private get sonarClientFactory(): (config: { serverUrl: string; token: string }) => SonarClient {
    return this.options.sonarClientFactory ?? ((cfg) => new SonarClient(cfg));
  }

  private get showQuickPickFn(): typeof vscode.window.showQuickPick {
    return this.options.showQuickPickFn ?? vscode.window.showQuickPick;
  }

  private get showInputBoxFn(): typeof vscode.window.showInputBox {
    return this.options.showInputBoxFn ?? vscode.window.showInputBox;
  }

  private get showInformationMessageFn(): typeof vscode.window.showInformationMessage {
    return this.options.showInformationMessageFn ?? vscode.window.showInformationMessage;
  }

  private get showWarningMessageFn(): typeof vscode.window.showWarningMessage {
    return this.options.showWarningMessageFn ?? vscode.window.showWarningMessage;
  }

  private get showErrorMessageFn(): typeof vscode.window.showErrorMessage {
    return this.options.showErrorMessageFn ?? vscode.window.showErrorMessage;
  }

  private get withProgressFn(): typeof vscode.window.withProgress {
    return this.options.withProgressFn ?? vscode.window.withProgress;
  }

  private get executeCommandFn(): typeof vscode.commands.executeCommand {
    return this.options.executeCommandFn ?? vscode.commands.executeCommand;
  }

  private profilesCapable(): boolean {
    return (
      typeof (this.projectDetector as unknown as { listProfiles?: unknown }).listProfiles ===
      'function'
    );
  }

  private async notifyConfigChanged(): Promise<void> {
    if (this.onConfigChanged) {
      await this.onConfigChanged();
    }
  }

  public async promptProjectSelection(): Promise<void> {
    if (this.options.promptProjectSelectionFn) {
      return this.options.promptProjectSelectionFn();
    }
    return this.promptProjectSelectionInternal();
  }

  public async promptProjectSelectionInternal(): Promise<void> {
    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();

    if (!config.serverUrl || !token) {
      this.showWarningMessageFn('Please connect to SonarQube first.');
      return;
    }

    const client = this.sonarClientFactory({ serverUrl: config.serverUrl, token });
    const projects = await client.fetchProjects();

    const manualOption = {
      label: '$(edit) Enter Project Key manually...',
      description: 'Type the exact project key from SonarQube',
      detail: 'Use this if your project is not listed or search is restricted',
    };

    const items = [
      manualOption,
      ...projects.map((p) => ({
        label: p.name,
        description: p.key,
        detail: p.key === config.projectKey ? '(Currently selected)' : undefined,
      })),
    ];

    const selected = await (
      this.showQuickPickFn as (
        items: vscode.QuickPickItem[],
        options?: vscode.QuickPickOptions,
      ) => Thenable<vscode.QuickPickItem | undefined>
    )(items, {
      placeHolder: 'Select a SonarQube project or enter key manually',
      matchOnDescription: true,
    });

    if (selected === manualOption) {
      const manualKey = await this.showInputBoxFn({
        prompt: 'Enter the SonarQube Project Key',
        placeHolder: 'e.g. org.company:my-project',
        value: config.projectKey || '',
        validateInput: (val) => (!val.trim() ? 'Project Key cannot be empty' : null),
      });

      if (manualKey?.trim()) {
        const trimmed = manualKey.trim();
        await this.projectDetector.setProjectKey(trimmed);
        await this.notifyConfigChanged();
        this.showInformationMessageFn(`Active SonarQube project set to: ${trimmed}`);
      }
      return;
    }

    if (selected?.description) {
      const chosenKey = selected.description;
      await this.projectDetector.setProjectKey(chosenKey);
      await this.notifyConfigChanged();
      this.showInformationMessageFn(`Active SonarQube project set to: ${selected.label}`);
    }
  }

  public async promptConfigureConnection(): Promise<void> {
    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    const isConnected = Boolean(config.serverUrl && token);

    interface ConfigQuickPickItem extends vscode.QuickPickItem {
      action:
        | 'updateCredentials'
        | 'selectProject'
        | 'openSettings'
        | 'showLogs'
        | 'disconnect'
        | ProfileAction;
    }

    const items: ConfigQuickPickItem[] = [
      {
        label: '$(link) Update Server URL & Token',
        description: isConnected ? 'Connected' : 'Not connected',
        detail: config.serverUrl
          ? `Server: ${config.serverUrl}`
          : 'Configure SonarQube host URL and authentication token',
        action: 'updateCredentials',
      },
      {
        label: '$(folder-active) Select Sonar Project',
        description: config.projectKey ? 'Active' : 'Not selected',
        detail: config.projectKey
          ? `Current project: ${config.projectKey}`
          : 'Choose an active project on the server',
        action: 'selectProject',
      },
      {
        label: '$(settings-gear) Open Extension Settings',
        detail: 'Configure default AI agent and advanced preferences',
        action: 'openSettings',
      },
      {
        label: '$(output) Show Extension Logs',
        detail: 'Open the Sonar Agent output log channel',
        action: 'showLogs',
      },
    ];

    if (isConnected) {
      items.push({
        label: '$(debug-disconnect) Disconnect & Reset Credentials',
        detail: 'Remove stored token from OS Keychain and disconnect',
        action: 'disconnect',
      });
    }

    if (this.profilesCapable()) {
      items.splice(2, 0, {
        label: '$(arrow-swap) Switch Connection Profile',
        detail: 'Activate a different server + project + token binding',
        action: 'switchProfile',
      });
      items.splice(3, 0, {
        label: '$(add) New Connection Profile...',
        detail: 'Create a named server + project binding with live verification',
        action: 'newProfile',
      });
      items.splice(4, 0, {
        label: '$(edit) Rename Connection Profile...',
        detail: 'Rename a stored connection profile',
        action: 'renameProfile',
      });
      items.splice(5, 0, {
        label: '$(trash) Delete Connection Profile...',
        detail: 'Remove a profile and delete its token from the OS Keychain',
        action: 'deleteProfile',
      });
      items.splice(6, 0, {
        label: '$(check) Verify Active Connection',
        detail: 'Live-check the active profile against the SonarQube server',
        action: 'verifyConnection',
      });
    }

    const selected = await this.showQuickPickFn(items as any, {
      placeHolder: 'Sonar Agent: Configure Connection & Settings',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return;
    }

    const pickedAction = (selected as unknown as ConfigQuickPickItem).action;

    switch (pickedAction) {
      case 'updateCredentials':
        await this.promptUpdateCredentials(config.serverUrl);
        break;
      case 'selectProject':
        await this.promptProjectSelection();
        break;
      case 'switchProfile':
      case 'newProfile':
      case 'renameProfile':
      case 'deleteProfile':
      case 'verifyConnection':
        await this.runProfileAction(pickedAction);
        break;
      case 'openSettings':
        await this.executeCommandFn('workbench.action.openSettings', '@ext:chulit.sonar-agent');
        break;
      case 'showLogs':
        Logger.show();
        break;
      case 'disconnect':
        await this.executeCommandFn('sonarAgent.resetConnection');
        break;
    }
  }

  public async promptUpdateCredentials(initialUrl?: string, initialToken?: string): Promise<void> {
    let currentUrl =
      initialUrl || (await this.projectDetector.getConfig()).serverUrl || 'http://localhost:9000';
    let currentToken = initialToken || '';

    while (true) {
      const serverUrl = await this.showInputBoxFn({
        title: 'SonarQube Connection (1/2)',
        prompt: 'Enter the SonarQube Server URL',
        placeHolder: 'http://localhost:9000 or https://sonar.example.com',
        value: currentUrl,
        ignoreFocusOut: true,
        validateInput: (value) => this.validateServerUrlInput(value),
      });

      if (serverUrl === undefined) {
        return;
      }

      currentUrl = serverUrl.trim();

      const token = await this.showInputBoxFn({
        title: 'SonarQube Connection (2/2)',
        prompt: 'Enter your SonarQube User Token',
        placeHolder: 'sqp_...',
        value: currentToken,
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value.trim()) {
            return 'User Token is required';
          }
          return null;
        },
      });

      if (token === undefined) {
        return;
      }

      currentToken = token.trim();

      let verificationResult: { ok: boolean; message?: string } = { ok: false };
      await this.withProgressFn(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Verifying SonarQube connection...',
          cancellable: false,
        },
        async () => {
          const client = this.sonarClientFactory({ serverUrl: currentUrl, token: currentToken });
          verificationResult = await client.verifyConnection();
        },
      );

      if (!verificationResult.ok) {
        const action = await this.showErrorMessageFn(
          `SonarQube connection verification failed: ${verificationResult.message || 'Unknown error'}`,
          'Retry',
          'Cancel',
        );

        if (action === 'Retry') {
          continue;
        }
        return;
      }

      await this.projectDetector.setServerUrl(currentUrl);
      await this.projectDetector.setToken(currentToken);

      this.showInformationMessageFn('SonarQube connection successfully verified and saved!');

      const updatedConfig = await this.projectDetector.getConfig();
      if (!updatedConfig.projectKey) {
        await this.promptProjectSelection();
      }

      await this.notifyConfigChanged();
      return;
    }
  }

  public validateServerUrlInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'Server URL is required';
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return 'Server URL must start with http:// or https://';
    }
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname) {
        return 'Please enter a valid URL with hostname';
      }
    } catch {
      return 'Please enter a valid URL';
    }
    return null;
  }

  public async promptManageProfiles(): Promise<void> {
    const items: (vscode.QuickPickItem & { action: ProfileAction })[] = [
      { label: '$(arrow-swap) Switch Profile', action: 'switchProfile' },
      { label: '$(add) New Profile...', action: 'newProfile' },
      { label: '$(edit) Rename Profile...', action: 'renameProfile' },
      { label: '$(trash) Delete Profile...', action: 'deleteProfile' },
      { label: '$(check) Verify Active Connection', action: 'verifyConnection' },
    ];
    const selected = await this.showQuickPickFn(items as any, {
      placeHolder: 'Sonar Agent: Manage Connection Profiles',
    });
    if (!selected) {
      return;
    }
    await this.runProfileAction((selected as unknown as { action: ProfileAction }).action);
  }

  public async runProfileAction(action: ProfileAction): Promise<void> {
    switch (action) {
      case 'switchProfile': {
        const picked = await this.pickProfile('Select the connection profile to activate');
        if (!picked) {
          return;
        }
        try {
          await this.projectDetector.activateProfile(picked.id);
        } catch (err: unknown) {
          const msg = (err as Error)?.message || `Unknown connection profile: ${picked.id}`;
          this.showErrorMessageFn(msg);
          return;
        }
        this.showInformationMessageFn(`Active connection profile: ${picked.name}`);
        await this.notifyConfigChanged();
        break;
      }
      case 'newProfile':
        await this.promptCreateProfile();
        break;
      case 'renameProfile': {
        const picked = await this.pickProfile('Select the connection profile to rename');
        if (!picked) {
          return;
        }
        const name = await this.showInputBoxFn({
          prompt: `New name for profile "${picked.name}"`,
          value: picked.name,
          ignoreFocusOut: true,
          validateInput: (value) => (!value.trim() ? 'Profile name is required' : null),
        });
        if (!name?.trim()) {
          return;
        }
        await this.projectDetector.renameProfile(picked.id, name.trim());
        await this.notifyConfigChanged();
        break;
      }
      case 'deleteProfile': {
        const picked = await this.pickProfile('Select the connection profile to delete');
        if (!picked) {
          return;
        }
        const confirm = await this.showWarningMessageFn(
          `Delete connection profile "${picked.name}" and its stored token?`,
          { modal: true },
          'Delete',
        );
        if (confirm !== 'Delete') {
          return;
        }
        await this.projectDetector.deleteProfile(picked.id);
        this.showInformationMessageFn(
          `Connection profile "${picked.name}" deleted. Create a profile to reconnect.`,
        );
        await this.notifyConfigChanged();
        break;
      }
      case 'verifyConnection': {
        const binding = await this.projectDetector.getConfig();
        const bindingToken = await this.projectDetector.getToken();
        if (!binding.serverUrl || !bindingToken) {
          this.showWarningMessageFn('No active connection profile to verify.');
          return;
        }
        let result: { ok: boolean; message?: string } = { ok: false };
        await this.withProgressFn(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Verifying SonarQube connection...',
            cancellable: false,
          },
          async () => {
            const client = this.sonarClientFactory({
              serverUrl: binding.serverUrl,
              token: bindingToken,
            });
            result = await client.verifyConnection();
          },
        );
        if (result.ok) {
          this.showInformationMessageFn('SonarQube connection verified.');
        } else {
          this.showErrorMessageFn(
            `SonarQube connection verification failed: ${result.message || 'Unknown error'}`,
          );
        }
        break;
      }
    }
  }

  public async pickProfile(placeHolder: string): Promise<{ id: string; name: string } | undefined> {
    const profiles = await this.projectDetector.listProfiles();
    if (profiles.length === 0) {
      this.showInformationMessageFn('No connection profiles yet. Create one first.');
      return undefined;
    }
    const picked = await (
      this.showQuickPickFn as (
        items: vscode.QuickPickItem[],
        options?: vscode.QuickPickOptions,
      ) => Thenable<vscode.QuickPickItem | undefined>
    )(
      profiles.map((p) => ({
        label: p.name,
        description: p.id,
        detail: `${p.serverUrl} · ${p.projectKey}`,
      })),
      { placeHolder, matchOnDescription: true, matchOnDetail: true },
    );
    return picked ? profiles.find((p) => p.id === picked.description) : undefined;
  }

  public async promptCreateProfile(): Promise<void> {
    const suggested = await this.projectDetector.getCreationSuggestion();
    let currentName = '';
    let currentUrl = suggested?.serverUrl ?? 'http://localhost:9000';
    let currentToken = '';
    let currentKey = suggested?.projectKey ?? '';

    while (true) {
      const name = await this.showInputBoxFn({
        title: 'New Connection Profile (1/4)',
        prompt: 'Name this profile (e.g. kantor-prod)',
        value: currentName,
        ignoreFocusOut: true,
        validateInput: (value) => (!value.trim() ? 'Profile name is required' : null),
      });
      if (name === undefined) {
        return;
      }
      currentName = name.trim();

      const serverUrl = await this.showInputBoxFn({
        title: 'New Connection Profile (2/4)',
        prompt: 'Enter the SonarQube Server URL',
        placeHolder: 'http://localhost:9000 or https://sonar.example.com',
        value: currentUrl,
        ignoreFocusOut: true,
        validateInput: (value) => this.validateServerUrlInput(value),
      });
      if (serverUrl === undefined) {
        return;
      }
      currentUrl = serverUrl.trim();

      const token = await this.showInputBoxFn({
        title: 'New Connection Profile (3/4)',
        prompt: 'Enter your SonarQube User Token',
        placeHolder: 'sqp_...',
        value: currentToken,
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => (!value.trim() ? 'User Token is required' : null),
      });
      if (token === undefined) {
        return;
      }
      currentToken = token.trim();

      const projectKey = await this.showInputBoxFn({
        title: 'New Connection Profile (4/4)',
        prompt: 'Enter the SonarQube Project Key (optional, pick later)',
        value: currentKey,
        ignoreFocusOut: true,
      });
      if (projectKey === undefined) {
        return;
      }
      currentKey = projectKey.trim();

      let verificationResult: { ok: boolean; message?: string } = { ok: false };
      await this.withProgressFn(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Verifying SonarQube connection...',
          cancellable: false,
        },
        async () => {
          const client = this.sonarClientFactory({
            serverUrl: currentUrl,
            token: currentToken,
          });
          verificationResult = await client.verifyConnection();
        },
      );

      if (!verificationResult.ok) {
        const action = await this.showErrorMessageFn(
          `SonarQube connection verification failed: ${verificationResult.message || 'Unknown error'}`,
          'Retry',
          'Cancel',
        );
        if (action === 'Retry') {
          continue;
        }
        return;
      }

      const created = await this.projectDetector.createProfile({
        name: currentName,
        serverUrl: currentUrl,
        projectKey: currentKey,
        token: currentToken,
      });
      if (suggested?.hasPlaintextCredentials) {
        this.showWarningMessageFn(
          'sonar-project.properties contains plaintext credentials. They were not imported; remove them to avoid leaking secrets.',
        );
      }
      this.showInformationMessageFn(`Connection profile "${created.name}" created and activated.`);
      if (!created.projectKey) {
        await this.promptProjectSelection();
      }
      await this.notifyConfigChanged();
      return;
    }
  }
}
