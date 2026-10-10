import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ProjectDetector } from './ProjectDetector.js';
import {
  SonarClient,
  SonarCodePeriod,
  SonarDetailItem,
  SonarOverview,
  QualityGateStatus,
  InsufficientPermissionError,
} from './SonarClient.js';
import { FileNavigator } from './FileNavigator.js';
import { AgentDispatcher } from './AgentDispatcher.js';
import { ConnectionProfileWizard } from './ConnectionProfileWizard.js';
import { SonarLocalScanner } from './SonarLocalScanner.js';
import { Logger } from './Logger.js';
import { DemoData } from './DemoData.js';
import { SonarStatusBar } from './SonarStatusBar.js';
import { FileIssueAggregator } from './FileIssueAggregator.js';
import { GitStageGuard } from './GitStageGuard.js';
import {
  ISSUE_LIFECYCLE_CSS,
  ISSUE_LIFECYCLE_MENU_SCRIPT,
  ISSUE_LIFECYCLE_CARD_BUTTON_SCRIPT,
  ISSUE_LIFECYCLE_MESSAGE_SCRIPT,
} from './IssueLifecycleWebview.js';

export type CurrentCodeTab = 'overallCode' | 'currentCode';

export interface SonarOverviewViewProviderOptions {
  fileNavigator?: FileNavigator;
  agentDispatcher?: AgentDispatcher;
  diagnosticCollection?: vscode.DiagnosticCollection;
  connectionWizard?: ConnectionProfileWizard;
  localScanner?: SonarLocalScanner;
  workspaceRoot?: string;
  workspaceState?: vscode.Memento;
  statusBar?: SonarStatusBar;
  gitStageGuard?: GitStageGuard;
}

