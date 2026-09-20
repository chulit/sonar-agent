import * as vscode from 'vscode';
import { ProjectDetector } from './ProjectDetector.js';
import { SonarClient, SonarDetailItem, SonarOverview } from './SonarClient.js';
import { FileNavigator } from './FileNavigator.js';
import { AgentDispatcher } from './AgentDispatcher.js';
import { Logger } from './Logger.js';

export class SonarOverviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'sonarAgent.overviewView';
  private _view?: vscode.WebviewView;
  private _webviewReady = false;
  private _lastStateMessage?: any;
  private readonly fileNavigator: FileNavigator;
  private readonly agentDispatcher: AgentDispatcher;
  private readonly diagnosticCollection: vscode.DiagnosticCollection;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectDetector: ProjectDetector,
    fileNavigator?: FileNavigator,
    agentDispatcher?: AgentDispatcher,
    diagnosticCollection?: vscode.DiagnosticCollection,
  ) {
    this.fileNavigator = fileNavigator ?? new FileNavigator();
    this.agentDispatcher =
      agentDispatcher ?? new AgentDispatcher({ fileNavigator: this.fileNavigator });
    this.diagnosticCollection =
      diagnosticCollection ?? vscode.languages.createDiagnosticCollection('SonarQube');
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    this._webviewReady = false;
    const isConfigured = this.projectDetector.isConfiguredSync?.() ?? false;
    Logger.info(
      `[Host] resolveWebviewView called. visible=${webviewView.visible}, isConfigured=${isConfigured}`,
    );

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, isConfigured);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        Logger.info(
          `[Host] onDidReceiveMessage: command=${message.command}${message.text ? ` text="${message.text}"` : ''}`,
        );
        switch (message.command) {
          case 'log': {
            Logger.info(`[Webview] ${message.text}`);
            break;
          }
          case 'ready':
          case 'init': {
            this._webviewReady = true;
            if (this._lastStateMessage && this._view) {
              await this._view.webview.postMessage(this._lastStateMessage);
            }
            await this._syncState();
            break;
          }
          case 'connect': {
            await this._handleConnect(message.serverUrl, message.token);
            break;
          }
          case 'disconnect': {
            await this._handleDisconnect();
            break;
          }
          case 'selectProject': {
            if (message.projectKey) {
              await this.projectDetector.setProjectKey(message.projectKey);
              await this._syncState();
            }
            break;
          }
          case 'openProjectPicker': {
            await this.promptProjectSelection();
            break;
          }
          case 'fetchDetails': {
            await this._handleFetchDetails(message.category);
            break;
          }
          case 'openFile': {
            await this.fileNavigator.openFileAtLine(message.filePath, message.line);
            break;
          }
          case 'sendToAgent': {
            await this._handleSendToAgent(message.item, message.targetAgentId);
            break;
          }
          case 'sendBatchToAgent': {
            await this._handleSendBatchToAgent(message.items, message.targetAgentId);
            break;
          }
          case 'setTargetAgent': {
            const config = vscode.workspace.getConfiguration('sonarAgent');
            await config.update('defaultAgent', message.agentId, true);
            break;
          }
          case 'refresh': {
            await this._syncState();
            break;
          }
        }
      } catch (err: any) {
        console.error('[SonarAgent] Webview message handling error:', err);
        this._view?.webview.postMessage({
          type: 'error',
          message: err?.message || 'Error processing request.',
        });
      }
    });

    // Proactively sync state when view is created or becomes visible
    this._syncState();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._syncState();
      }
    });
  }

  public async refresh(): Promise<void> {
    if (this._view) {
      await this._syncState();
    }
  }

  public async promptProjectSelection(): Promise<void> {
    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();

    if (!config.serverUrl || !token) {
      vscode.window.showWarningMessage('Please connect to SonarQube first.');
      return;
    }

    const client = new SonarClient({ serverUrl: config.serverUrl, token });
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

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a SonarQube project or enter key manually',
      matchOnDescription: true,
    });

    if (selected === manualOption) {
      const manualKey = await vscode.window.showInputBox({
        prompt: 'Enter the SonarQube Project Key',
        placeHolder: 'e.g. org.company:my-project',
        value: config.projectKey || '',
        validateInput: (val) => (!val.trim() ? 'Project Key cannot be empty' : null),
      });

      if (manualKey && manualKey.trim()) {
        const trimmed = manualKey.trim();
        await this.projectDetector.setProjectKey(trimmed);
        await this._syncState();
        vscode.window.showInformationMessage(`Active SonarQube project set to: ${trimmed}`);
      }
      return;
    }

    if (selected && selected.description) {
      await this.projectDetector.setProjectKey(selected.description);
      await this._syncState();
      vscode.window.showInformationMessage(`Active SonarQube project set to: ${selected.label}`);
    }
  }

  public async promptConfigureConnection(): Promise<void> {
    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    const isConnected = Boolean(config.serverUrl && token);

    interface ConfigQuickPickItem extends vscode.QuickPickItem {
      action: 'updateCredentials' | 'selectProject' | 'openSettings' | 'showLogs' | 'disconnect';
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

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Sonar Agent: Configure Connection & Settings',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!selected) {
      return;
    }

    switch (selected.action) {
      case 'updateCredentials':
        await this.promptUpdateCredentials(config.serverUrl);
        break;
      case 'selectProject':
        await this.promptProjectSelection();
        break;
      case 'openSettings':
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:chulit.sonar-agent',
        );
        break;
      case 'showLogs':
        Logger.show();
        break;
      case 'disconnect':
        await vscode.commands.executeCommand('sonarAgent.resetConnection');
        break;
    }
  }

  public async promptUpdateCredentials(initialUrl?: string, initialToken?: string): Promise<void> {
    let currentUrl =
      initialUrl || (await this.projectDetector.getConfig()).serverUrl || 'http://localhost:9000';
    let currentToken = initialToken || '';

    while (true) {
      const serverUrl = await vscode.window.showInputBox({
        title: 'SonarQube Connection (1/2)',
        prompt: 'Enter the SonarQube Server URL',
        placeHolder: 'http://localhost:9000 or https://sonar.example.com',
        value: currentUrl,
        ignoreFocusOut: true,
        validateInput: (value) => {
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
        },
      });

      if (serverUrl === undefined) {
        return;
      }

      currentUrl = serverUrl.trim();

      const token = await vscode.window.showInputBox({
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
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Verifying SonarQube connection...',
          cancellable: false,
        },
        async () => {
          const client = new SonarClient({ serverUrl: currentUrl, token: currentToken });
          verificationResult = await client.verifyConnection();
        },
      );

      if (!verificationResult.ok) {
        const action = await vscode.window.showErrorMessage(
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

      vscode.window.showInformationMessage('SonarQube connection successfully verified and saved!');

      const updatedConfig = await this.projectDetector.getConfig();
      if (!updatedConfig.projectKey) {
        await this.promptProjectSelection();
      }

      await this.refresh();
      return;
    }
  }

  private async _handleSendToAgent(item: SonarDetailItem, targetAgentId?: string): Promise<void> {
    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    const agentId =
      targetAgentId ||
      vscode.workspace.getConfiguration('sonarAgent').get<string>('defaultAgent', 'copilot');

    let client: SonarClient | undefined;
    if (config.serverUrl && token) {
      client = new SonarClient({ serverUrl: config.serverUrl, token });
    }

    const dispatcher = new AgentDispatcher({
      fileNavigator: this.fileNavigator,
      fetchRuleFn: client ? (ruleKey) => client!.getEnrichedRule(ruleKey) : undefined,
    });

    const prompt = await dispatcher.assemblePrompt(item);
    await dispatcher.dispatch(prompt, agentId, item);
  }

  private async _handleSendBatchToAgent(
    items: SonarDetailItem[],
    targetAgentId?: string,
  ): Promise<void> {
    if (!items || items.length === 0) return;

    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    const agentId =
      targetAgentId ||
      vscode.workspace.getConfiguration('sonarAgent').get<string>('defaultAgent', 'copilot');

    let client: SonarClient | undefined;
    if (config.serverUrl && token) {
      client = new SonarClient({ serverUrl: config.serverUrl, token });
    }

    const dispatcher = new AgentDispatcher({
      fileNavigator: this.fileNavigator,
      fetchRuleFn: client ? (ruleKey) => client!.getEnrichedRule(ruleKey) : undefined,
    });

    const prompt = await dispatcher.assembleBatchPrompt(items);
    await dispatcher.dispatch(prompt, agentId, items[0], items);
  }

  private async _handleFetchDetails(category: string): Promise<void> {
    if (!this._view) return;

    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    if (!config.serverUrl || !config.projectKey || !token) return;

    this._view.webview.postMessage({ type: 'loadingDetails', loading: true });

    try {
      const client = new SonarClient({ serverUrl: config.serverUrl, token });
      let items: SonarDetailItem[] = [];

      if (category === 'hotspots') {
        items = await client.getHotspots(config.projectKey);
      } else if (category === 'coverage') {
        items = await client.getCoverageFiles(config.projectKey);
      } else if (category === 'duplications') {
        items = await client.getDuplicationFiles(config.projectKey);
      } else if (
        category === 'reliability' ||
        category === 'security' ||
        category === 'maintainability' ||
        category === 'accepted'
      ) {
        items = await client.getIssues(config.projectKey, category);
      } else {
        items = await client.getIssues(config.projectKey);
      }

      this._view.webview.postMessage({
        type: 'details',
        category,
        items,
      });
      await this.syncDiagnostics(items);
    } catch (err: any) {
      this._view.webview.postMessage({
        type: 'detailsError',
        message: err.message || 'Failed to load issues.',
      });
    } finally {
      this._view.webview.postMessage({ type: 'loadingDetails', loading: false });
    }
  }

  public async syncDiagnostics(items: SonarDetailItem[]): Promise<void> {
    this.diagnosticCollection.clear();
    const map = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();

    for (const item of items) {
      if (!item.filePath) continue;
      const resolved = await this.fileNavigator.resolveFilePath(item.filePath);
      if (!resolved) continue;

      const uri = vscode.Uri.file(resolved);
      const line = item.line && item.line > 0 ? item.line - 1 : 0;
      const range = new vscode.Range(line, 0, line, 100);

      let severity = vscode.DiagnosticSeverity.Information;
      if (item.severity === 'BLOCKER' || item.severity === 'CRITICAL') {
        severity = vscode.DiagnosticSeverity.Error;
      } else if (item.severity === 'MAJOR') {
        severity = vscode.DiagnosticSeverity.Warning;
      }

      const diagnostic = new vscode.Diagnostic(range, item.message, severity);
      diagnostic.code = item.ruleKey;
      diagnostic.source = 'SonarQube';

      const entry = map.get(uri.toString()) || { uri, diagnostics: [] };
      entry.diagnostics.push(diagnostic);
      map.set(uri.toString(), entry);
    }

    for (const { uri, diagnostics } of map.values()) {
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  private async _syncState(): Promise<void> {
    if (!this._view) {
      return;
    }

    try {
      const config = await this.projectDetector.getConfig();
      const token = await this.projectDetector.getToken();
      const defaultAgent = vscode.workspace
        .getConfiguration('sonarAgent')
        .get<string>('defaultAgent', 'copilot');

      const availableAgents = this.agentDispatcher.getAvailableAgents();
      let effectiveDefaultAgent = defaultAgent;
      if (!availableAgents.some((a) => a.id === effectiveDefaultAgent)) {
        effectiveDefaultAgent = availableAgents[0]?.id || 'clipboard';
      }

      Logger.info(
        `[Host] _syncState: serverUrl=${config.serverUrl}, hasToken=${config.hasToken}, tokenPresent=${Boolean(token)}`,
      );

      if (config.serverUrl && config.hasToken && token) {
        const immediateState = {
          type: 'state',
          state: 'connected',
          serverUrl: config.serverUrl,
          projectKey: config.projectKey,
          detectedFromProperties: config.detectedFromProperties ?? false,
          hasPlaintextWarning: config.hasPlaintextCredentialsWarning ?? false,
          projects: [],
          defaultAgent: effectiveDefaultAgent,
          availableAgents,
        };
        this._lastStateMessage = immediateState;
        const deliveredImmediate = await this._view.webview.postMessage(immediateState);
        Logger.info(`[Host] Immediate postMessage(connected) delivered=${deliveredImmediate}`);

        await this._view.webview.postMessage({ type: 'loading', loading: true });

        const client = new SonarClient({ serverUrl: config.serverUrl, token });
        const effectiveProjectKey = config.projectKey;

        const [projectsResult, overviewResult] = await Promise.allSettled([
          client.fetchProjects(),
          effectiveProjectKey ? client.getOverview(effectiveProjectKey) : Promise.resolve(null),
        ]);

        const projects = projectsResult.status === 'fulfilled' ? projectsResult.value : [];
        if (projectsResult.status === 'rejected') {
          console.error('[SonarAgent] fetchProjects error:', projectsResult.reason);
        }

        let resolvedProjectKey = effectiveProjectKey;
        if (!resolvedProjectKey && projects.length > 0) {
          resolvedProjectKey = projects[0].key;
          await this.projectDetector.setProjectKey(resolvedProjectKey);
        }

        let overview: SonarOverview | null = null;
        let overviewError: string | undefined;

        if (resolvedProjectKey && resolvedProjectKey === effectiveProjectKey) {
          if (overviewResult.status === 'fulfilled') {
            overview = overviewResult.value;
            if (overview) {
              Logger.info(
                `Measures updated for [${resolvedProjectKey}]: ${overview.security.count} vulnerabilities, ${overview.reliability.count} bugs, ${overview.maintainability.count} smells, ${overview.coverage.percentage.toFixed(1)}% coverage.`,
              );
            }
          } else {
            overviewError = overviewResult.reason?.message || 'Failed to fetch project measures.';
            Logger.error(
              `Failed to fetch project measures for [${resolvedProjectKey}]`,
              overviewError,
            );
          }
        } else if (resolvedProjectKey) {
          try {
            overview = await client.getOverview(resolvedProjectKey);
            if (overview) {
              Logger.info(
                `Measures updated for [${resolvedProjectKey}]: ${overview.security.count} vulnerabilities, ${overview.reliability.count} bugs, ${overview.maintainability.count} smells, ${overview.coverage.percentage.toFixed(1)}% coverage.`,
              );
            }
          } catch (err: any) {
            overviewError = err.message || 'Failed to fetch project measures.';
            Logger.error(
              `Failed to fetch project measures for [${resolvedProjectKey}]`,
              overviewError,
            );
          }
        }

        const fullState = {
          type: 'state',
          state: 'connected',
          serverUrl: config.serverUrl,
          projectKey: resolvedProjectKey,
          detectedFromProperties: config.detectedFromProperties ?? false,
          hasPlaintextWarning: config.hasPlaintextCredentialsWarning ?? false,
          projects,
          overview,
          overviewError,
          defaultAgent: effectiveDefaultAgent,
          availableAgents,
        };
        this._lastStateMessage = fullState;
        const deliveredFull = await this._view.webview.postMessage(fullState);
        Logger.info(`[Host] Full postMessage(connected) delivered=${deliveredFull}`);

        await this._view.webview.postMessage({ type: 'loading', loading: false });

        if (!this._webviewReady && this._view) {
          setTimeout(async () => {
            if (!this._webviewReady && this._view && this._lastStateMessage) {
              await this._view.webview.postMessage(this._lastStateMessage);
            }
          }, 350);
        }
      } else {
        const onboardingState = {
          type: 'state',
          state: 'onboarding',
          serverUrl: config.serverUrl || 'http://localhost:9000',
          defaultAgent: effectiveDefaultAgent,
          availableAgents,
        };
        this._lastStateMessage = onboardingState;
        const deliveredOnboarding = await this._view.webview.postMessage(onboardingState);
        Logger.info(`[Host] postMessage(onboarding) delivered=${deliveredOnboarding}`);
      }
    } catch (err: any) {
      console.error('[SonarAgent] _syncState error:', err);
      Logger.error('Failed to synchronize Sonar Agent state', err);
      this._view?.webview.postMessage({
        type: 'error',
        message: err.message || 'Failed to synchronize Sonar Agent state.',
      });
      this._view?.webview.postMessage({ type: 'loading', loading: false });
    }
  }

  private async _handleConnect(serverUrl: string, token: string): Promise<void> {
    const trimmedToken = (token || '').trim();
    let normalizedUrl = (serverUrl || '').trim();

    if (!normalizedUrl || !trimmedToken) {
      this._view?.webview.postMessage({
        type: 'error',
        message: 'Server URL and User Token are required.',
      });
      return;
    }

    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'http://' + normalizedUrl;
    }
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');

    this._view?.webview.postMessage({ type: 'connecting' });
    Logger.info('Verifying SonarQube credentials...');

    try {
      const client = new SonarClient({ serverUrl: normalizedUrl, token: trimmedToken });
      const result = await client.verifyConnection();

      if (!result.ok) {
        Logger.warn(`Connection verification failed: ${result.message || 'Unknown error'}`);
        this._view?.webview.postMessage({
          type: 'error',
          message: result.message || 'Connection verification failed.',
        });
        return;
      }

      await this.projectDetector.setServerUrl(normalizedUrl);
      await this.projectDetector.setToken(trimmedToken);

      Logger.info('SonarQube connection verified and saved.');
      vscode.window.showInformationMessage('SonarQube connection successfully verified!');

      await this._syncState();
    } catch (err: any) {
      console.error('[SonarAgent] _handleConnect error:', err);
      Logger.error('Unexpected connection error occurred', err);
      this._view?.webview.postMessage({
        type: 'error',
        message: err?.message || 'Unexpected connection error occurred.',
      });
    }
  }

  private async _handleDisconnect(): Promise<void> {
    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    const isConnected = Boolean(config.serverUrl && token);

    if (!isConnected) {
      this._view?.webview.postMessage({
        type: 'disconnected',
        message: 'Connection credentials cleared.',
      });
      vscode.window.showInformationMessage('Sonar Agent connection inputs cleared.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to disconnect and remove stored SonarQube credentials?',
      { modal: true },
      'Disconnect',
    );

    if (confirm === 'Disconnect') {
      await this.projectDetector.deleteToken();
      Logger.info('SonarQube credentials removed and disconnected.');
      this._view?.webview.postMessage({
        type: 'disconnected',
        message: 'Disconnected from SonarQube. Credentials removed.',
      });
      vscode.window.showInformationMessage('SonarQube credentials have been removed.');
      await this._syncState();
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, isConfigured: boolean = false): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource} https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sonar Agent</title>
  <style>
    :root {
      --sonar-blue: #4b9fd5;
      --sonar-green: #00aa5e;
      --sonar-lime: #81b300;
      --sonar-yellow: #eabe06;
      --sonar-orange: #ed7d20;
      --sonar-red: #d4333f;
      --sonar-border: var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      padding: 10px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background-color: var(--vscode-sideBar-background);
      overflow-x: hidden;
    }

    .container {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .top-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--sonar-border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .brand-icon {
      width: 18px;
      height: 18px;
      color: var(--sonar-blue);
    }

    .brand h2 {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    .icon-btn {
      background: none;
      border: none;
      color: var(--vscode-icon-foreground);
      cursor: pointer;
      padding: 3px 5px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    /* Card styling */
    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-radius: 6px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    label {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
    }

    input[type="text"], input[type="password"], select {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }

    input[type="text"]:focus, input[type="password"]:focus, select:focus {
      border-color: var(--vscode-focusBorder);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .btn-secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .btn-sm {
      padding: 3px 8px;
      font-size: 11px;
    }

    .btn-agent {
      background: #007acc;
      color: #ffffff;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .btn-agent:hover {
      background: #0062a3;
    }

    .alert {
      padding: 8px 10px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1.4;
      display: none;
    }

    .alert.error {
      display: block;
      background: rgba(212, 51, 63, 0.15);
      border: 1px solid var(--sonar-red);
      color: var(--vscode-errorForeground, #ff6b6b);
    }

    .alert.warning {
      display: block;
      background: rgba(234, 190, 6, 0.15);
      border: 1px solid var(--sonar-yellow);
      color: var(--sonar-yellow);
    }

    .alert.info {
      display: block;
      background: rgba(75, 159, 213, 0.15);
      border: 1px solid var(--sonar-blue);
      color: var(--vscode-foreground);
    }

    /* Searchable Project Selector */
    .project-selector-wrapper {
      position: relative;
      width: 100%;
    }

    .search-input-group {
      display: flex;
      align-items: center;
      position: relative;
    }

    #project-search-input {
      width: 100%;
      padding-right: 26px;
      cursor: pointer;
    }

    #project-search-toggle-btn {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      padding: 2px 4px;
      font-size: 11px;
    }

    .project-dropdown-popup {
      position: absolute;
      top: calc(100% + 2px);
      left: 0;
      right: 0;
      max-height: 220px;
      overflow-y: auto;
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border));
      border-radius: 4px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      z-index: 100;
    }

    .project-items-container {
      display: flex;
      flex-direction: column;
    }

    .project-item {
      padding: 6px 10px;
      cursor: pointer;
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15));
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .project-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .project-item.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .project-item-name {
      font-size: 12px;
      font-weight: 600;
    }

    .project-item-key {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .project-item.active .project-item-key {
      color: inherit;
      opacity: 0.85;
    }

    .project-item.manual-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--vscode-textLink-foreground, #3794ff);
      border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15));
      border-bottom: none;
      padding: 8px 10px;
    }

    /* Container Queries for Metric Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }

    @container (min-width: 320px) {
      .metrics-grid {
        grid-template-columns: 1fr 1fr;
      }

      .metric-card.metric-card-wide {
        grid-column: 1 / -1;
      }
    }

    .metric-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-radius: 6px;
      padding: 10px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      min-height: 66px;
      box-sizing: border-box;
      cursor: pointer;
      transition: border-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
      user-select: none;
    }

    .metric-card:hover {
      border-color: var(--sonar-blue);
      transform: translateY(-1px);
    }

    .metric-card.active {
      border-color: var(--sonar-blue);
      box-shadow: 0 0 0 1.5px var(--sonar-blue);
    }

    .metric-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    .metric-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .metric-value-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .metric-big-num {
      font-size: 19px;
      font-weight: 700;
      line-height: 1.1;
      color: var(--vscode-foreground);
    }

    .metric-sublabel {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }

    .metric-helper {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Sonar Rating Badges */
    .rating-badge {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 12px;
      flex-shrink: 0;
    }

    .rating-A { background: rgba(0, 170, 94, 0.15); color: var(--sonar-green); }
    .rating-B { background: rgba(129, 179, 0, 0.15); color: var(--sonar-lime); }
    .rating-C { background: rgba(234, 190, 6, 0.15); color: var(--sonar-yellow); }
    .rating-D { background: rgba(237, 125, 32, 0.15); color: var(--sonar-orange); }
    .rating-E { background: rgba(212, 51, 63, 0.15); color: var(--sonar-red); }

    .circle-icon {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2.5px solid var(--sonar-green);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-sizing: border-box;
    }

    .dot-inner {
      width: 6px;
      height: 6px;
      background: var(--sonar-green);
      border-radius: 50%;
    }

    .clock-badge {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(128, 128, 128, 0.15);
      color: var(--vscode-descriptionForeground);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
    }

    .source-badge {
      font-size: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 1px 5px;
      border-radius: 3px;
      font-weight: normal;
    }

    /* Issues List Drilldown - Image 2 Style */
    .issues-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 4px;
      position: relative;
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-radius: 4px;
    }

    .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px 12px;
    }

    .filter-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
    }

    .filter-item label {
      font-size: 11px;
      font-weight: 500;
      color: var(--vscode-descriptionForeground);
      text-transform: none;
      white-space: nowrap;
    }

    .filter-item select {
      padding: 2px 4px;
      font-size: 11px;
      height: 22px;
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, transparent));
      border-radius: 3px;
      cursor: pointer;
      max-width: 120px;
    }

    .filter-test-row {
      display: flex;
      align-items: center;
      padding-top: 4px;
      border-top: 1px solid var(--sonar-border);
    }

    .filter-checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--vscode-foreground);
      cursor: pointer;
      text-transform: none;
      font-weight: normal;
      user-select: none;
    }

    .filter-checkbox-label input[type="checkbox"] {
      width: 13px;
      height: 13px;
      cursor: pointer;
      accent-color: var(--vscode-button-background, var(--sonar-blue));
    }

    .issue-card {
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
      border-radius: 5px;
      background: var(--vscode-editor-background);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: border-color 0.15s ease;
    }

    .issue-card:hover {
      border-color: var(--sonar-blue);
    }

    .issue-path {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      word-break: break-all;
      cursor: pointer;
    }

    .issue-path:hover {
      color: var(--sonar-blue);
      text-decoration: underline;
    }

    .issue-body {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .issue-checkbox {
      margin-top: 2px;
      cursor: pointer;
      width: 14px;
      height: 14px;
    }

    .issue-message {
      font-size: 12px;
      font-weight: 500;
      color: var(--vscode-foreground);
      line-height: 1.35;
      flex: 1;
    }

    .issue-badges {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
    }

    .badge-tag {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .badge-severity-critical, .badge-severity-blocker {
      background: rgba(212, 51, 63, 0.18);
      color: var(--sonar-red);
      font-weight: 600;
    }

    .badge-severity-major {
      background: rgba(237, 125, 32, 0.18);
      color: var(--sonar-orange);
      font-weight: 600;
    }

    .badge-severity-minor {
      background: rgba(234, 190, 6, 0.18);
      color: var(--sonar-yellow);
      font-weight: 600;
    }

    .issue-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--sonar-border);
      padding-top: 6px;
      margin-top: 4px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .issue-footer-meta {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .issue-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Batch Actions Floating Bar */
    .batch-bar {
      position: sticky;
      bottom: 0;
      background: var(--vscode-editor-background);
      border: 1px solid var(--sonar-blue);
      border-radius: 5px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      z-index: 10;
    }

    .loading-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px 0;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="top-header">
      <div class="brand">
        <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
          <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6z"/>
          <circle cx="12" cy="12" r="2"/>
          <line x1="12" y1="12" x2="19" y2="5"/>
        </svg>
        <h2>Sonar Agent</h2>
      </div>
      <div class="header-actions">
        <button id="header-refresh-btn" class="icon-btn" title="Refresh measures">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M13.65 2.35A7.958 7.958 0 0 0 8 0a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.76-4.24l-2.24 2.24h6V0l-2.35 2.35z"/></svg>
        </button>
        <button id="header-disconnect-btn" class="icon-btn ${isConfigured ? '' : 'hidden'}" title="Disconnect server">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1v7h1V1h-1z"/><path d="M3.05 3.05a7 7 0 1 0 9.9 0l-.7.7a6 6 0 1 1-8.5 0l-.7-.7z"/></svg>
        </button>
      </div>
    </div>

    <!-- Onboarding Form -->
    <div id="onboarding-view" class="card ${isConfigured ? 'hidden' : ''}">
      <p style="font-size: 12px; line-height: 1.4; color: var(--vscode-descriptionForeground);">
        Connect to your SonarQube server to monitor Overall Code quality and delegate fixes to AI Agents.
      </p>

      <div id="alert-box" class="alert"></div>

      <div class="form-group">
        <label for="server-url">SonarQube Server URL</label>
        <input type="text" id="server-url" placeholder="http://localhost:9000" spellcheck="false" autocomplete="off" />
      </div>

      <div class="form-group">
        <label for="user-token">User Token</label>
        <input type="password" id="user-token" placeholder="Enter SonarQube User Token" spellcheck="false" autocomplete="off" />
      </div>

      <button id="connect-btn" class="btn">Connect & Verify</button>
    </div>

    <!-- Connected Dashboard View -->
    <div id="connected-view" class="${isConfigured ? '' : 'hidden'}" style="display: flex; flex-direction: column; gap: 10px;">
      <!-- Project & Target Agent Selector Bar -->
      <div class="card" style="padding: 8px 10px; gap: 8px;">
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <label style="font-size: 10px;">PROJECT BINDING</label>
              <button id="manual-project-btn" class="icon-btn" title="Enter Project Key manually" style="padding: 2px 4px; height: 18px;">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg>
              </button>
            </div>
            <span id="detected-badge" class="source-badge hidden">sonar-project.properties</span>
          </div>
          <div class="project-selector-wrapper">
            <div class="search-input-group">
              <input id="project-search-input" type="text" placeholder="Type to search or click to pick project..." autocomplete="off" />
              <button id="project-search-toggle-btn" type="button" title="Toggle project list">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/></svg>
              </button>
            </div>
            <div id="project-dropdown-popup" class="project-dropdown-popup hidden">
              <div id="project-items-container" class="project-items-container"></div>
              <div id="manual-project-item" class="project-item manual-item">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink: 0;"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg>
                <span>Enter Project Key manually...</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label style="font-size: 10px;">TARGET AGENT</label>
          <select id="target-agent-dropdown" style="margin-top: 3px;">
            <option value="clipboard">Clipboard Only</option>
          </select>
        </div>
      </div>

      <div id="plaintext-warning" class="alert warning hidden" style="display: flex; align-items: center; gap: 6px;">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink:0;"><path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z"/><path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z"/></svg>
        <span>Warning: Plaintext credentials found in sonar-project.properties. Please remove them to avoid leaking secrets.</span>
      </div>

      <div class="section-title" style="margin-top: 4px; margin-bottom: 2px;">
        <span>Overall Code Measures</span>
      </div>

      <!-- Loading State -->
      <div id="loading-indicator" class="loading-overlay ${isConfigured ? '' : 'hidden'}">
        <div class="spinner"></div>
        <span>Fetching Overall Code measures...</span>
      </div>

      <div id="overview-error" class="alert error hidden"></div>

      <!-- Metric Cards Grid (Container Query Controlled) -->
      <div id="metrics-grid" class="metrics-grid">
        <!-- Security -->
        <div class="metric-card" data-category="security">
          <div class="metric-info">
            <span class="metric-title">Security</span>
            <div class="metric-value-row">
              <span id="metric-security-count" class="metric-big-num">-</span>
              <span class="metric-sublabel">Open issues</span>
            </div>
          </div>
          <div id="badge-security" class="rating-badge rating-A">A</div>
        </div>

        <!-- Reliability -->
        <div class="metric-card" data-category="reliability">
          <div class="metric-info">
            <span class="metric-title">Reliability</span>
            <div class="metric-value-row">
              <span id="metric-reliability-count" class="metric-big-num">-</span>
              <span class="metric-sublabel">Open issues</span>
            </div>
          </div>
          <div id="badge-reliability" class="rating-badge rating-C">C</div>
        </div>

        <!-- Maintainability -->
        <div class="metric-card" data-category="maintainability">
          <div class="metric-info">
            <span class="metric-title">Maintainability</span>
            <div class="metric-value-row">
              <span id="metric-maintainability-count" class="metric-big-num">-</span>
              <span class="metric-sublabel">Open issues</span>
            </div>
          </div>
          <div id="badge-maintainability" class="rating-badge rating-A">A</div>
        </div>

        <!-- Security Hotspots -->
        <div class="metric-card" data-category="hotspots">
          <div class="metric-info">
            <span class="metric-title">Security Hotspots</span>
            <div class="metric-value-row">
              <span id="metric-hotspots-count" class="metric-big-num">-</span>
              <span class="metric-sublabel">To review</span>
            </div>
          </div>
          <div id="badge-hotspots" class="rating-badge rating-A">A</div>
        </div>

        <!-- Coverage -->
        <div class="metric-card" data-category="coverage">
          <div class="metric-info">
            <span class="metric-title">Coverage</span>
            <div class="metric-value-row">
              <span id="metric-coverage-percent" class="metric-big-num">-%</span>
            </div>
            <span id="metric-coverage-lines" class="metric-helper">On - lines to cover.</span>
          </div>
          <div class="circle-icon">
            <div class="dot-inner"></div>
          </div>
        </div>

        <!-- Duplications -->
        <div class="metric-card" data-category="duplications">
          <div class="metric-info">
            <span class="metric-title">Duplications</span>
            <div class="metric-value-row">
              <span id="metric-duplications-percent" class="metric-big-num">-%</span>
            </div>
            <span id="metric-duplications-lines" class="metric-helper">On - lines.</span>
          </div>
          <div class="circle-icon" style="border-color: var(--sonar-green);">
            <div class="dot-inner" style="background: var(--sonar-green);"></div>
          </div>
        </div>

        <!-- Accepted Issues (Wide Row) -->
        <div class="metric-card metric-card-wide" data-category="accepted">
          <div class="metric-info">
            <span class="metric-title">Accepted issues</span>
            <div class="metric-value-row">
              <span id="metric-accepted-count" class="metric-big-num">0</span>
              <span class="metric-sublabel">Valid issues not fixed</span>
            </div>
          </div>
          <div class="clock-badge">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>
          </div>
        </div>
      </div>

      <!-- Issues Drilldown Section -->
      <div id="issues-section" class="issues-section hidden">
        <div class="section-title">
          <span id="issues-list-title">Issues</span>
          <span id="issues-list-count" class="source-badge">0 items</span>
        </div>

        <!-- Filter Bar -->
        <div id="filter-bar" class="filter-bar">
          <div class="filter-row">
            <div class="filter-item">
              <label for="filter-severity">Severity</label>
              <select id="filter-severity">
                <option value="ALL">All</option>
                <option value="BLOCKER">Blocker</option>
                <option value="CRITICAL">Critical</option>
                <option value="MAJOR">Major</option>
                <option value="MINOR">Minor</option>
                <option value="INFO">Info</option>
              </select>
            </div>
            <div class="filter-item">
              <label for="filter-author">Author</label>
              <select id="filter-author">
                <option value="ALL">All</option>
              </select>
            </div>
            <div class="filter-item">
              <label for="filter-file">File</label>
              <select id="filter-file">
                <option value="ALL">All</option>
              </select>
            </div>
            <div class="filter-item">
              <label for="filter-rule">Rule</label>
              <select id="filter-rule">
                <option value="ALL">All</option>
              </select>
            </div>
          </div>
          <div class="filter-test-row">
            <label class="filter-checkbox-label">
              <input type="checkbox" id="filter-include-tests" checked />
              <span>Include Test Files</span>
            </label>
          </div>
        </div>

        <div id="issues-loading" class="loading-overlay hidden">
          <div class="spinner"></div>
          <span>Loading issues list...</span>
        </div>

        <div id="issues-container" style="display: flex; flex-direction: column; gap: 8px;"></div>

        <!-- Batch Actions Bar -->
        <div id="batch-action-bar" class="batch-bar hidden">
          <span id="selected-count-label" style="font-weight: 600; font-size: 11px;">0 selected</span>
          <div style="display: flex; gap: 6px;">
            <button id="send-batch-btn" class="btn btn-agent btn-sm">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>
              Send to Agent
            </button>
            <button id="deselect-all-btn" class="btn btn-secondary btn-sm">Clear</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    let vscode;
    try {
      vscode = acquireVsCodeApi();
    } catch (e) {
      console.warn("[SonarAgent Webview] acquireVsCodeApi error:", e);
    }
    try {
      vscode?.postMessage({ command: "ready" });
      vscode?.postMessage({ command: "log", text: "Webview script started execution" });
    } catch (e) {}

    const onboardingView = document.getElementById("onboarding-view");
    const connectedView = document.getElementById("connected-view");
    const alertBox = document.getElementById("alert-box");
    const overviewError = document.getElementById("overview-error");

    window.addEventListener("error", (e) => {
      console.error("[SonarAgent Webview Error]", e);
      try {
        vscode.postMessage({ command: "log", text: "Webview error event: " + (e.message || String(e)) });
      } catch (_) {}
      if (alertBox) {
        alertBox.textContent = "Webview script error: " + (e.message || String(e));
        alertBox.className = "alert error";
      }
    });

    window.addEventListener("unhandledrejection", (e) => {
      console.error("[SonarAgent Webview Unhandled Rejection]", e);
      try {
        vscode.postMessage({ command: "log", text: "Webview unhandledrejection event: " + (e.reason?.message || String(e.reason)) });
      } catch (_) {}
      if (alertBox) {
        alertBox.textContent = "Webview promise error: " + (e.reason?.message || String(e.reason));
        alertBox.className = "alert error";
      }
    });

    const plaintextWarning = document.getElementById("plaintext-warning");
    const loadingIndicator = document.getElementById("loading-indicator");
    const metricsGrid = document.getElementById("metrics-grid");

    const issuesSection = document.getElementById("issues-section");
    const issuesListTitle = document.getElementById("issues-list-title");
    const issuesListCount = document.getElementById("issues-list-count");
    const issuesLoading = document.getElementById("issues-loading");
    const issuesContainer = document.getElementById("issues-container");
    const batchActionBar = document.getElementById("batch-action-bar");
    const selectedCountLabel = document.getElementById("selected-count-label");
    const sendBatchBtn = document.getElementById("send-batch-btn");
    const deselectAllBtn = document.getElementById("deselect-all-btn");

    const filterSeverity = document.getElementById("filter-severity");
    const filterAuthor = document.getElementById("filter-author");
    const filterFile = document.getElementById("filter-file");
    const filterRule = document.getElementById("filter-rule");
    const filterIncludeTests = document.getElementById("filter-include-tests");

    const serverUrlInput = document.getElementById("server-url");
    const userTokenInput = document.getElementById("user-token");
    const connectBtn = document.getElementById("connect-btn");
    const headerRefreshBtn = document.getElementById("header-refresh-btn");
    const headerDisconnectBtn = document.getElementById("header-disconnect-btn");
    const projectSearchInput = document.getElementById("project-search-input");
    const projectSearchToggleBtn = document.getElementById("project-search-toggle-btn");
    const projectDropdownPopup = document.getElementById("project-dropdown-popup");
    const projectItemsContainer = document.getElementById("project-items-container");
    const manualProjectItem = document.getElementById("manual-project-item");
    const targetAgentDropdown = document.getElementById("target-agent-dropdown");
    const detectedBadge = document.getElementById("detected-badge");

    let cachedProjects = [];
    let currentSelectedProjectKey = "";

    function renderProjectList(filterText) {
      projectItemsContainer.innerHTML = "";
      const q = (filterText || "").trim().toLowerCase();

      const filtered = cachedProjects.filter((p) => {
        if (!q) return true;
        const nameMatch = (p.name || "").toLowerCase().includes(q);
        const keyMatch = (p.key || "").toLowerCase().includes(q);
        return nameMatch || keyMatch;
      });

      if (filtered.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.style.padding = "8px 10px";
        emptyDiv.style.fontSize = "11px";
        emptyDiv.style.color = "var(--vscode-descriptionForeground)";
        emptyDiv.textContent = cachedProjects.length === 0 ? "No projects found" : "No matching projects";
        projectItemsContainer.appendChild(emptyDiv);
      } else {
        filtered.forEach((p) => {
          const itemDiv = document.createElement("div");
          itemDiv.className = "project-item" + (p.key === currentSelectedProjectKey ? " active" : "");

          const nameRow = document.createElement("div");
          nameRow.style.display = "flex";
          nameRow.style.justifyContent = "space-between";
          nameRow.style.alignItems = "center";

          const nameSpan = document.createElement("span");
          nameSpan.className = "project-item-name";
          nameSpan.textContent = p.name;
          nameRow.appendChild(nameSpan);

          if (p.key === currentSelectedProjectKey) {
            const check = document.createElement("span");
            check.style.display = "inline-flex";
            check.style.alignItems = "center";
            check.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>';
            nameRow.appendChild(check);
          }

          const keySpan = document.createElement("span");
          keySpan.className = "project-item-key";
          keySpan.textContent = p.key;

          itemDiv.appendChild(nameRow);
          itemDiv.appendChild(keySpan);

          itemDiv.addEventListener("click", () => {
            currentSelectedProjectKey = p.key;
            projectSearchInput.value = p.name + " (" + p.key + ")";
            projectDropdownPopup.classList.add("hidden");
            vscode.postMessage({ command: "selectProject", projectKey: p.key });
          });

          projectItemsContainer.appendChild(itemDiv);
        });
      }
    }

    projectSearchInput.addEventListener("focus", () => {
      projectDropdownPopup.classList.remove("hidden");
      renderProjectList(projectSearchInput.value);
    });

    projectSearchInput.addEventListener("input", () => {
      projectDropdownPopup.classList.remove("hidden");
      renderProjectList(projectSearchInput.value);
    });

    projectSearchToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (projectDropdownPopup.classList.contains("hidden")) {
        projectDropdownPopup.classList.remove("hidden");
        renderProjectList("");
      } else {
        projectDropdownPopup.classList.add("hidden");
      }
    });

    if (manualProjectItem) {
      manualProjectItem.addEventListener("click", () => {
        projectDropdownPopup.classList.add("hidden");
        vscode.postMessage({ command: "openProjectPicker" });
      });
    }

    document.addEventListener("click", (e) => {
      const wrapper = document.querySelector(".project-selector-wrapper");
      if (wrapper && !wrapper.contains(e.target)) {
        projectDropdownPopup.classList.add("hidden");
      }
    });

    const securityCount = document.getElementById("metric-security-count");
    const badgeSecurity = document.getElementById("badge-security");
    const reliabilityCount = document.getElementById("metric-reliability-count");
    const badgeReliability = document.getElementById("badge-reliability");
    const maintainabilityCount = document.getElementById("metric-maintainability-count");
    const badgeMaintainability = document.getElementById("badge-maintainability");
    const coveragePercent = document.getElementById("metric-coverage-percent");
    const coverageLines = document.getElementById("metric-coverage-lines");
    const duplicationsPercent = document.getElementById("metric-duplications-percent");
    const duplicationsLines = document.getElementById("metric-duplications-lines");
    const hotspotsCount = document.getElementById("metric-hotspots-count");
    const badgeHotspots = document.getElementById("badge-hotspots");
    const acceptedCount = document.getElementById("metric-accepted-count");

    let activeCategory = null;
    let rawCategoryItems = [];
    let currentItems = [];
    const selectedItemIds = new Set();

    function showAlert(msg, type = "error") {
      alertBox.textContent = msg;
      alertBox.className = "alert " + type;
    }

    function clearAlert() {
      alertBox.textContent = "";
      alertBox.className = "alert";
      overviewError.textContent = "";
      overviewError.className = "alert";
    }

    function formatNumber(num) {
      if (num >= 1000) {
        return (num / 1000).toFixed(0) + "k";
      }
      return String(num);
    }

    function updateRatingBadge(el, rating) {
      el.className = "rating-badge rating-" + rating;
      el.textContent = rating;
    }

    function updateBatchBar() {
      const count = selectedItemIds.size;
      if (count > 0) {
        batchActionBar.classList.remove("hidden");
        selectedCountLabel.textContent = count + " issue" + (count > 1 ? "s" : "") + " selected";
        sendBatchBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>Send ' + count + ' to Agent';
      } else {
        batchActionBar.classList.add("hidden");
      }
    }

    function renderOverview(overview) {
      if (!overview) return;

      securityCount.textContent = overview.security.count;
      updateRatingBadge(badgeSecurity, overview.security.rating);

      reliabilityCount.textContent = overview.reliability.count;
      updateRatingBadge(badgeReliability, overview.reliability.rating);

      maintainabilityCount.textContent = overview.maintainability.count;
      updateRatingBadge(badgeMaintainability, overview.maintainability.rating);

      coveragePercent.textContent = overview.coverage.percentage.toFixed(1) + "%";
      coverageLines.textContent = "On " + formatNumber(overview.coverage.linesToCover) + " lines to cover.";

      duplicationsPercent.textContent = overview.duplications.percentage.toFixed(1) + "%";
      duplicationsLines.textContent = "On " + formatNumber(overview.duplications.duplicatedLines) + " lines.";

      hotspotsCount.textContent = overview.securityHotspots.count;
      updateRatingBadge(badgeHotspots, overview.securityHotspots.rating);

      if (acceptedCount && overview.acceptedIssues) {
        acceptedCount.textContent = formatNumber(overview.acceptedIssues.count);
      }
    }

    function isTestFile(filePath) {
      if (!filePath) return false;
      const normalized = filePath.split(String.fromCharCode(92)).join("/");
      const segments = normalized.toLowerCase().split("/");
      const rawFilename = normalized.split("/").pop() || "";
      const lowerFilename = rawFilename.toLowerCase();

      if (segments.some((seg) => seg === "test" || seg === "tests" || seg === "__tests__" || seg === "__test__" || seg === "testing" || seg === "spec" || seg === "specs")) {
        return true;
      }
      if (lowerFilename.includes(".test.") || lowerFilename.includes(".spec.") || lowerFilename.includes("_test.") || lowerFilename.includes("-test.") || lowerFilename.includes("_spec.") || lowerFilename.includes("-spec.")) {
        return true;
      }
      if (/^(?:test|tests|spec|specs)[.][a-z0-9]+$/i.test(rawFilename)) {
        return true;
      }
      if (/[._-](?:test|tests|spec|specs)[.][a-z0-9]+$/i.test(rawFilename)) {
        return true;
      }
      if (/[a-zA-Z0-9](?:Test|Tests|Spec|Specs)[.][a-z0-9]+$/.test(rawFilename)) {
        return true;
      }
      return false;
    }

    function populateFilterDropdowns(items) {
      const prevAuthor = filterAuthor.value;
      const prevFile = filterFile.value;
      const prevRule = filterRule.value;

      // Populate Authors
      const authors = Array.from(new Set(items.map((i) => i.author).filter(Boolean))).sort();
      filterAuthor.innerHTML = '<option value="ALL">All</option>';
      authors.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = a;
        filterAuthor.appendChild(opt);
      });
      if (authors.includes(prevAuthor)) {
        filterAuthor.value = prevAuthor;
      }

      // Populate Files
      const files = Array.from(new Set(items.map((i) => i.filePath).filter(Boolean))).sort();
      filterFile.innerHTML = '<option value="ALL">All</option>';
      files.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f;
        const shortName = f.split("/").pop() || f;
        opt.textContent = shortName;
        opt.title = f;
        filterFile.appendChild(opt);
      });
      if (files.includes(prevFile)) {
        filterFile.value = prevFile;
      }

      // Populate Rules
      const rules = Array.from(new Set(items.map((i) => i.ruleKey).filter(Boolean))).sort();
      filterRule.innerHTML = '<option value="ALL">All</option>';
      rules.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = r;
        filterRule.appendChild(opt);
      });
      if (rules.includes(prevRule)) {
        filterRule.value = prevRule;
      }
    }

    function getFilteredItems() {
      const sev = filterSeverity.value;
      const author = filterAuthor.value;
      const file = filterFile.value;
      const rule = filterRule.value;
      const includeTests = filterIncludeTests.checked;

      return rawCategoryItems.filter((item) => {
        if (sev !== "ALL" && item.severity !== sev) {
          return false;
        }
        if (author !== "ALL" && (item.author || "") !== author) {
          return false;
        }
        if (file !== "ALL" && item.filePath !== file) {
          return false;
        }
        if (rule !== "ALL" && item.ruleKey !== rule) {
          return false;
        }
        if (!includeTests && isTestFile(item.filePath)) {
          return false;
        }
        return true;
      });
    }

    function renderIssueCard(item) {
      const card = document.createElement("div");
      card.className = "issue-card";

      const pathDiv = document.createElement("div");
      pathDiv.className = "issue-path";
      pathDiv.textContent = item.filePath;
      pathDiv.title = "Click to jump to file";
      pathDiv.addEventListener("click", () => {
        vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
      });

      const bodyDiv = document.createElement("div");
      bodyDiv.className = "issue-body";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "issue-checkbox";
      checkbox.checked = selectedItemIds.has(item.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedItemIds.add(item.id);
        } else {
          selectedItemIds.delete(item.id);
        }
        updateBatchBar();
      });

      const msgDiv = document.createElement("div");
      msgDiv.className = "issue-message";
      msgDiv.textContent = item.message;

      bodyDiv.appendChild(checkbox);
      bodyDiv.appendChild(msgDiv);

      const badgesDiv = document.createElement("div");
      badgesDiv.className = "issue-badges";

      const severityBadge = document.createElement("span");
      severityBadge.className = "badge-tag badge-severity-" + item.severity.toLowerCase();
      severityBadge.textContent = item.type + " (" + item.severity + ")";
      badgesDiv.appendChild(severityBadge);

      if (item.author) {
        const authorBadge = document.createElement("span");
        authorBadge.className = "badge-tag";
        authorBadge.textContent = "@" + item.author;
        badgesDiv.appendChild(authorBadge);
      }

      (item.tags || []).forEach((tag) => {
        const tagBadge = document.createElement("span");
        tagBadge.className = "badge-tag";
        tagBadge.textContent = tag;
        badgesDiv.appendChild(tagBadge);
      });

      const footerDiv = document.createElement("div");
      footerDiv.className = "issue-footer";

      const footerMeta = document.createElement("div");
      footerMeta.className = "issue-footer-meta";
      footerMeta.textContent = (item.line ? "L" + item.line : "File level") + (item.effort ? " • " + item.effort : "");

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "issue-actions";

      const jumpBtn = document.createElement("button");
      jumpBtn.className = "btn btn-secondary btn-sm";
      jumpBtn.style.gap = "4px";
      jumpBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg><span>Jump</span>';
      jumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
      });

      const agentBtn = document.createElement("button");
      agentBtn.className = "btn btn-agent btn-sm";
      let agentBtnLabel = "Send to Agent";
      if (item.type === "COVERAGE") {
        agentBtnLabel = "Generate Tests";
      } else if (item.type === "DUPLICATION") {
        agentBtnLabel = "Refactor";
      } else if (item.type === "HOTSPOT") {
        agentBtnLabel = "Review";
      }
      agentBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>' + agentBtnLabel;
      agentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetAgentId = targetAgentDropdown.value;
        vscode.postMessage({ command: "sendToAgent", item, targetAgentId });
      });

      actionsDiv.appendChild(jumpBtn);
      actionsDiv.appendChild(agentBtn);

      footerDiv.appendChild(footerMeta);
      footerDiv.appendChild(actionsDiv);

      card.appendChild(pathDiv);
      card.appendChild(bodyDiv);
      card.appendChild(badgesDiv);
      card.appendChild(footerDiv);

      issuesContainer.appendChild(card);
    }

    function applyFiltersAndRender() {
      const filtered = getFilteredItems();
      currentItems = filtered;

      // Clean up selected items that are no longer visible in the filtered list
      const visibleIdSet = new Set(filtered.map((i) => i.id));
      for (const id of Array.from(selectedItemIds)) {
        if (!visibleIdSet.has(id)) {
          selectedItemIds.delete(id);
        }
      }
      updateBatchBar();

      issuesListCount.textContent = filtered.length + " item" + (filtered.length === 1 ? "" : "s");
      issuesContainer.innerHTML = "";

      if (filtered.length === 0) {
        issuesContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px;">No issues match the selected filters.</div>';
        return;
      }

      filtered.forEach((item) => {
        renderIssueCard(item);
      });
    }

    function renderIssues(items, category) {
      rawCategoryItems = items;
      selectedItemIds.clear();

      filterSeverity.value = "ALL";
      filterIncludeTests.checked = true;

      populateFilterDropdowns(items);

      issuesSection.classList.remove("hidden");
      const categoryTitles = {
        duplications: "DUPLICATION FILES",
        coverage: "COVERAGE FILES",
        hotspots: "SECURITY HOTSPOTS",
        reliability: "RELIABILITY ISSUES",
        security: "SECURITY ISSUES",
        maintainability: "MAINTAINABILITY ISSUES",
        accepted: "ACCEPTED ISSUES",
      };
      issuesListTitle.textContent = categoryTitles[category] || (category.toUpperCase() + " ISSUES");

      applyFiltersAndRender();
    }

    [filterSeverity, filterAuthor, filterFile, filterRule].forEach((sel) => {
      sel.addEventListener("change", applyFiltersAndRender);
    });
    filterIncludeTests.addEventListener("change", applyFiltersAndRender);

    sendBatchBtn.addEventListener("click", () => {
      const selectedItems = currentItems.filter((item) => selectedItemIds.has(item.id));
      if (selectedItems.length > 0) {
        const targetAgentId = targetAgentDropdown.value;
        vscode.postMessage({ command: "sendBatchToAgent", items: selectedItems, targetAgentId });
      }
    });

    deselectAllBtn.addEventListener("click", () => {
      selectedItemIds.clear();
      document.querySelectorAll(".issue-checkbox").forEach((cb) => {
        cb.checked = false;
      });
      updateBatchBar();
    });

    targetAgentDropdown.addEventListener("change", () => {
      vscode.postMessage({ command: "setTargetAgent", agentId: targetAgentDropdown.value });
    });

    document.querySelectorAll(".metric-card").forEach((card) => {
      card.addEventListener("click", () => {
        const cat = card.dataset.category;
        if (!cat) return;

        document.querySelectorAll(".metric-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        activeCategory = cat;

        issuesContainer.innerHTML = "";
        issuesLoading.classList.remove("hidden");
        issuesSection.classList.remove("hidden");
        const categoryTitles = {
          duplications: "DUPLICATION FILES",
          coverage: "COVERAGE FILES",
          hotspots: "SECURITY HOTSPOTS",
          reliability: "RELIABILITY ISSUES",
          security: "SECURITY ISSUES",
          maintainability: "MAINTAINABILITY ISSUES",
          accepted: "ACCEPTED ISSUES",
        };
        issuesListTitle.textContent = categoryTitles[cat] || (cat.toUpperCase() + " ISSUES");

        vscode.postMessage({ command: "fetchDetails", category: cat });
      });
    });

    connectBtn.addEventListener("click", () => {
      try {
        clearAlert();
        const serverUrl = serverUrlInput.value.trim();
        const token = userTokenInput.value.trim();

        if (!serverUrl || !token) {
          showAlert("Please enter both Server URL and User Token.");
          return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = "Verifying...";
        vscode.postMessage({ command: "connect", serverUrl, token });
      } catch (err) {
        showAlert("Error initiating connection: " + (err?.message || String(err)));
      }
    });

    serverUrlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        connectBtn.click();
      }
    });

    userTokenInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        connectBtn.click();
      }
    });

    const manualProjectBtn = document.getElementById("manual-project-btn");
    if (manualProjectBtn) {
      manualProjectBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "openProjectPicker" });
      });
    }

    headerRefreshBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "refresh" });
      if (activeCategory) {
        vscode.postMessage({ command: "fetchDetails", category: activeCategory });
      }
    });

    headerDisconnectBtn.addEventListener("click", () => {
      try {
        vscode.postMessage({ command: "disconnect" });
      } catch (err) {
        showAlert("Error disconnecting: " + (err?.message || String(err)));
      }
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      try {
        vscode.postMessage({ command: "log", text: "Webview received postMessage: " + JSON.stringify({ type: message?.type, state: message?.state }) });
      } catch (_) {}
      switch (message.type) {
        case "loading": {
          if (message.loading) {
            loadingIndicator.classList.remove("hidden");
          } else {
            loadingIndicator.classList.add("hidden");
          }
          break;
        }
        case "loadingDetails": {
          if (message.loading) {
            issuesLoading.classList.remove("hidden");
          } else {
            issuesLoading.classList.add("hidden");
          }
          break;
        }
        case "details": {
          renderIssues(message.items || [], message.category);
          break;
        }
        case "state": {
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          if (message.state === "connected") {
            headerDisconnectBtn.classList.remove("hidden");
            onboardingView.classList.add("hidden");
            connectedView.classList.remove("hidden");

            if (message.availableAgents && Array.isArray(message.availableAgents)) {
              targetAgentDropdown.innerHTML = "";
              message.availableAgents.forEach((agent) => {
                const opt = document.createElement("option");
                opt.value = agent.id;
                opt.textContent = agent.name;
                targetAgentDropdown.appendChild(opt);
              });
            }

            if (message.defaultAgent) {
              targetAgentDropdown.value = message.defaultAgent;
            }

            if (message.hasPlaintextWarning) {
              plaintextWarning.classList.remove("hidden");
            } else {
              plaintextWarning.classList.add("hidden");
            }

            if (message.detectedFromProperties) {
              detectedBadge.classList.remove("hidden");
            } else {
              detectedBadge.classList.add("hidden");
            }

            cachedProjects = message.projects || [];
            currentSelectedProjectKey = message.projectKey || "";

            const matched = cachedProjects.find((p) => p.key === currentSelectedProjectKey);
            if (matched) {
              projectSearchInput.value = matched.name + " (" + matched.key + ")";
            } else if (currentSelectedProjectKey) {
              projectSearchInput.value = currentSelectedProjectKey;
            } else {
              projectSearchInput.value = "";
            }

            renderProjectList("");

            if (message.overviewError) {
              overviewError.textContent = message.overviewError;
              overviewError.className = "alert error";
            } else {
              overviewError.className = "alert error hidden";
              overviewError.textContent = "";
              if (message.overview) {
                renderOverview(message.overview);
              }
            }
          } else {
            headerDisconnectBtn.classList.add("hidden");
            connectedView.classList.add("hidden");
            onboardingView.classList.remove("hidden");
            if (message.serverUrl && !serverUrlInput.value) {
              serverUrlInput.value = message.serverUrl;
            }
          }
          break;
        }
        case "connecting": {
          connectBtn.disabled = true;
          connectBtn.textContent = "Verifying connection...";
          clearAlert();
          break;
        }
        case "disconnected": {
          userTokenInput.value = "";
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          headerDisconnectBtn.classList.add("hidden");
          if (message.message) {
            showAlert(message.message, "info");
          }
          break;
        }
        case "error": {
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          showAlert(message.message);
          break;
        }
      }
    });

    try {
      vscode?.postMessage({ command: "ready" });
      vscode?.postMessage({ command: "init" });
      vscode?.postMessage({ command: "log", text: "Webview script completed setup, posting ready & init" });
    } catch (_) {}
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