export class SonarOverviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = 'sonarAgent.overviewView';
  /**
   * Transitions that resolve an issue and change shared server state.
   * These require an explicit confirmation dialog before being applied.
   */
  private static readonly RESOLUTION_TRANSITIONS = new Set(['falsepositive', 'wontfix']);
  private _view?: vscode.WebviewView;
  private _webviewReady = false;
  private _lastStateMessage?: any;
  private readonly projectDetector: ProjectDetector;
  private readonly fileNavigator: FileNavigator;
  private readonly agentDispatcher: AgentDispatcher;
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly connectionWizard: ConnectionProfileWizard;
  private readonly localScanner: SonarLocalScanner;
  private readonly statusBar: SonarStatusBar;
  private readonly workspaceRoot?: string;
  private _currentCodeEnabled = true;
  private _activeTab: CurrentCodeTab = 'overallCode';
  private _currentCodeItems: SonarDetailItem[] = [];
  private _currentCodeSubscription?: vscode.Disposable;
  private _statusBarItem?: vscode.StatusBarItem;
  private _scanInProgress = false;
  private readonly issueTransitionsCache = new Map<string, string[]>();
  private currentUserLogin: string | null = null;
  private _currentDetailCategory: string | null = null;
  private _isDemoMode = false;
  private _cachedServerIssues: SonarDetailItem[] = [];
  private readonly fileIssueAggregator: FileIssueAggregator;
  private readonly gitStageGuard: GitStageGuard;
  private readonly _workspaceState: vscode.Memento;
  private _codePeriod: SonarCodePeriod = 'overall';

  constructor(
    private readonly extensionUri: vscode.Uri,
    projectDetector: ProjectDetector,
    fileNavigatorOrOptions?: FileNavigator | SonarOverviewViewProviderOptions,
    agentDispatcher?: AgentDispatcher,
    diagnosticCollection?: vscode.DiagnosticCollection,
    connectionWizard?: ConnectionProfileWizard,
    localScanner?: SonarLocalScanner,
  ) {
    this.projectDetector = projectDetector;

    const isOptionsObject =
      fileNavigatorOrOptions &&
      !(fileNavigatorOrOptions instanceof FileNavigator) &&
      !('navigateToFile' in fileNavigatorOrOptions);

    const opts: SonarOverviewViewProviderOptions = isOptionsObject
      ? (fileNavigatorOrOptions as SonarOverviewViewProviderOptions)
      : {
          fileNavigator: fileNavigatorOrOptions as FileNavigator | undefined,
          agentDispatcher,
          diagnosticCollection,
          connectionWizard,
          localScanner,
        };

    const defaultMemento: vscode.Memento = {
      keys: () => [],
      get: <T>(_key: string, defaultValue?: T) => defaultValue as T,
      update: (_key: string, _value: any) => Promise.resolve(),
    };
    this._workspaceState = opts.workspaceState ?? defaultMemento;
    this._codePeriod =
      this._workspaceState.get<SonarCodePeriod>('sonarAgent.activeCodePeriod', 'overall') ||
      'overall';

    this.workspaceRoot = opts.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.fileNavigator = opts.fileNavigator ?? new FileNavigator();
    this.statusBar = opts.statusBar ?? new SonarStatusBar();
    this.localScanner =
      opts.localScanner ?? new SonarLocalScanner({ workspaceRoot: this.workspaceRoot });
    this.agentDispatcher =
      opts.agentDispatcher ??
      new AgentDispatcher({
        fileNavigator: this.fileNavigator,
        projectDetector: this.projectDetector,
      });
    this.fileIssueAggregator = new FileIssueAggregator({
      getCachedIssuesFn: () => this.getAllCachedIssues(),
    });
    this.diagnosticCollection =
      opts.diagnosticCollection ?? vscode.languages.createDiagnosticCollection('SonarQube');
    this.connectionWizard =
      opts.connectionWizard ??
      new ConnectionProfileWizard({
        projectDetector: this.projectDetector,
        onConfigChanged: () => this.refresh(),
        promptProjectSelectionFn: () => this.promptProjectSelection(),
      });
    this.gitStageGuard =
      opts.gitStageGuard ??
      new GitStageGuard({
        workspaceRoot: this.workspaceRoot,
        getCachedIssuesFn: () => this.getAllCachedIssues(),
        dispatchBatchFn: async (issues) => {
          const agent = this._getEffectiveDefaultAgent();
          return await this.agentDispatcher.dispatchBatch(issues, { targetAgentId: agent });
        },
      });
  }

  public getCodePeriod(): SonarCodePeriod {
    return this._codePeriod;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    void this.gitStageGuard.initialize();
    this._view = webviewView;
    this._webviewReady = false;
    this._currentCodeEnabled = this.readCurrentCodeEnabled();
    const isConfigured = this.projectDetector.isConfiguredSync?.() ?? false;
    Logger.info(
      `[Host] resolveWebviewView called. visible=${webviewView.visible}, isConfigured=${isConfigured}`,
    );

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(
      webviewView.webview,
      isConfigured,
      this._currentCodeEnabled,
      this._codePeriod,
    );

    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        const textSuffix = message.text ? ` text="${message.text}"` : '';
        Logger.info(`[Host] onDidReceiveMessage: command=${message.command}${textSuffix}`);
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
          case 'switchProfile': {
            await this._handleSwitchProfile(message.profileId);
            break;
          }
          case 'createProfile': {
            await this.promptCreateProfile();
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
          case 'cleanCurrentFile': {
            await this.cleanCurrentFile();
            break;
          }
          case 'generateMissingTests': {
            await this.generateMissingTests(message.item, message.targetAgentId);
            break;
          }
          case 'checkStagedFiles': {
            await this.checkStagedFiles(true);
            break;
          }
          case 'enableDemoMode': {
            await this.enableDemoMode();
            break;
          }
          case 'disableDemoMode': {
            await this.disableDemoMode();
            break;
          }
          case 'fetchIssueTransitions': {
            await this._handleFetchIssueTransitions(message.issueKey);
            break;
          }
          case 'issueTransition': {
            await this._handleIssueTransition(message.issueKey, message.transition);
            break;
          }
          case 'assignIssue': {
            await this._handleAssignIssue(message.issueKey);
            break;
          }
          case 'addIssueComment': {
            await this._handleAddIssueComment(message.issueKey, message.text);
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
          case 'switchTab': {
            await this.handleSwitchTab(
              message.tab === 'currentCode' ? 'currentCode' : 'overallCode',
            );
            break;
          }
          case 'switchCodePeriod': {
            const period: SonarCodePeriod = message.period === 'new' ? 'new' : 'overall';
            await this.handleSwitchCodePeriod(period);
            break;
          }
          case 'runCliScan': {
            await this.handleRunCliScan();
            break;
          }
          case 'installSonarLint': {
            try {
              await vscode.commands.executeCommand(
                'workbench.extensions.installExtension',
                'sonarsource.sonarlint-vscode',
              );
            } catch (err: any) {
              this._view?.webview.postMessage({
                type: 'error',
                message: err?.message || 'Failed to install SonarLint.',
              });
            }
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
    void this._syncState();

    webviewView.onDidChangeVisibility?.(() => {
      if (webviewView.visible) {
        void this._syncState();
        if (this._currentCodeEnabled && this._activeTab === 'currentCode') {
          void this.subscribeCurrentCode().catch((err: unknown) => {
            Logger.error('Failed to subscribe to current code:', err);
          });
        }
      } else {
        this.unsubscribeCurrentCode();
      }
    });
    webviewView.onDidDispose?.(() => {
      this.unsubscribeCurrentCode();
      this.hideScanStatus();
    });
  }

  public async refresh(): Promise<void> {
    if (this._view) {
      await this._syncState();
    }
  }

  public get isDemoMode(): boolean {
    return this._isDemoMode;
  }

  public async enableDemoMode(): Promise<void> {
    this._isDemoMode = true;
    const demoOverview = DemoData.getOverview(this._codePeriod);
    const demoGate = DemoData.getQualityGate();
    const demoProjects = DemoData.getProjects();
    const effectiveDefaultAgent = this._getEffectiveDefaultAgent();
    const availableAgents = this.agentDispatcher.getAvailableAgents();

    const demoState = {
      type: 'state',
      state: 'connected',
      isDemoMode: true,
      serverUrl: 'http://localhost:9000 (Demo)',
      projectKey: 'demo-sample-project',
      projects: demoProjects,
      overview: demoOverview,
      qualityGate: demoGate,
      profiles: [],
      activeProfileId: undefined,
      defaultAgent: effectiveDefaultAgent,
      availableAgents,
      codePeriod: this._codePeriod,
    };
    this._lastStateMessage = demoState;
    await this._view?.webview.postMessage(demoState);
    await this._view?.webview.postMessage({ type: 'qualityGate', status: demoGate });
    await this._view?.webview.postMessage({ type: 'loading', loading: false });

    this.statusBar.update({
      projectKey: 'demo-sample-project',
      overview: demoOverview,
      qualityGate: demoGate,
      isDemoMode: true,
    });
  }

  public async disableDemoMode(): Promise<void> {
    this._isDemoMode = false;
    this.statusBar.clear();
    await this._syncState();
  }

  public getStatusBar(): SonarStatusBar {
    return this.statusBar;
  }

  public getFileIssueAggregator(): FileIssueAggregator {
    return this.fileIssueAggregator;
  }

  public getAllCachedIssues(): SonarDetailItem[] {
    if (this._isDemoMode) {
      return DemoData.getDetails(undefined, this._codePeriod);
    }
    const set = new Map<string, SonarDetailItem>();
    for (const item of this._currentCodeItems) {
      set.set(item.id, item);
    }
    for (const item of this._cachedServerIssues) {
      set.set(item.id, item);
    }
    return Array.from(set.values());
  }

  public async cleanCurrentFile(
    targetDoc?: vscode.TextDocument,
  ): Promise<{ ok: boolean; count: number; message: string }> {
    const doc = targetDoc ?? vscode.window.activeTextEditor?.document;
    if (!doc) {
      const msg = 'No active editor found. Open a file to clean Sonar issues.';
      vscode.window.showInformationMessage(msg);
      return { ok: false, count: 0, message: msg };
    }

    const allIssues = this.fileIssueAggregator.aggregateIssuesForDocument(doc);
    let issues = allIssues;

    if (this._codePeriod === 'new') {
      issues = allIssues.filter((i) => i.inNewCodePeriod === true);
      if (issues.length === 0) {
        const fileName = path.basename(doc.fileName || doc.uri.fsPath);
        const msg = `No new Sonar issues detected in ${fileName} for the current leak period!`;
        vscode.window.showInformationMessage(msg);
        return { ok: true, count: 0, message: msg };
      }
    } else if (issues.length === 0) {
      const fileName = path.basename(doc.fileName || doc.uri.fsPath);
      const msg = `No Sonar issues detected in ${fileName}. File is clean!`;
      vscode.window.showInformationMessage(msg);
      return { ok: true, count: 0, message: msg };
    }

    const effectiveDefaultAgent = this._getEffectiveDefaultAgent();
    const result = await this.agentDispatcher.dispatchBatch(issues, {
      targetAgentId: effectiveDefaultAgent,
      codePeriod: this._codePeriod,
    });

    return { ok: result.ok, count: issues.length, message: result.message };
  }

  private createSyntheticCoverageItem(filePathOrUri: string): SonarDetailItem {
    const relPath = this.workspaceRoot
      ? path.relative(this.workspaceRoot, filePathOrUri)
      : filePathOrUri;
    return {
      id: `cov-${Date.now()}`,
      ruleKey: 'coverage:uncovered_lines',
      message: `Coverage gap for ${path.basename(relPath)}`,
      component: relPath,
      filePath: relPath,
      line: 1,
      type: 'COVERAGE',
      severity: 'MAJOR',
      status: 'OPEN',
      tags: ['test-coverage', 'unit-test'],
      creationDate: new Date().toISOString(),
    };
  }

  private resolveCoverageItem(
    itemOrDoc?: SonarDetailItem | vscode.TextDocument | vscode.Uri,
  ): SonarDetailItem | undefined {
    if (itemOrDoc) {
      if ('type' in itemOrDoc && 'ruleKey' in itemOrDoc) {
        return itemOrDoc as SonarDetailItem;
      }
      if ('uri' in itemOrDoc && 'fileName' in itemOrDoc) {
        return this.createSyntheticCoverageItem((itemOrDoc as vscode.TextDocument).uri.fsPath);
      }
      if ('fsPath' in itemOrDoc && 'scheme' in itemOrDoc) {
        return this.createSyntheticCoverageItem((itemOrDoc as vscode.Uri).fsPath);
      }
    }
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc) {
      return this.createSyntheticCoverageItem(activeDoc.uri.fsPath);
    }
    return undefined;
  }

  public async generateMissingTests(
    itemOrDoc?: SonarDetailItem | vscode.TextDocument | vscode.Uri,
    targetAgentId?: string,
  ): Promise<{ ok: boolean; message: string }> {
    const item = this.resolveCoverageItem(itemOrDoc);

    if (!item) {
      const msg =
        'No active file open to generate tests for. Please open a file or select a coverage item.';
      vscode.window.showInformationMessage(msg);
      return { ok: false, message: msg };
    }

    const agent = targetAgentId ?? this._getEffectiveDefaultAgent();
    return await this.agentDispatcher.dispatchIssue(item, { targetAgentId: agent });
  }

  public async checkStagedFiles(interactive = true): Promise<{
    stagedFileCount: number;
    issueCount: number;
    issues: SonarDetailItem[];
  }> {
    return await this.gitStageGuard.checkStagedFiles(interactive);
  }

  public dispose(): void {
    this.statusBar.dispose();
    this.gitStageGuard.dispose();
  }

  public isCurrentCodeEnabled(): boolean {
    return this._currentCodeEnabled;
  }

  public getActiveTab(): CurrentCodeTab {
    return this._activeTab;
  }

  private readCurrentCodeEnabled(): boolean {
    try {
      return vscode.workspace
        .getConfiguration('sonarAgent')
        .get<boolean>('currentCode.enabled', true);
    } catch {
      return true;
    }
  }

  private readCurrentCodeSource(): 'sonarlint' | 'cli' {
    try {
      const source = vscode.workspace
        .getConfiguration('sonarAgent')
        .get<string>('currentCode.source', 'sonarlint');
      return source === 'cli' ? 'cli' : 'sonarlint';
    } catch {
      return 'sonarlint';
    }
  }

  public async handleSwitchTab(tab: CurrentCodeTab): Promise<void> {
    this._activeTab = tab;
    await this._view?.webview.postMessage({ type: 'tabState', activeTab: this._activeTab });
    if (!this._currentCodeEnabled) {
      return;
    }
    if (tab === 'currentCode') {
      await this.subscribeCurrentCode();
    } else {
      this.unsubscribeCurrentCode();
    }
  }

  public async getClient(): Promise<SonarClient | null> {
    return await this.getLifecycleClient();
  }

  public async getEffectiveProjectKey(): Promise<string | undefined> {
    const config = await this.projectDetector.getConfig();
    return config.projectKey;
  }

  public async handleSwitchCodePeriod(period: SonarCodePeriod): Promise<void> {
    this._codePeriod = period;
    try {
      await this._workspaceState.update('sonarAgent.activeCodePeriod', period);
    } catch {
      // best-effort persistence
    }

    if (this._isDemoMode) {
      const demoOverview = DemoData.getOverview(period);
      await this._view?.webview.postMessage({
        type: 'overviewUpdated',
        overview: demoOverview,
        period: this._codePeriod,
        hasNewCode: demoOverview.hasNewCode,
      });
      if (this._currentDetailCategory) {
        await this._handleFetchDetails(this._currentDetailCategory);
      }
      return;
    }

    const client = await this.getClient();
    const projectKey = await this.getEffectiveProjectKey();
    if (!client || !projectKey) {
      await this._view?.webview.postMessage({
        type: 'codePeriodState',
        period: this._codePeriod,
      });
      if (this._currentDetailCategory) {
        await this._handleFetchDetails(this._currentDetailCategory);
      }
      return;
    }

    await this._view?.webview.postMessage({
      type: 'loading',
      loading: true,
      text: `Fetching ${period === 'new' ? 'New' : 'Overall'} Code measures...`,
    });

    const { overview, overviewError } = await this.fetchProjectOverview(
      client,
      projectKey,
      this._codePeriod,
    );

    await this._view?.webview.postMessage({
      type: 'loading',
      loading: false,
    });

    await this._view?.webview.postMessage({
      type: 'overviewUpdated',
      overview,
      overviewError,
      period: this._codePeriod,
      hasNewCode: overview?.hasNewCode,
    });

    if (this._currentDetailCategory) {
      await this._handleFetchDetails(this._currentDetailCategory);
    }
  }

  private async subscribeCurrentCode(): Promise<void> {
    if (!this._currentCodeEnabled || !this._view) {
      return;
    }
    this.unsubscribeCurrentCode();
    await this.pushCurrentCodeItems();
    try {
      this._currentCodeSubscription = this.localScanner.onDiagnosticsChanged((items) => {
        void this.pushCurrentCodeItems(items);
      });
    } catch {
      // listener registration is best-effort in headless environments
    }
  }

  private unsubscribeCurrentCode(): void {
    try {
      this._currentCodeSubscription?.dispose();
    } catch {
      // ignore dispose errors
    }
    this._currentCodeSubscription = undefined;
  }

  private async pushCurrentCodeItems(items?: SonarDetailItem[]): Promise<void> {
    if (!this._view || !this._currentCodeEnabled) {
      return;
    }
    try {
      const resolved = items ?? this.localScanner.getLocalDiagnostics();
      this._currentCodeItems = resolved;
      const source = this.readCurrentCodeSource();
      const sourceLabel = source === 'cli' ? 'Source: SonarScanner' : 'Source: SonarLint (Live)';
      await this._view.webview.postMessage({
        type: 'currentCodeItems',
        items: resolved,
        source,
        sourceLabel,
        sonarLintInstalled: this.localScanner.isSonarLintInstalled(),
      });
      await this._view.webview.postMessage({ type: 'currentCodeCount', count: resolved.length });
    } catch (err: any) {
      await this._view?.webview.postMessage({
        type: 'error',
        message: err?.message || 'Failed to load Current Code issues.',
      });
    }
  }

  private showScanStatus(): void {
    try {
      this._statusBarItem ??= vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100,
      );
      this._statusBarItem.text = '$(sync~spin) Sonar Agent: Scanning…';
      this._statusBarItem.tooltip = 'Sonar Agent full project scan in progress';
      this._statusBarItem.show();
    } catch {
      // status bar is unavailable in headless test environments
    }
  }

  private hideScanStatus(): void {
    try {
      this._statusBarItem?.hide();
    } catch {
      // ignore
    }
  }

  public async handleRunCliScan(): Promise<{ ok: boolean; errorMessage?: string }> {
    if (!this._view || this._scanInProgress) {
      return { ok: false, errorMessage: 'Scan already in progress.' };
    }
    this._scanInProgress = true;
    this.showScanStatus();
    await this._view.webview.postMessage({ type: 'scanStatus', scanning: true });
    try {
      const result = await this.localScanner.runCliScan(
        this.workspaceRoot,
        await this.resolveScanBinding(),
      );
      if (result.ok) {
        const refreshed = await this.refreshCurrentCodeFromServer();
        await this.pushCurrentCodeItems(refreshed ?? undefined);
      } else {
        await this._view.webview.postMessage({
          type: 'error',
          message: result.errorMessage ?? 'Full scan failed.',
        });
      }
      return result;
    } finally {
      this._scanInProgress = false;
      this.hideScanStatus();
      await this._view?.webview.postMessage({ type: 'scanStatus', scanning: false });
    }
  }

  private async resolveScanBinding(): Promise<
    { serverUrl?: string; projectKey?: string; token?: string } | undefined
  > {
    try {
      const config = await this.projectDetector.getConfig();
      const token = await this.projectDetector.getToken().catch(() => undefined);
      if (!config.serverUrl && !config.projectKey && !token) {
        return undefined;
      }
      return {
        serverUrl: config.serverUrl || undefined,
        projectKey: config.projectKey || undefined,
        token: token ?? undefined,
      };
    } catch {
      return undefined;
    }
  }

  private async refreshCurrentCodeFromServer(): Promise<SonarDetailItem[] | null> {
    try {
      const config = await this.projectDetector.getConfig();
      const token = await this.projectDetector.getToken();
      if (!config.serverUrl || !config.projectKey || !token) {
        return null;
      }
      const client = new SonarClient({ serverUrl: config.serverUrl, token });
      return await client.getIssues(config.projectKey);
    } catch {
      return null;
    }
  }

  public async promptProjectSelection(): Promise<void> {
    return this.connectionWizard.promptProjectSelectionInternal();
  }

  public async promptConfigureConnection(): Promise<void> {
    return this.connectionWizard.promptConfigureConnection();
  }

  public async promptUpdateCredentials(initialUrl?: string, initialToken?: string): Promise<void> {
    return this.connectionWizard.promptUpdateCredentials(initialUrl, initialToken);
  }

  public async promptManageProfiles(): Promise<void> {
    return this.connectionWizard.promptManageProfiles();
  }

  public async promptCreateProfile(): Promise<void> {
    return this.connectionWizard.promptCreateProfile();
  }

  private async _handleSendToAgent(item: SonarDetailItem, targetAgentId?: string): Promise<void> {
    await this.agentDispatcher.dispatchIssue(item, {
      targetAgentId,
      codePeriod: this._codePeriod,
    });
  }

  private async _handleSendBatchToAgent(
    items: SonarDetailItem[],
    targetAgentId?: string,
  ): Promise<void> {
    await this.agentDispatcher.dispatchBatch(items, {
      targetAgentId,
      codePeriod: this._codePeriod,
    });
  }

  private async _handleFetchDetails(category: string): Promise<void> {
    if (!this._view) return;

    this._currentDetailCategory = category;

    if (this._isDemoMode) {
      const items = DemoData.getDetails(category, this._codePeriod);
      this._view.webview.postMessage({
        type: 'details',
        category,
        items,
        period: this._codePeriod,
      });
      return;
    }

    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    if (!config.serverUrl || !config.projectKey || !token) return;

    this._view.webview.postMessage({ type: 'loadingDetails', loading: true });

    try {
      const client = new SonarClient({ serverUrl: config.serverUrl, token });
      let items: SonarDetailItem[] = [];
      const inNewCodePeriod = this._codePeriod === 'new';

      if (category === 'hotspots') {
        items = await client.getHotspots(config.projectKey, inNewCodePeriod);
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
        items = await client.getIssues(config.projectKey, category, inNewCodePeriod);
      } else {
        items = await client.getIssues(config.projectKey, undefined, inNewCodePeriod);
      }

      this._updateCachedServerIssues(items);
      this._view.webview.postMessage({
        type: 'details',
        category,
        items,
        period: this._codePeriod,
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

  private _updateCachedServerIssues(items: SonarDetailItem[]): void {
    const map = new Map<string, SonarDetailItem>();
    for (const existing of this._cachedServerIssues) {
      map.set(existing.id, existing);
    }
    for (const item of items) {
      map.set(item.id, item);
    }
    this._cachedServerIssues = Array.from(map.values());
  }

  /**
   * Builds an authenticated SonarClient for the active project binding,
   * or null when the extension is not connected.
   */
  private async getLifecycleClient(): Promise<SonarClient | null> {
    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    if (!config.serverUrl || !config.projectKey || !token) return null;
    return new SonarClient({ serverUrl: config.serverUrl, token });
  }

  /**
   * Lazily fetches the server-provided transitions for an issue (cached per
   * issue key) and forwards them to the webview for the overflow menu.
   */
  private async _handleFetchIssueTransitions(issueKey: string): Promise<void> {
    if (!this._view || !issueKey) return;

    const cached = this.issueTransitionsCache.get(issueKey);
    if (cached) {
      await this._view.webview.postMessage({
        type: 'issueTransitions',
        issueKey,
        transitions: cached,
      });
      return;
    }

    const client = await this.getLifecycleClient();
    if (!client) return;

    try {
      const transitions = await client.getIssueTransitions(issueKey);
      this.issueTransitionsCache.set(issueKey, transitions);
      await this._view.webview.postMessage({ type: 'issueTransitions', issueKey, transitions });
    } catch (err: any) {
      Logger.error(`[Host] Failed to fetch transitions for issue ${issueKey}`, err);
      await this._view.webview.postMessage({ type: 'issueTransitions', issueKey, transitions: [] });
    }
  }

  /**
   * Applies an issue transition. Resolution-type transitions (false
   * positive / won't fix) change shared server state, so they require an
   * explicit confirmation — a dismissed dialog is a no-op.
   */
  private async _handleIssueTransition(issueKey: string, transition: string): Promise<void> {
    if (!issueKey || !transition) return;
    const client = await this.getLifecycleClient();
    if (!client) return;

    if (SonarOverviewViewProvider.RESOLUTION_TRANSITIONS.has(transition)) {
      const actionLabel =
        transition === 'falsepositive' ? 'Mark as False Positive' : `Accept (Won't Fix)`;
      const picked = await vscode.window.showWarningMessage(
        `${actionLabel} for this issue? This changes shared state on the SonarQube server.`,
        { modal: true },
        actionLabel,
      );
      if (!picked) {
        Logger.info(
          `[Host] Issue transition dismissed by user: issue=${issueKey} transition=${transition}`,
        );
        return;
      }
    }

    try {
      Logger.info(`[Host] Applying issue transition: issue=${issueKey} transition=${transition}`);
      await client.doIssueTransition(issueKey, transition);
      this.issueTransitionsCache.delete(issueKey);
      vscode.window.showInformationMessage(`Issue ${humanizeIssueTransition(transition)}.`);
      await this.refreshIssueList();
    } catch (err: any) {
      this.handleLifecycleError(err);
    }
  }

  /**
   * Assigns the issue to the current user ("Assign to me").
   */
  private async _handleAssignIssue(issueKey: string): Promise<void> {
    if (!issueKey) return;
    const client = await this.getLifecycleClient();
    if (!client) return;

    try {
      if (!this.currentUserLogin) {
        this.currentUserLogin = await client.getCurrentUserLogin();
      }
      Logger.info(`[Host] Assigning issue ${issueKey} to ${this.currentUserLogin}`);
      await client.assignIssue(issueKey, this.currentUserLogin);
      vscode.window.showInformationMessage(`Issue assigned to ${this.currentUserLogin}.`);
      await this.refreshIssueList();
    } catch (err: any) {
      this.handleLifecycleError(err);
    }
  }

  /**
   * Adds a comment to the issue. Empty text is a no-op.
   */
  private async _handleAddIssueComment(issueKey: string, text: string): Promise<void> {
    if (!issueKey || !text?.trim()) return;
    const client = await this.getLifecycleClient();
    if (!client) return;

    try {
      Logger.info(`[Host] Adding comment to issue ${issueKey}`);
      await client.addIssueComment(issueKey, text.trim());
      vscode.window.showInformationMessage('Comment added to issue.');
      await this.refreshIssueList();
    } catch (err: any) {
      this.handleLifecycleError(err);
    }
  }

  /**
   * Renders lifecycle failures honestly: a friendly permission hint for
   * 403s, a generic message otherwise. Raw errors go to the log channel
   * only — never to the user.
   */
  private handleLifecycleError(err: any): void {
    Logger.error('[Host] Issue lifecycle action failed', err);
    if (err instanceof InsufficientPermissionError) {
      vscode.window.showWarningMessage(err.message);
    } else {
      vscode.window.showWarningMessage(
        'Could not complete the action. See the Sonar Agent logs for details.',
      );
    }
  }

  /**
   * Re-fetches the currently visible issue list so lifecycle actions are
   * reflected immediately.
   */
  private async refreshIssueList(): Promise<void> {
    if (this._currentDetailCategory) {
      await this._handleFetchDetails(this._currentDetailCategory);
    }
  }

  public async syncDiagnostics(items: SonarDetailItem[]): Promise<void> {
    this.diagnosticCollection.clear();
    const map = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();

    const resolvedEntries = await Promise.all(
      items.map(async (item) => {
        if (!item.filePath) {
          return null;
        }
        const resolved = await this.fileNavigator.resolveFilePath(item.filePath);
        return resolved ? { item, resolved } : null;
      }),
    );

    for (const entry of resolvedEntries) {
      if (!entry) {
        continue;
      }
      const { item, resolved } = entry;

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

      const mapEntry = map.get(uri.toString()) || { uri, diagnostics: [] };
      mapEntry.diagnostics.push(diagnostic);
      map.set(uri.toString(), mapEntry);
    }

    for (const { uri, diagnostics } of map.values()) {
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }

  private async _handleSwitchProfile(profileId: string): Promise<void> {
    try {
      await this.projectDetector.activateProfile(profileId);
    } catch (err: any) {
      this._view?.webview.postMessage({
        type: 'error',
        message: err?.message || `Unknown connection profile: ${profileId}`,
      });
      return;
    }
    await this._syncState();
  }

  private _getEffectiveDefaultAgent(): string {
    const defaultAgent = vscode.workspace
      .getConfiguration('sonarAgent')
      .get<string>('defaultAgent', 'copilot');
    const availableAgents = this.agentDispatcher.getAvailableAgents();
    if (!availableAgents.some((a) => a.id === defaultAgent)) {
      return availableAgents[0]?.id || 'clipboard';
    }
    return defaultAgent;
  }

  private async _sendNoProfilesState(
    profiles: any[],
    activeProfileId?: string,
    defaultAgent?: string,
    availableAgents?: any[],
  ): Promise<void> {
    const noProfilesState = {
      type: 'state',
      state: 'no-profiles',
      serverUrl: 'http://localhost:9000',
      profiles,
      activeProfileId,
      defaultAgent,
      availableAgents,
    };
    this._lastStateMessage = noProfilesState;
    this.statusBar.clear();
    await this._view?.webview.postMessage(noProfilesState);
  }

  private async _sendOnboardingState(
    serverUrl: string,
    profiles: any[],
    activeProfileId?: string,
    defaultAgent?: string,
    availableAgents?: any[],
  ): Promise<void> {
    const onboardingState = {
      type: 'state',
      state: 'onboarding',
      serverUrl: serverUrl || 'http://localhost:9000',
      profiles,
      activeProfileId,
      defaultAgent,
      availableAgents,
    };
    this._lastStateMessage = onboardingState;
    this.statusBar.clear();
    const delivered = await this._view?.webview.postMessage(onboardingState);
    Logger.info(`[Host] postMessage(onboarding) delivered=${delivered}`);
  }

  public async fetchProjectOverview(
    client: SonarClient,
    projectKey?: string,
    codePeriod: SonarCodePeriod = this._codePeriod,
  ): Promise<{ overview: SonarOverview | null; overviewError?: string }> {
    return this._fetchOverviewForProject(client, projectKey, codePeriod);
  }

  private async _fetchOverviewForProject(
    client: SonarClient,
    projectKey?: string,
    codePeriod: SonarCodePeriod = this._codePeriod,
  ): Promise<{ overview: SonarOverview | null; overviewError?: string }> {
    if (!projectKey) {
      return { overview: null };
    }
    try {
      const overview = await client.getOverview(projectKey, codePeriod);
      if (overview) {
        Logger.info(
          `Measures updated for [${projectKey}] (${codePeriod} code): ${overview.security.count} vulnerabilities, ${overview.reliability.count} bugs, ${overview.maintainability.count} smells, ${overview.coverage.percentage.toFixed(1)}% coverage.`,
        );
      }
      return { overview };
    } catch (err: any) {
      const overviewError = err.message || 'Failed to fetch project measures.';
      Logger.error(
        `Failed to fetch project measures for [${projectKey}] (${codePeriod} code)`,
        overviewError,
      );
      return { overview: null, overviewError };
    }
  }

  private async _resolveOverview(
    client: SonarClient,
    resolvedProjectKey?: string,
    effectiveProjectKey?: string,
    initialOverview?: PromiseSettledResult<SonarOverview | null>,
  ): Promise<{ overview: SonarOverview | null; overviewError?: string }> {
    if (!resolvedProjectKey) {
      return { overview: null };
    }

    if (
      resolvedProjectKey === effectiveProjectKey &&
      initialOverview &&
      this._codePeriod === 'overall'
    ) {
      if (initialOverview.status === 'fulfilled') {
        const overview = initialOverview.value;
        if (overview) {
          Logger.info(
            `Measures updated for [${resolvedProjectKey}]: ${overview.security.count} vulnerabilities, ${overview.reliability.count} bugs, ${overview.maintainability.count} smells, ${overview.coverage.percentage.toFixed(1)}% coverage.`,
          );
        }
        return { overview };
      }
      const overviewError = initialOverview.reason?.message || 'Failed to fetch project measures.';
      Logger.error(`Failed to fetch project measures for [${resolvedProjectKey}]`, overviewError);
      return { overview: null, overviewError };
    }

    return this._fetchOverviewForProject(client, resolvedProjectKey, this._codePeriod);
  }

  private async _syncConnectedState(params: {
    config: { serverUrl: string; projectKey?: string; hasToken: boolean };
    token: string;
    profiles: any[];
    activeProfileId?: string;
    effectiveDefaultAgent: string;
    availableAgents: any[];
  }): Promise<void> {
    const { config, token, profiles, activeProfileId, effectiveDefaultAgent, availableAgents } =
      params;
    const immediateState = {
      type: 'state',
      state: 'connected',
      serverUrl: config.serverUrl,
      projectKey: config.projectKey,
      projects: [],
      profiles,
      activeProfileId,
      defaultAgent: effectiveDefaultAgent,
      availableAgents,
      codePeriod: this._codePeriod,
    };
    this._lastStateMessage = immediateState;
    const deliveredImmediate = await this._view?.webview.postMessage(immediateState);
    Logger.info(`[Host] Immediate postMessage(connected) delivered=${deliveredImmediate}`);

    await this._view?.webview.postMessage({ type: 'loading', loading: true });

    const client = new SonarClient({ serverUrl: config.serverUrl, token });
    const effectiveProjectKey = config.projectKey;

    const [projectsResult, initialOverview, initialGate] = await Promise.allSettled([
      client.fetchProjects(),
      effectiveProjectKey
        ? client.getOverview(effectiveProjectKey, this._codePeriod)
        : Promise.resolve(null),
      effectiveProjectKey
        ? client.getQualityGateStatus(effectiveProjectKey)
        : Promise.resolve(null),
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

    const { overview, overviewError } = await this._resolveOverview(
      client,
      resolvedProjectKey,
      effectiveProjectKey,
      initialOverview,
    );

    // Quality gate rides alongside the overview fetch but must never block it.
    // If the project key was auto-resolved above (no key configured), the
    // parallel fetch ran against an empty key and resolved null — fetch again
    // for the actual key. Any failure hides the widget silently.
    let qualityGate: QualityGateStatus | null =
      initialGate.status === 'fulfilled' ? initialGate.value : null;
    if (initialGate.status === 'rejected') {
      console.error('[SonarAgent] getQualityGateStatus error:', initialGate.reason);
    }
    if (resolvedProjectKey && resolvedProjectKey !== effectiveProjectKey) {
      try {
        qualityGate = await client.getQualityGateStatus(resolvedProjectKey);
      } catch (err) {
        console.error('[SonarAgent] getQualityGateStatus (resolved key) error:', err);
        qualityGate = null;
      }
    }

    const fullState = {
      type: 'state',
      state: 'connected',
      serverUrl: config.serverUrl,
      projectKey: resolvedProjectKey,
      projects,
      overview,
      overviewError,
      qualityGate,
      profiles,
      activeProfileId,
      defaultAgent: effectiveDefaultAgent,
      availableAgents,
      codePeriod: this._codePeriod,
    };
    this._lastStateMessage = fullState;
    const deliveredFull = await this._view?.webview.postMessage(fullState);
    Logger.info(`[Host] Full postMessage(connected) delivered=${deliveredFull}`);

    await this._view?.webview.postMessage({ type: 'qualityGate', status: qualityGate });

    await this._view?.webview.postMessage({ type: 'loading', loading: false });

    this.statusBar.update({
      projectKey: resolvedProjectKey,
      overview,
      qualityGate,
      isDemoMode: false,
    });

    if (!this._webviewReady && this._view) {
      setTimeout(async () => {
        if (!this._webviewReady && this._view && this._lastStateMessage) {
          await this._view.webview.postMessage(this._lastStateMessage);
        }
      }, 350);
    }
  }

  private async _syncState(): Promise<void> {
    if (!this._view) {
      return;
    }

    if (this._isDemoMode) {
      await this.enableDemoMode();
      return;
    }

    try {
      const config = await this.projectDetector.getConfig();
      const token = await this.projectDetector.getToken();
      const effectiveDefaultAgent = this._getEffectiveDefaultAgent();
      const availableAgents = this.agentDispatcher.getAvailableAgents();
      const profiles = (await this.projectDetector.listProfiles?.()) ?? [];
      const activeProfile = (await this.projectDetector.getActiveProfile?.()) ?? null;

      Logger.info(
        `[Host] _syncState: serverUrl=${config.serverUrl}, hasToken=${config.hasToken}, tokenPresent=${Boolean(token)}`,
      );

      if (profiles.length === 0 && !config.serverUrl && !token) {
        await this._sendNoProfilesState(
          profiles,
          activeProfile?.id,
          effectiveDefaultAgent,
          availableAgents,
        );
        await this.syncTabState();
        return;
      }

      if (config.serverUrl && config.hasToken && token) {
        await this._syncConnectedState({
          config,
          token,
          profiles,
          activeProfileId: activeProfile?.id,
          effectiveDefaultAgent,
          availableAgents,
        });
      } else {
        await this._sendOnboardingState(
          config.serverUrl,
          profiles,
          activeProfile?.id,
          effectiveDefaultAgent,
          availableAgents,
        );
      }
      await this.syncTabState();
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

  private async syncTabState(): Promise<void> {
    if (!this._view || !this._currentCodeEnabled) {
      return;
    }
    try {
      await this._view.webview.postMessage({ type: 'tabState', activeTab: this._activeTab });
      if (this._activeTab === 'currentCode') {
        await this.subscribeCurrentCode();
      } else {
        const items = this.localScanner.getLocalDiagnostics();
        await this._view.webview.postMessage({ type: 'currentCodeCount', count: items.length });
      }
    } catch {
      // best-effort tab sync
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
      normalizedUrl = 'https://' + normalizedUrl;
    }
    while (normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1);
    }

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
      this.statusBar.clear();
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
      this.statusBar.clear();
      Logger.info('SonarQube credentials removed and disconnected.');
      this._view?.webview.postMessage({
        type: 'disconnected',
        message: 'Disconnected from SonarQube. Credentials removed.',
      });
      vscode.window.showInformationMessage('SonarQube credentials have been removed.');
      await this._syncState();
    }
  }

  private _getHtmlForWebview(
    webview: vscode.Webview,
    isConfigured: boolean = false,
    currentCodeEnabled: boolean = true,
    codePeriod: SonarCodePeriod = this._codePeriod,
  ): string {
    const nonce = getNonce();
    return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src ${webview.cspSource} https:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sonar Agent</title>
  <style>
    :root {
      --sonar-blue: var(--vscode-charts-blue, #4b9fd5);
      --sonar-green: var(--vscode-charts-green, #00aa5e);
      --sonar-lime: #81b300;
      --sonar-yellow: var(--vscode-charts-yellow, #eabe06);
      --sonar-orange: var(--vscode-charts-orange, #ed7d20);
      --sonar-red: var(--vscode-charts-red, #d4333f);
      --sonar-border: var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
    }

    body.vscode-light {
      --sonar-lime: #5a7800;
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

    button:focus-visible,
    .btn:focus-visible,
    .icon-btn:focus-visible,
    .metric-card:focus-visible,
    .project-item:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 1px solid var(--vscode-focusBorder) !important;
      outline-offset: 1px;
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

    .demo-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      background: var(--vscode-editorInfo-background, rgba(0, 122, 204, 0.12));
      border: 1px solid var(--vscode-editorInfo-foreground, #3794ff);
      border-radius: 4px;
      gap: 8px;
    }

    .demo-banner-content {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .demo-badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      padding: 2px 5px;
      border-radius: 3px;
      background: var(--vscode-badge-background, #007acc);
      color: var(--vscode-badge-foreground, #ffffff);
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

    /* Quality Gate status banner (pinned above metric cards) */
    .quality-gate {
      border-radius: 4px;
      font-size: 11px;
      line-height: 1.4;
      border: 1px solid;
      overflow: hidden;
    }

    .quality-gate-pass {
      display: block;
      background: rgba(0, 170, 94, 0.15);
      border-color: var(--sonar-green);
    }

    .quality-gate-warn {
      display: block;
      background: rgba(234, 190, 6, 0.15);
      border-color: var(--sonar-yellow);
    }

    .quality-gate-fail {
      display: block;
      background: rgba(212, 51, 63, 0.15);
      border-color: var(--sonar-red);
    }

    .quality-gate-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: transparent;
      border: none;
      color: var(--vscode-foreground);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
    }

    .quality-gate-toggle:disabled {
      cursor: default;
    }

    .quality-gate-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .quality-gate-pass .quality-gate-dot { background: var(--sonar-green); }
    .quality-gate-warn .quality-gate-dot { background: var(--sonar-yellow); }
    .quality-gate-fail .quality-gate-dot { background: var(--sonar-red); }

    .quality-gate-label { flex: 1; }

    .quality-gate-pass .quality-gate-label { color: var(--sonar-green); }
    .quality-gate-warn .quality-gate-label { color: var(--sonar-yellow); }
    .quality-gate-fail .quality-gate-label { color: var(--sonar-red); }

    .quality-gate-chevron {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      transition: transform 0.15s ease;
    }

    .quality-gate-toggle[aria-expanded="true"] .quality-gate-chevron {
      transform: rotate(90deg);
    }

    .quality-gate-conditions {
      list-style: none;
      margin: 0;
      padding: 2px 10px 8px 27px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .quality-gate-condition {
      display: flex;
      align-items: baseline;
      gap: 6px;
      color: var(--vscode-foreground);
    }

    .quality-gate-condition .condition-metric {
      font-weight: 600;
    }

    .quality-gate-condition .condition-actual {
      color: var(--vscode-descriptionForeground);
    }

    .quality-gate-condition.condition-error .condition-metric { color: var(--sonar-red); }
    .quality-gate-condition.condition-warn .condition-metric { color: var(--sonar-yellow); }

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

    /* Bento Health Rings & Container Queries */
    .health-ring-container {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .health-ring {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .health-ring-bg {
      fill: none;
      stroke: rgba(128, 128, 128, 0.2);
      stroke-width: 3.5;
    }

    .health-ring-progress {
      fill: none;
      stroke-width: 3.5;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.6s ease, stroke 0.3s ease;
    }

    .rating-ring-container {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .rating-ring-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .rating-ring-circle {
      fill: none;
      stroke-width: 2.5;
      transition: stroke 0.3s ease;
    }

    @container (max-width: 260px) {
      .health-ring-container,
      .rating-ring-container {
        width: 26px;
        height: 26px;
      }
    }

    /* Celebration & Streak Badge */
    .celebration-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 8px 0;
      padding: 6px 12px;
      background: rgba(0, 170, 94, 0.15);
      border: 1px solid var(--sonar-green);
      border-radius: 6px;
      color: var(--sonar-green);
      font-size: 11px;
      font-weight: 600;
      animation: celebration-slide-in 0.5s ease-out;
    }

    @keyframes celebration-slide-in {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .quality-gate-celebrate {
      animation: gate-pulse-glow 1.5s ease-in-out infinite alternate;
    }

    @keyframes gate-pulse-glow {
      from { box-shadow: 0 0 4px rgba(0, 170, 94, 0.3); }
      to { box-shadow: 0 0 16px rgba(0, 170, 94, 0.8); }
    }

    .confetti-canvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    }

    @media (prefers-reduced-motion: reduce) {
      .celebration-badge {
        animation: none;
      }
      .quality-gate-celebrate {
        animation: none;
        box-shadow: 0 0 8px rgba(0, 170, 94, 0.5);
      }
      .health-ring-progress {
        transition: none;
      }
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

    .section-title-actions {
      display: flex;
      align-items: center;
      gap: 8px;
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
${ISSUE_LIFECYCLE_CSS}
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

    /* Current Code tab bar */
    .tab-bar {
      display: flex;
      gap: 4px;
      padding: 4px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-radius: 6px;
    }

    .tab-btn {
      flex: 1;
      background: none;
      border: none;
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
    }

    .tab-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }

    .tab-btn.active {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    .tab-btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder) !important;
      outline-offset: 1px;
    }

    /* Code Period Switcher */
    .code-period-switcher {
      display: inline-flex;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-radius: 4px;
      padding: 2px;
      gap: 2px;
    }

    .period-btn {
      background: none;
      border: none;
      border-radius: 3px;
      padding: 2px 7px;
      font-size: 11px;
      font-weight: 500;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .period-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      color: var(--vscode-foreground);
    }

    .period-btn.active {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      font-weight: 600;
    }

    .period-btn:focus-visible {
      outline: 1px solid var(--vscode-focusBorder) !important;
      outline-offset: 1px;
    }

    .new-code-empty-notice {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--vscode-textBlockQuote-background, rgba(128, 128, 128, 0.08));
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-left: 3px solid var(--vscode-editorInfo-foreground, #3794ff);
      border-radius: 4px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .current-subbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-radius: 4px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px 12px;
      text-align: center;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
      border: 1px dashed var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
      border-radius: 6px;
    }

    .empty-state-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: center;
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
        <select id="profile-switcher" class="hidden" title="Connection profile" style="max-width: 140px; font-size: 11px; padding: 2px 4px;"></select>
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

      <button id="connect-btn" class="btn" style="width: 100%;">Connect & Verify</button>
      <div style="display: flex; align-items: center; margin: 10px 0; gap: 8px;">
        <hr style="flex: 1; border: none; border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));" />
        <span style="font-size: 10px; color: var(--vscode-descriptionForeground); text-transform: uppercase;">or</span>
        <hr style="flex: 1; border: none; border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));" />
      </div>
      <button id="try-demo-btn" class="btn btn-secondary" style="width: 100%;">⚡ Try Demo Mode (Instant Preview)</button>
    </div>

    <!-- No Profiles Empty State -->
    <div id="no-profiles-view" class="card hidden">
      <p style="font-size: 12px; line-height: 1.4; color: var(--vscode-descriptionForeground);">
        No connection profiles yet. Create one to connect to SonarQube and monitor Overall Code quality.
      </p>
      <button id="create-profile-btn" class="btn" style="width: 100%;">New Connection Profile</button>
      <div style="display: flex; align-items: center; margin: 10px 0; gap: 8px;">
        <hr style="flex: 1; border: none; border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));" />
        <span style="font-size: 10px; color: var(--vscode-descriptionForeground); text-transform: uppercase;">or</span>
        <hr style="flex: 1; border: none; border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.3));" />
      </div>
      <button id="no-profiles-demo-btn" class="btn btn-secondary" style="width: 100%;">⚡ Try Demo Mode (Instant Preview)</button>
    </div>

    <!-- Connected Dashboard View -->
    <div id="connected-view" class="${isConfigured ? '' : 'hidden'}" style="display: flex; flex-direction: column; gap: 10px;">
      <!-- Demo Mode Accent Banner -->
      <div id="demo-banner" class="demo-banner hidden">
        <div class="demo-banner-content">
          <span class="demo-badge">DEMO MODE</span>
          <span style="font-size: 11px;">Viewing sample SonarQube data</span>
        </div>
        <button id="exit-demo-btn" class="btn btn-sm btn-secondary" title="Exit Demo Mode">Exit Demo Mode</button>
      </div>
      <!-- Project & Target Agent Selector Bar -->
      <div class="card" style="padding: 8px 10px; gap: 8px;">
        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <label for="project-search-input" style="font-size: 10px;">PROJECT BINDING</label>
              <button id="manual-project-btn" class="icon-btn" title="Enter Project Key manually" aria-label="Enter Project Key manually" style="padding: 2px 4px; height: 18px;">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg>
              </button>
            </div>
          </div>
          <div class="project-selector-wrapper">
            <div class="search-input-group">
              <input id="project-search-input" type="text" placeholder="Type to search or click to pick project..." autocomplete="off" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="project-items-container" />
              <button id="project-search-toggle-btn" type="button" title="Toggle project list" aria-label="Toggle project list">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/></svg>
              </button>
            </div>
            <div id="project-dropdown-popup" class="project-dropdown-popup hidden" role="listbox" aria-label="Projects">
              <div id="project-items-container" class="project-items-container"></div>
              <div id="manual-project-item" class="project-item manual-item" role="button" tabindex="0" aria-label="Enter Project Key manually">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink: 0;"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg>
                <span>Enter Project Key manually...</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label for="target-agent-dropdown" style="font-size: 10px;">TARGET AGENT</label>
          <select id="target-agent-dropdown" style="margin-top: 3px;" aria-label="Target AI Agent">
            <option value="clipboard">Clipboard Only</option>
          </select>
        </div>
      </div>

      ${
        currentCodeEnabled
          ? `<div id="tab-bar" class="tab-bar" role="tablist" aria-label="Code scope">
        <button id="tab-overall" class="tab-btn active" role="tab" aria-selected="true">Overall Code</button>
        <button id="tab-current" class="tab-btn" role="tab" aria-selected="false">Current Code (0)</button>
      </div>`
          : ''
      }

      <div id="overall-tab-panel" style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; margin-bottom: 2px;">
        <div class="section-title">
          <span id="measures-title">${codePeriod === 'new' ? 'New Code Measures' : 'Overall Code Measures'}</span>
        </div>
        <div id="code-period-switcher" class="code-period-switcher" role="radiogroup" aria-label="Code Period">
          <button id="period-btn-overall" class="period-btn ${codePeriod === 'overall' ? 'active' : ''}" role="radio" aria-checked="${codePeriod === 'overall' ? 'true' : 'false'}" data-period="overall">Overall Code</button>
          <button id="period-btn-new" class="period-btn ${codePeriod === 'new' ? 'active' : ''}" role="radio" aria-checked="${codePeriod === 'new' ? 'true' : 'false'}" data-period="new">New Code</button>
        </div>
      </div>

      <div id="new-code-empty-notice" class="new-code-empty-notice ${codePeriod === 'new' ? '' : 'hidden'}" role="status" title="No changes detected in new code period or 0 new lines analyzed on this branch.">
        <span style="font-size: 13px;">ℹ</span>
        <span>No new code activity on this branch</span>
      </div>

      <!-- Loading State -->
      <div id="loading-indicator" class="loading-overlay ${isConfigured ? '' : 'hidden'}">
        <div class="spinner"></div>
        <span id="loading-text">Fetching ${codePeriod === 'new' ? 'New' : 'Overall'} Code measures...</span>
      </div>

      <div id="overview-error" class="alert error hidden"></div>

      <!-- Quality Gate Status Banner (pinned above metric cards) -->
      <div id="quality-gate-banner" class="quality-gate hidden" role="status" aria-label="Quality Gate status">
        <button id="quality-gate-toggle" class="quality-gate-toggle" aria-expanded="false" aria-controls="quality-gate-conditions">
          <span id="quality-gate-dot" class="quality-gate-dot"></span>
          <span id="quality-gate-label" class="quality-gate-label">Quality Gate</span>
          <span id="quality-gate-chevron" class="quality-gate-chevron">▸</span>
        </button>
        <ul id="quality-gate-conditions" class="quality-gate-conditions hidden"></ul>
      </div>

      <!-- Celebration & Streak Badge -->
      <div id="celebration-badge" class="celebration-badge hidden" role="status" aria-live="polite">
        🎉 0 Issues Reached! Clean Code streak maintained
      </div>
      <canvas id="celebration-canvas" class="confetti-canvas"></canvas>

      <!-- Metric Cards Grid (Container Query Controlled) -->
      <div id="metrics-grid" class="metrics-grid">
        <!-- Security -->
        <div class="metric-card" data-category="security" role="button" tabindex="0" aria-label="Security: open issues and rating">
          <div class="metric-info">
            <span class="metric-title">Security</span>
            <div class="metric-value-row">
              <span id="metric-security-count" class="metric-big-num">-</span>
              <span class="metric-sublabel">Open issues</span>
            </div>
          </div>
          <div class="rating-ring-container">
            <svg class="rating-ring-svg" viewBox="0 0 36 36"><circle id="ring-security" class="rating-ring-circle" cx="18" cy="18" r="15" stroke="var(--sonar-green)" /></svg>
            <div id="badge-security" class="rating-badge rating-A">A</div>
          </div>
        </div>

        <!-- Reliability -->
        <div class="metric-card" data-category="reliability" role="button" tabindex="0" aria-label="Reliability: open issues and rating">
          <div class="metric-info">
            <span class="metric-title">Reliability</span>
            <div class="metric-value-row">
              <span id="metric-reliability-count" class="metric-big-num">-</span>
              <span class="metric-sublabel">Open issues</span>
            </div>
          </div>
          <div class="rating-ring-container">
            <svg class="rating-ring-svg" viewBox="0 0 36 36"><circle id="ring-reliability" class="rating-ring-circle" cx="18" cy="18" r="15" stroke="var(--sonar-yellow)" /></svg>
            <div id="badge-reliability" class="rating-badge rating-C">C</div>
          </div>
        </div>

        <!-- Maintainability -->
        <div class="metric-card" data-category="maintainability" role="button" tabindex="0" aria-label="Maintainability: open issues and rating">
          <div class="metric-info">
            <span class="metric-title">Maintainability</span>
            <div class="metric-value-row">
              <span id="metric-maintainability-count" class="metric-big-num">-</span>
              <span class="metric-sublabel">Open issues</span>
            </div>
          </div>
          <div class="rating-ring-container">
            <svg class="rating-ring-svg" viewBox="0 0 36 36"><circle id="ring-maintainability" class="rating-ring-circle" cx="18" cy="18" r="15" stroke="var(--sonar-green)" /></svg>
            <div id="badge-maintainability" class="rating-badge rating-A">A</div>
          </div>
        </div>

        <!-- Security Hotspots -->
        <div class="metric-card" data-category="hotspots" role="button" tabindex="0" aria-label="Security Hotspots: review count and rating">
          <div class="metric-info">
            <span class="metric-title">Security Hotspots</span>
            <div class="metric-value-row">
              <span id="metric-hotspots-count" class="metric-big-num">-</span>
              <span class="metric-sublabel">To review</span>
            </div>
          </div>
          <div class="rating-ring-container">
            <svg class="rating-ring-svg" viewBox="0 0 36 36"><circle id="ring-hotspots" class="rating-ring-circle" cx="18" cy="18" r="15" stroke="var(--sonar-green)" /></svg>
            <div id="badge-hotspots" class="rating-badge rating-A">A</div>
          </div>
        </div>

        <!-- Coverage -->
        <div class="metric-card" data-category="coverage" role="button" tabindex="0" aria-label="Coverage: code coverage percentage and lines to cover">
          <div class="metric-info">
            <span class="metric-title">Coverage</span>
            <div class="metric-value-row">
              <span id="metric-coverage-percent" class="metric-big-num">-%</span>
            </div>
            <span id="metric-coverage-lines" class="metric-helper">On - lines to cover.</span>
          </div>
          <div class="health-ring-container" aria-hidden="true">
            <svg class="health-ring" viewBox="0 0 36 36">
              <circle class="health-ring-bg" cx="18" cy="18" r="14" />
              <circle id="ring-coverage" class="health-ring-progress" cx="18" cy="18" r="14" stroke-dasharray="87.96" stroke-dashoffset="87.96" stroke="var(--sonar-green)" />
            </svg>
          </div>
        </div>

        <!-- Duplications -->
        <div class="metric-card" data-category="duplications" role="button" tabindex="0" aria-label="Duplications: duplicated lines percentage">
          <div class="metric-info">
            <span class="metric-title">Duplications</span>
            <div class="metric-value-row">
              <span id="metric-duplications-percent" class="metric-big-num">-%</span>
            </div>
            <span id="metric-duplications-lines" class="metric-helper">On - lines.</span>
          </div>
          <div class="health-ring-container" aria-hidden="true">
            <svg class="health-ring" viewBox="0 0 36 36">
              <circle class="health-ring-bg" cx="18" cy="18" r="14" />
              <circle id="ring-duplications" class="health-ring-progress" cx="18" cy="18" r="14" stroke-dasharray="87.96" stroke-dashoffset="87.96" stroke="var(--sonar-green)" />
            </svg>
          </div>
        </div>

        <!-- Accepted Issues (Wide Row) -->
        <div class="metric-card metric-card-wide" data-category="accepted" role="button" tabindex="0" aria-label="Accepted issues: valid issues not fixed">
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
          <div class="section-title-actions">
            <span id="issues-list-count" class="source-badge">0 items</span>
            <label class="filter-checkbox-label" title="Select all visible issues">
              <input type="checkbox" id="select-all-checkbox" />
              <span>Select All</span>
            </label>
          </div>
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
      ${
        currentCodeEnabled
          ? `<div id="current-tab-panel" class="hidden" style="display: flex; flex-direction: column; gap: 8px;">
        <div class="current-subbar">
          <span id="current-source-label">Source: SonarLint (Live)</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <label class="filter-checkbox-label" title="Select all current issues">
              <input type="checkbox" id="current-select-all-checkbox" />
              <span>Select All</span>
            </label>
            <button id="clean-file-btn" class="btn btn-agent btn-sm hidden" title="Clean Current File with AI">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>
              Clean File with AI
            </button>
            <button id="run-full-scan-btn" class="btn btn-secondary btn-sm">Run Full Scan</button>
          </div>
        </div>
        <div id="current-loading" class="loading-overlay hidden">
          <div class="spinner"></div>
          <span>Scanning project...</span>
        </div>
        <div id="current-error" class="alert error hidden"></div>
        <div id="current-empty-sonarlint" class="empty-state hidden">
          <span>SonarLint is not installed. Install it for live Current Code feedback.</span>
          <div class="empty-state-actions">
            <button id="install-sonarlint-btn" class="btn btn-sm">Install SonarLint Extension</button>
            <button id="run-full-scan-empty-btn" class="btn btn-secondary btn-sm">Run Full Scan via CLI</button>
          </div>
        </div>
        <div id="current-empty-clean" class="empty-state hidden">
          <span>✅ No Sonar issues detected. Clean &amp; ready!</span>
        </div>
        <div id="current-issues-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
        <div id="current-batch-bar" class="batch-bar hidden">
          <span id="current-selected-count" style="font-weight: 600; font-size: 11px;">0 selected</span>
          <div style="display: flex; gap: 6px;">
            <button id="current-send-batch-btn" class="btn btn-agent btn-sm">Send to Agent</button>
            <button id="current-clear-btn" class="btn btn-secondary btn-sm">Clear</button>
          </div>
        </div>
      </div>`
          : ''
      }
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

    const loadingIndicator = document.getElementById("loading-indicator");
    const metricsGrid = document.getElementById("metrics-grid");
    const qualityGateBanner = document.getElementById("quality-gate-banner");
    const qualityGateToggle = document.getElementById("quality-gate-toggle");
    const qualityGateLabel = document.getElementById("quality-gate-label");
    const qualityGateChevron = document.getElementById("quality-gate-chevron");
    const qualityGateConditions = document.getElementById("quality-gate-conditions");

    const issuesSection = document.getElementById("issues-section");
    const issuesListTitle = document.getElementById("issues-list-title");
    const issuesListCount = document.getElementById("issues-list-count");
    const issuesLoading = document.getElementById("issues-loading");
    const issuesContainer = document.getElementById("issues-container");
    const batchActionBar = document.getElementById("batch-action-bar");
    const selectedCountLabel = document.getElementById("selected-count-label");
    const sendBatchBtn = document.getElementById("send-batch-btn");
    const deselectAllBtn = document.getElementById("deselect-all-btn");
    const selectAllCheckbox = document.getElementById("select-all-checkbox");

    const filterSeverity = document.getElementById("filter-severity");
    const filterAuthor = document.getElementById("filter-author");
    const filterFile = document.getElementById("filter-file");
    const filterRule = document.getElementById("filter-rule");
    const filterIncludeTests = document.getElementById("filter-include-tests");

    const serverUrlInput = document.getElementById("server-url");
    const userTokenInput = document.getElementById("user-token");
    const connectBtn = document.getElementById("connect-btn");
    const projectSearchInput = document.getElementById("project-search-input");
    const projectSearchToggleBtn = document.getElementById("project-search-toggle-btn");
    const projectDropdownPopup = document.getElementById("project-dropdown-popup");
    const projectItemsContainer = document.getElementById("project-items-container");
    const manualProjectItem = document.getElementById("manual-project-item");
    const targetAgentDropdown = document.getElementById("target-agent-dropdown");
    const profileSwitcher = document.getElementById("profile-switcher");
    const noProfilesView = document.getElementById("no-profiles-view");
    const createProfileBtn = document.getElementById("create-profile-btn");

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
          itemDiv.setAttribute("role", "option");
          itemDiv.setAttribute("tabindex", "0");
          itemDiv.setAttribute("aria-selected", p.key === currentSelectedProjectKey ? "true" : "false");

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

          const selectProject = () => {
            currentSelectedProjectKey = p.key;
            projectSearchInput.value = p.name + " (" + p.key + ")";
            projectDropdownPopup.classList.add("hidden");
            projectSearchInput.setAttribute("aria-expanded", "false");
            vscode.postMessage({ command: "selectProject", projectKey: p.key });
          };

          itemDiv.addEventListener("click", selectProject);
          itemDiv.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              selectProject();
            }
          });

          projectItemsContainer.appendChild(itemDiv);
        });
      }
    }

    projectSearchInput.addEventListener("focus", () => {
      projectDropdownPopup.classList.remove("hidden");
      projectSearchInput.setAttribute("aria-expanded", "true");
      renderProjectList(projectSearchInput.value);
    });

    projectSearchInput.addEventListener("input", () => {
      projectDropdownPopup.classList.remove("hidden");
      projectSearchInput.setAttribute("aria-expanded", "true");
      renderProjectList(projectSearchInput.value);
    });

    projectSearchToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (projectDropdownPopup.classList.contains("hidden")) {
        projectDropdownPopup.classList.remove("hidden");
        projectSearchInput.setAttribute("aria-expanded", "true");
        renderProjectList("");
      } else {
        projectDropdownPopup.classList.add("hidden");
        projectSearchInput.setAttribute("aria-expanded", "false");
      }
    });

    if (manualProjectItem) {
      const openPicker = () => {
        projectDropdownPopup.classList.add("hidden");
        projectSearchInput.setAttribute("aria-expanded", "false");
        vscode.postMessage({ command: "openProjectPicker" });
      };
      manualProjectItem.addEventListener("click", openPicker);
      manualProjectItem.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPicker();
        }
      });
    }

    document.addEventListener("click", (e) => {
      const wrapper = document.querySelector(".project-selector-wrapper");
      if (wrapper && !wrapper.contains(e.target)) {
        projectDropdownPopup.classList.add("hidden");
        projectSearchInput.setAttribute("aria-expanded", "false");
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
    let currentDetailPeriod = "${codePeriod}";
    let rawCategoryItems = [];
    let currentItems = [];
    const selectedItemIds = new Set();

${ISSUE_LIFECYCLE_MENU_SCRIPT}
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

    const ringCoverage = document.getElementById("ring-coverage");
    const ringDuplications = document.getElementById("ring-duplications");
    const ringSecurity = document.getElementById("ring-security");
    const ringReliability = document.getElementById("ring-reliability");
    const ringMaintainability = document.getElementById("ring-maintainability");
    const ringHotspots = document.getElementById("ring-hotspots");
    const celebrationBadge = document.getElementById("celebration-badge");
    const celebrationCanvas = document.getElementById("celebration-canvas");
    let lastGateStatus = null;

    const CIRCUMFERENCE_R14 = 87.96;

    function updateDonutRing(circleEl, percent, isCoverage) {
      if (!circleEl) return;
      const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
      const dashOffset = Math.round((CIRCUMFERENCE_R14 - (clamped / 100) * CIRCUMFERENCE_R14) * 100) / 100;
      circleEl.style.strokeDasharray = String(CIRCUMFERENCE_R14);
      circleEl.style.strokeDashoffset = String(dashOffset);

      if (isCoverage) {
        circleEl.style.stroke = clamped >= 80 ? "var(--sonar-green)" : clamped >= 50 ? "var(--sonar-yellow)" : "var(--sonar-red)";
      } else {
        circleEl.style.stroke = clamped > 10 ? "var(--sonar-red)" : clamped > 3 ? "var(--sonar-yellow)" : "var(--sonar-green)";
      }
    }

    function getRatingColorVar(rating) {
      const r = String(rating || "A").toUpperCase().trim();
      if (r === "A" || r === "1" || r === "1.0") return "var(--sonar-green)";
      if (r === "B" || r === "2" || r === "2.0") return "var(--sonar-lime)";
      if (r === "C" || r === "3" || r === "3.0") return "var(--sonar-yellow)";
      if (r === "D" || r === "4" || r === "4.0") return "var(--sonar-orange)";
      if (r === "E" || r === "5" || r === "5.0") return "var(--sonar-red)";
      return "var(--sonar-green)";
    }

    function updateRatingBadge(el, rating, ringEl) {
      el.className = "rating-badge rating-" + rating;
      el.textContent = rating;
      if (ringEl) {
        ringEl.style.stroke = getRatingColorVar(rating);
      }
    }

    function triggerCelebration(msg) {
      if (celebrationBadge) {
        celebrationBadge.textContent = "🎉 " + msg;
        celebrationBadge.classList.remove("hidden");
      }
      if (qualityGateBanner) {
        qualityGateBanner.classList.add("quality-gate-celebrate");
        setTimeout(() => {
          qualityGateBanner.classList.remove("quality-gate-celebrate");
        }, 4000);
      }
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      launchConfetti();
    }

    function launchConfetti() {
      if (!celebrationCanvas) return;
      const ctx = celebrationCanvas.getContext("2d");
      if (!ctx) return;
      celebrationCanvas.width = window.innerWidth;
      celebrationCanvas.height = window.innerHeight;

      const colors = ["#00aa5e", "#81b300", "#eabe06", "#2563eb", "#9333ea", "#06b6d4"];
      const particles = [];
      for (let i = 0; i < 35; i++) {
        particles.push({
          x: celebrationCanvas.width * (0.2 + Math.random() * 0.6),
          y: celebrationCanvas.height * 0.2,
          vx: (Math.random() - 0.5) * 6,
          vy: -Math.random() * 5 - 2,
          size: Math.random() * 5 + 3,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          rot: Math.random() * 360,
        });
      }

      let frame = 0;
      function step() {
        frame++;
        ctx.clearRect(0, 0, celebrationCanvas.width, celebrationCanvas.height);
        let alive = false;
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.2;
          p.alpha -= 0.015;
          if (p.alpha > 0) {
            alive = true;
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rot * Math.PI) / 180);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
          }
        }
        if (alive && frame < 90) {
          requestAnimationFrame(step);
        } else {
          ctx.clearRect(0, 0, celebrationCanvas.width, celebrationCanvas.height);
        }
      }
      requestAnimationFrame(step);
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
      syncSelectAllState();
    }

    function syncSelectAllState() {
      if (!selectAllCheckbox) return;
      const visibleIds = currentItems.map((i) => i.id);
      const selectedVisible = visibleIds.filter((id) => selectedItemIds.has(id)).length;
      selectAllCheckbox.disabled = visibleIds.length === 0;
      selectAllCheckbox.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
      selectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
    }

    function renderOverview(overview) {
      if (!overview) return;

      securityCount.textContent = overview.security.count;
      updateRatingBadge(badgeSecurity, overview.security.rating, ringSecurity);

      reliabilityCount.textContent = overview.reliability.count;
      updateRatingBadge(badgeReliability, overview.reliability.rating, ringReliability);

      maintainabilityCount.textContent = overview.maintainability.count;
      updateRatingBadge(badgeMaintainability, overview.maintainability.rating, ringMaintainability);

      coveragePercent.textContent = overview.coverage.percentage.toFixed(1) + "%";
      coverageLines.textContent = "On " + formatNumber(overview.coverage.linesToCover) + " lines to cover.";
      updateDonutRing(ringCoverage, overview.coverage.percentage, true);

      duplicationsPercent.textContent = overview.duplications.percentage.toFixed(1) + "%";
      duplicationsLines.textContent = "On " + formatNumber(overview.duplications.duplicatedLines) + " lines.";
      updateDonutRing(ringDuplications, overview.duplications.percentage, false);

      hotspotsCount.textContent = overview.securityHotspots.count;
      updateRatingBadge(badgeHotspots, overview.securityHotspots.rating, ringHotspots);

      if (acceptedCount && overview.acceptedIssues) {
        acceptedCount.textContent = formatNumber(overview.acceptedIssues.count);
      }

      const totalIssues =
        (overview.security.count || 0) +
        (overview.reliability.count || 0) +
        (overview.maintainability.count || 0);
      if (totalIssues === 0) {
        triggerCelebration("0 Issues Reached! Clean Code streak maintained");
      }
    }

    const QUALITY_GATE_LABELS = { OK: "PASS", WARN: "WARN", ERROR: "FAIL" };
    const QUALITY_GATE_CLASSES = {
      OK: "quality-gate-pass",
      WARN: "quality-gate-warn",
      ERROR: "quality-gate-fail",
    };
    const COMPARATOR_SYMBOLS = { LT: "<", GT: ">", LTE: "≤", GTE: "≥", EQ: "=" };

    function humanizeMetricKey(metricKey) {
      return String(metricKey || "condition")
        .replace(/^new_/, "New ")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
    }

    function formatGateCondition(condition) {
      const symbol = COMPARATOR_SYMBOLS[condition.comparator] || condition.comparator || "";
      const threshold =
        condition.status === "WARN" && condition.warnThreshold
          ? condition.warnThreshold
          : condition.errorThreshold;
      const parts = [humanizeMetricKey(condition.metricKey)];
      if (symbol && threshold !== undefined && threshold !== "") {
        parts.push(symbol, String(threshold));
      }
      let text = parts.join(" ");
      if (condition.actualValue !== undefined && condition.actualValue !== "") {
        text += " → actual " + condition.actualValue;
      }
      return text;
    }

    function renderQualityGate(status) {
      if (!qualityGateBanner || !qualityGateToggle) return;
      if (!status || !QUALITY_GATE_LABELS[status.status]) {
        qualityGateBanner.className = "quality-gate hidden";
        return;
      }

      if (lastGateStatus === "ERROR" && status.status === "OK") {
        triggerCelebration("Quality Gate Passed! Clean Code streak maintained");
      }
      lastGateStatus = status.status;

      const variant = QUALITY_GATE_CLASSES[status.status];
      qualityGateBanner.className = "quality-gate " + variant;
      if (qualityGateLabel) {
        qualityGateLabel.textContent = "Quality Gate: " + QUALITY_GATE_LABELS[status.status];
      }

      const failing = (status.conditions || []).filter(
        (c) => c.status === "ERROR" || c.status === "WARN",
      );
      if (qualityGateConditions) {
        qualityGateConditions.innerHTML = "";
        failing.forEach((condition) => {
          const li = document.createElement("li");
          li.className =
            "quality-gate-condition " +
            (condition.status === "ERROR" ? "condition-error" : "condition-warn");
          const metricSpan = document.createElement("span");
          metricSpan.className = "condition-metric";
          metricSpan.textContent = formatGateCondition(condition);
          li.appendChild(metricSpan);
          qualityGateConditions.appendChild(li);
        });
        qualityGateConditions.classList.add("hidden");
      }
      qualityGateToggle.setAttribute("aria-expanded", "false");
      qualityGateToggle.disabled = failing.length === 0;
      if (qualityGateChevron) {
        qualityGateChevron.style.visibility = failing.length === 0 ? "hidden" : "visible";
      }
    }

    if (qualityGateToggle) {
      qualityGateToggle.addEventListener("click", () => {
        if (!qualityGateConditions || qualityGateToggle.disabled) return;
        const expanded = qualityGateToggle.getAttribute("aria-expanded") === "true";
        qualityGateToggle.setAttribute("aria-expanded", String(!expanded));
        qualityGateConditions.classList.toggle("hidden", expanded);
      });
    }

    function isTestFile(filePath) {
      if (!filePath) return false;
      const normalized = filePath.split(String.fromCharCode(92)).join("/");
      if (/(?:^|[/])(?:__tests__|__test__|tests?|testing|specs?)(?:[/]|$)/i.test(normalized)) {
        return true;
      }
      const filename = normalized.split("/").pop() || "";
      return /(?:[._-](?:tests?|specs?)[.][a-z0-9]+$)|(?:(?:^|[a-z0-9])(?:Tests?|Specs?)[.][a-z0-9]+$)/i.test(filename);
    }

    function populateFilterDropdowns(items) {
      const prevAuthor = filterAuthor.value;
      const prevFile = filterFile.value;
      const prevRule = filterRule.value;

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
      checkbox.setAttribute("aria-label", "Select issue: " + item.message);
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
      jumpBtn.setAttribute("aria-label", "Jump to " + item.filePath + (item.line ? ":" + item.line : ""));
      jumpBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg><span>Jump</span>';
      jumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
      });

      const agentBtn = document.createElement("button");
      agentBtn.className = "btn btn-agent btn-sm";
      let agentBtnLabel = "Send to Agent";
      if (item.type === "COVERAGE") {
        agentBtnLabel = "⚡ Generate Unit Tests";
      } else if (item.type === "DUPLICATION") {
        agentBtnLabel = "Refactor";
      } else if (item.type === "HOTSPOT") {
        agentBtnLabel = "Review";
      }
      agentBtn.setAttribute("aria-label", agentBtnLabel + " for " + item.message);
      agentBtn.innerHTML = (item.type === "COVERAGE" ? "" : '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 4px;"><path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/></svg>') + agentBtnLabel;
      agentBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetAgentId = targetAgentDropdown.value;
        if (item.type === "COVERAGE") {
          vscode.postMessage({ command: "generateMissingTests", item, targetAgentId });
        } else {
          vscode.postMessage({ command: "sendToAgent", item, targetAgentId });
        }
      });

      actionsDiv.appendChild(jumpBtn);
      actionsDiv.appendChild(agentBtn);

${ISSUE_LIFECYCLE_CARD_BUTTON_SCRIPT}
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
        const isNewCodePeriod = currentDetailPeriod === "new";
        const emptyMsg = isNewCodePeriod
          ? "No issues in New Code period for this category."
          : "No issues match the selected filters.";
        issuesContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px;">' + emptyMsg + '</div>';
        return;
      }

      filtered.forEach((item) => {
        renderIssueCard(item);
      });
    }

    function renderIssues(items, category, period) {
      if (period) {
        currentDetailPeriod = period;
      }
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

    selectAllCheckbox.addEventListener("change", () => {
      currentItems.forEach((item) => {
        if (selectAllCheckbox.checked) {
          selectedItemIds.add(item.id);
        } else {
          selectedItemIds.delete(item.id);
        }
      });
      document.querySelectorAll(".issue-checkbox").forEach((cb) => {
        cb.checked = selectAllCheckbox.checked;
      });
      updateBatchBar();
    });

    // ---- Current Code tab ----
    const tabOverall = document.getElementById("tab-overall");
    const tabCurrent = document.getElementById("tab-current");
    const overallPanel = document.getElementById("overall-tab-panel");
    const currentPanel = document.getElementById("current-tab-panel");
    const currentIssuesContainer = document.getElementById("current-issues-container");
    const currentBatchBar = document.getElementById("current-batch-bar");
    const currentSelectedCount = document.getElementById("current-selected-count");
    const currentSendBatchBtn = document.getElementById("current-send-batch-btn");
    const currentClearBtn = document.getElementById("current-clear-btn");
    const currentSelectAllCheckbox = document.getElementById("current-select-all-checkbox");
    const currentLoading = document.getElementById("current-loading");
    const currentError = document.getElementById("current-error");
    const currentEmptySonarlint = document.getElementById("current-empty-sonarlint");
    const currentEmptyClean = document.getElementById("current-empty-clean");
    const currentSourceLabel = document.getElementById("current-source-label");
    const runFullScanBtn = document.getElementById("run-full-scan-btn");
    const cleanFileBtn = document.getElementById("clean-file-btn");
    const installSonarlintBtn = document.getElementById("install-sonarlint-btn");
    const runFullScanEmptyBtn = document.getElementById("run-full-scan-empty-btn");

    let currentCodeItems = [];
    const selectedCurrentIds = new Set();

    function setActiveTab(tab) {
      const isCurrent = tab === "currentCode";
      if (tabOverall) {
        tabOverall.classList.toggle("active", !isCurrent);
        tabOverall.setAttribute("aria-selected", String(!isCurrent));
      }
      if (tabCurrent) {
        tabCurrent.classList.toggle("active", isCurrent);
        tabCurrent.setAttribute("aria-selected", String(isCurrent));
      }
      if (overallPanel) {
        overallPanel.classList.toggle("hidden", isCurrent);
      }
      if (currentPanel) {
        currentPanel.classList.toggle("hidden", !isCurrent);
      }
    }

    function updateCurrentBatchBar() {
      if (!currentBatchBar) return;
      const count = selectedCurrentIds.size;
      if (count > 0) {
        currentBatchBar.classList.remove("hidden");
        currentSelectedCount.textContent = count + " issue" + (count > 1 ? "s" : "") + " selected";
        currentSendBatchBtn.textContent =
          "Send " + count + " Issue" + (count > 1 ? "s" : "") + " to Agent";
      } else {
        currentBatchBar.classList.add("hidden");
      }
      syncCurrentSelectAllState();
    }

    function syncCurrentSelectAllState() {
      if (!currentSelectAllCheckbox) return;
      const visibleIds = currentCodeItems.map((i) => i.id);
      const selectedVisible = visibleIds.filter((id) => selectedCurrentIds.has(id)).length;
      currentSelectAllCheckbox.disabled = visibleIds.length === 0;
      currentSelectAllCheckbox.checked = visibleIds.length > 0 && selectedVisible === visibleIds.length;
      currentSelectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visibleIds.length;
    }

    function renderCurrentIssueCard(item) {
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
      checkbox.className = "issue-checkbox current-issue-checkbox";
      checkbox.checked = selectedCurrentIds.has(item.id);
      checkbox.setAttribute("aria-label", "Select issue: " + item.message);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedCurrentIds.add(item.id);
        } else {
          selectedCurrentIds.delete(item.id);
        }
        updateCurrentBatchBar();
      });

      const msgDiv = document.createElement("div");
      msgDiv.className = "issue-message";
      msgDiv.textContent = item.message;

      bodyDiv.appendChild(checkbox);
      bodyDiv.appendChild(msgDiv);

      const badgesDiv = document.createElement("div");
      badgesDiv.className = "issue-badges";

      const severityBadge = document.createElement("span");
      severityBadge.className = "badge-tag badge-severity-" + String(item.severity || "major").toLowerCase();
      severityBadge.textContent = (item.type || "CODE_SMELL") + " (" + (item.severity || "MAJOR") + ")";
      badgesDiv.appendChild(severityBadge);

      if (item.ruleKey) {
        const ruleBadge = document.createElement("span");
        ruleBadge.className = "badge-tag";
        ruleBadge.textContent = item.ruleKey;
        badgesDiv.appendChild(ruleBadge);
      }

      const footerDiv = document.createElement("div");
      footerDiv.className = "issue-footer";

      const footerMeta = document.createElement("div");
      footerMeta.className = "issue-footer-meta";
      footerMeta.textContent = (item.line ? "L" + item.line : "File level");

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "issue-actions";

      const jumpBtn = document.createElement("button");
      jumpBtn.className = "btn btn-secondary btn-sm";
      jumpBtn.textContent = "Jump";
      jumpBtn.setAttribute("aria-label", "Jump to " + item.filePath + (item.line ? ":" + item.line : ""));
      jumpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
      });

      const agentBtn = document.createElement("button");
      agentBtn.className = "btn btn-agent btn-sm";
      agentBtn.textContent = "Send to Agent";
      agentBtn.setAttribute("aria-label", "Send to Agent for " + item.message);
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

      currentIssuesContainer.appendChild(card);
    }

    function renderCurrentCodeItems(items, sonarLintInstalled, sourceLabel) {
      currentCodeItems = items || [];
      selectedCurrentIds.clear();
      updateCurrentBatchBar();
      if (currentSourceLabel && sourceLabel) {
        currentSourceLabel.textContent = sourceLabel;
      }
      if (currentError) {
        currentError.textContent = "";
        currentError.className = "alert error hidden";
      }
      if (!currentIssuesContainer) return;
      currentIssuesContainer.innerHTML = "";
      const hasItems = currentCodeItems.length > 0;
      if (cleanFileBtn) {
        cleanFileBtn.classList.toggle("hidden", !hasItems);
      }
      if (currentEmptySonarlint) {
        currentEmptySonarlint.classList.toggle("hidden", sonarLintInstalled !== false || hasItems);
      }
      if (currentEmptyClean) {
        currentEmptyClean.classList.toggle("hidden", !(sonarLintInstalled !== false && !hasItems));
      }
      currentCodeItems.forEach(renderCurrentIssueCard);
    }

    function updateCurrentTabCount(count) {
      if (tabCurrent) {
        tabCurrent.textContent = "Current Code (" + count + ")";
      }
    }

    const measuresTitle = document.getElementById("measures-title");
    const periodBtnOverall = document.getElementById("period-btn-overall");
    const periodBtnNew = document.getElementById("period-btn-new");
    const newCodeEmptyNotice = document.getElementById("new-code-empty-notice");

    function setCodePeriodUI(period, hasNewCode) {
      currentDetailPeriod = period;
      const isNew = period === "new";
      if (measuresTitle) {
        measuresTitle.textContent = isNew ? "New Code Measures" : "Overall Code Measures";
      }
      if (periodBtnOverall && periodBtnNew) {
        periodBtnOverall.classList.toggle("active", !isNew);
        periodBtnOverall.setAttribute("aria-checked", !isNew ? "true" : "false");
        periodBtnNew.classList.toggle("active", isNew);
        periodBtnNew.setAttribute("aria-checked", isNew ? "true" : "false");
      }
      if (newCodeEmptyNotice) {
        newCodeEmptyNotice.classList.toggle("hidden", !isNew || hasNewCode !== false);
      }
    }

    if (periodBtnOverall) {
      periodBtnOverall.addEventListener("click", () => {
        vscode.postMessage({ command: "switchCodePeriod", period: "overall" });
      });
    }
    if (periodBtnNew) {
      periodBtnNew.addEventListener("click", () => {
        vscode.postMessage({ command: "switchCodePeriod", period: "new" });
      });
    }

    if (tabOverall) {
      tabOverall.addEventListener("click", () => {
        vscode.postMessage({ command: "switchTab", tab: "overallCode" });
      });
    }
    if (tabCurrent) {
      tabCurrent.addEventListener("click", () => {
        vscode.postMessage({ command: "switchTab", tab: "currentCode" });
      });
    }
    if (cleanFileBtn) {
      cleanFileBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "cleanCurrentFile" });
      });
    }
    if (runFullScanBtn) {
      runFullScanBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "runCliScan" });
      });
    }
    if (runFullScanEmptyBtn) {
      runFullScanEmptyBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "runCliScan" });
      });
    }
    if (installSonarlintBtn) {
      installSonarlintBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "installSonarLint" });
      });
    }
    if (currentSendBatchBtn) {
      currentSendBatchBtn.addEventListener("click", () => {
        const selected = currentCodeItems.filter((i) => selectedCurrentIds.has(i.id));
        if (selected.length > 0) {
          const targetAgentId = targetAgentDropdown.value;
          vscode.postMessage({ command: "sendBatchToAgent", items: selected, targetAgentId });
        }
      });
    }
    if (currentClearBtn) {
      currentClearBtn.addEventListener("click", () => {
        selectedCurrentIds.clear();
        document.querySelectorAll(".current-issue-checkbox").forEach((cb) => {
          cb.checked = false;
        });
        updateCurrentBatchBar();
      });
    }
    if (currentSelectAllCheckbox) {
      currentSelectAllCheckbox.addEventListener("change", () => {
        currentCodeItems.forEach((item) => {
          if (currentSelectAllCheckbox.checked) {
            selectedCurrentIds.add(item.id);
          } else {
            selectedCurrentIds.delete(item.id);
          }
        });
        document.querySelectorAll(".current-issue-checkbox").forEach((cb) => {
          cb.checked = currentSelectAllCheckbox.checked;
        });
        updateCurrentBatchBar();
      });
    }

    targetAgentDropdown.addEventListener("change", () => {
      vscode.postMessage({ command: "setTargetAgent", agentId: targetAgentDropdown.value });
    });

    document.querySelectorAll(".metric-card").forEach((card) => {
      const activateCard = () => {
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
      };

      card.addEventListener("click", activateCard);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activateCard();
        }
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

    profileSwitcher.addEventListener("change", () => {
      vscode.postMessage({ command: "switchProfile", profileId: profileSwitcher.value });
    });

    createProfileBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "createProfile" });
    });

    const tryDemoBtn = document.getElementById("try-demo-btn");
    if (tryDemoBtn) {
      tryDemoBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "enableDemoMode" });
      });
    }

    const noProfilesDemoBtn = document.getElementById("no-profiles-demo-btn");
    if (noProfilesDemoBtn) {
      noProfilesDemoBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "enableDemoMode" });
      });
    }

    const exitDemoBtn = document.getElementById("exit-demo-btn");
    if (exitDemoBtn) {
      exitDemoBtn.addEventListener("click", () => {
        vscode.postMessage({ command: "disableDemoMode" });
      });
    }

    const demoBanner = document.getElementById("demo-banner");

    function renderProfileSwitcher(profiles, activeProfileId) {
      if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
        profileSwitcher.classList.add("hidden");
        return;
      }
      profileSwitcher.classList.remove("hidden");
      profileSwitcher.innerHTML = "";
      profiles.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name + " · " + p.serverUrl + " · " + p.projectKey;
        opt.title = p.name + " · " + p.serverUrl + " · " + p.projectKey;
        profileSwitcher.appendChild(opt);
      });
      if (activeProfileId) {
        profileSwitcher.value = activeProfileId;
      }
    }

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
        case "qualityGate": {
          renderQualityGate(message.status);
          break;
        }
${ISSUE_LIFECYCLE_MESSAGE_SCRIPT}
        case "details": {
          renderIssues(message.items || [], message.category, message.period);
          break;
        }
        case "state": {
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          if (message.state === "connected") {
            onboardingView.classList.add("hidden");
            noProfilesView.classList.add("hidden");
            connectedView.classList.remove("hidden");
            renderProfileSwitcher(message.profiles, message.activeProfileId);

            if (message.isDemoMode) {
              demoBanner?.classList.remove("hidden");
            } else {
              demoBanner?.classList.add("hidden");
            }

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
          } else if (message.state === "no-profiles") {
            demoBanner?.classList.add("hidden");
            connectedView.classList.add("hidden");
            onboardingView.classList.add("hidden");
            noProfilesView.classList.remove("hidden");
            renderProfileSwitcher(message.profiles, message.activeProfileId);
          } else {
            demoBanner?.classList.add("hidden");
            connectedView.classList.add("hidden");
            noProfilesView.classList.add("hidden");
            onboardingView.classList.remove("hidden");
            renderProfileSwitcher(message.profiles, message.activeProfileId);
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
          if (message.message) {
            showAlert(message.message, "info");
          }
          break;
        }
        case "error": {
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          showAlert(message.message);
          if (
            currentError &&
            message.message &&
            currentPanel &&
            !currentPanel.classList.contains("hidden")
          ) {
            currentError.textContent = message.message;
            currentError.className = "alert error";
          }
          break;
        }
        case "tabState": {
          setActiveTab(message.activeTab === "currentCode" ? "currentCode" : "overallCode");
          break;
        }
        case "currentCodeItems": {
          renderCurrentCodeItems(message.items || [], message.sonarLintInstalled, message.sourceLabel);
          break;
        }
        case "currentCodeCount": {
          updateCurrentTabCount(message.count || 0);
          break;
        }
        case "scanStatus": {
          if (currentLoading) {
            currentLoading.classList.toggle("hidden", !message.scanning);
          }
          if (runFullScanBtn) {
            runFullScanBtn.disabled = !!message.scanning;
            runFullScanBtn.textContent = message.scanning ? "Scanning…" : "Run Full Scan";
          }
          break;
        }
        case "codePeriodState": {
          setCodePeriodUI(message.period, message.hasNewCode);
          break;
        }
        case "overviewUpdated": {
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
          setCodePeriodUI(
            message.period || message.overview?.period || "overall",
            message.hasNewCode ?? message.overview?.hasNewCode,
          );
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
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Human-readable past-tense label for an applied issue transition,
 * used in the success toast.
 */
function humanizeIssueTransition(transition: string): string {
  switch (transition) {
    case 'falsepositive':
      return 'marked as false positive';
    case 'wontfix':
      return `accepted (won't fix)`;
    case 'confirm':
      return 'confirmed';
    case 'unconfirm':
      return 'unconfirmed';
    case 'reopen':
      return 'reopened';
    case 'resolve':
      return 'resolved';
    default:
      return `transition "${transition}" applied`;
  }
}
