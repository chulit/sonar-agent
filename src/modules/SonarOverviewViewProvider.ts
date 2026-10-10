import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
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
          case 'configure': {
            await this.promptConfigureConnection();
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
    const demoGate = DemoData.getQualityGate(this._codePeriod);
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
      codePeriod: this._codePeriod,
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
      const demoGate = DemoData.getQualityGate(period);
      await this._view?.webview.postMessage({
        type: 'overviewUpdated',
        overview: demoOverview,
        period: this._codePeriod,
        hasNewCode: demoOverview.hasNewCode,
      });
      await this._view?.webview.postMessage({
        type: 'qualityGate',
        status: demoGate,
      });
      this.statusBar.update({
        projectKey: 'demo-sample-project',
        overview: demoOverview,
        qualityGate: demoGate,
        isDemoMode: true,
        codePeriod: this._codePeriod,
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

    const [overviewData, qualityGate] = await Promise.all([
      this.fetchProjectOverview(client, projectKey, this._codePeriod),
      (typeof client.getQualityGateStatus === 'function'
        ? client.getQualityGateStatus(projectKey, this._codePeriod)
        : Promise.resolve(null)
      ).catch((err) => {
        console.error('[SonarAgent] getQualityGateStatus error on switchCodePeriod:', err);
        return null;
      }),
    ]);

    const { overview, overviewError } = overviewData;

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

    if (qualityGate) {
      await this._view?.webview.postMessage({
        type: 'qualityGate',
        status: qualityGate,
      });
    }

    this.statusBar.update({
      projectKey,
      overview,
      qualityGate,
      isDemoMode: false,
      codePeriod: this._codePeriod,
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
        ? client.getQualityGateStatus(effectiveProjectKey, this._codePeriod)
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
        qualityGate = await client.getQualityGateStatus(resolvedProjectKey, this._codePeriod);
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
      codePeriod: this._codePeriod,
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
    const mediaDir = this._getMediaDir();

    const htmlTemplate = fs.readFileSync(path.join(mediaDir, 'webview.html'), 'utf8');
    const cssTemplate = fs.readFileSync(path.join(mediaDir, 'webview.css'), 'utf8');
    const jsTemplate = fs.readFileSync(path.join(mediaDir, 'webview.js'), 'utf8');

    const styles = cssTemplate.replace('/* {{issueLifecycleCss}} */', ISSUE_LIFECYCLE_CSS);

    const script = jsTemplate
      .replace('{{codePeriod}}', codePeriod)
      .replace('/* {{issueLifecycleMenuScript}} */', ISSUE_LIFECYCLE_MENU_SCRIPT)
      .replace('/* {{issueLifecycleCardButtonScript}} */', ISSUE_LIFECYCLE_CARD_BUTTON_SCRIPT)
      .replace('/* {{issueLifecycleMessageScript}} */', ISSUE_LIFECYCLE_MESSAGE_SCRIPT);

    const currentTabPanelHtml = currentCodeEnabled ? CURRENT_TAB_PANEL_HTML : '';
    const tabBarHtml = currentCodeEnabled ? TAB_BAR_HTML : '';

    let iconUri = '';
    if (typeof webview.asWebviewUri === 'function' && this.extensionUri) {
      try {
        iconUri = webview
          .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png'))
          .toString();
      } catch {
        iconUri = '';
      }
    }
    if (!iconUri) {
      const iconPath = path.join(mediaDir, 'icon.png');
      if (fs.existsSync(iconPath)) {
        try {
          iconUri = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
        } catch {
          iconUri = 'media/icon.png';
        }
      }
    }

    return htmlTemplate
      .replaceAll('{{cspSource}}', webview.cspSource)
      .replaceAll('{{nonce}}', nonce)
      .replaceAll('{{iconUri}}', iconUri)
      .replace('{{styles}}', styles)
      .replace('{{script}}', script)
      .replace('{{onboardingHidden}}', isConfigured ? 'hidden' : '')
      .replace('{{overviewHidden}}', isConfigured ? '' : 'hidden')
      .replace(
        '{{codePeriodMeasuresTitle}}',
        codePeriod === 'new' ? 'New Code Measures' : 'Overall Code Measures',
      )
      .replace('{{overallPeriodActive}}', codePeriod === 'overall' ? 'active' : '')
      .replace('{{overallPeriodSelected}}', codePeriod === 'overall' ? 'true' : 'false')
      .replace('{{newPeriodActive}}', codePeriod === 'new' ? 'active' : '')
      .replace('{{newPeriodSelected}}', codePeriod === 'new' ? 'true' : 'false')
      .replace('{{newPeriodNoticeHidden}}', codePeriod === 'new' ? '' : 'hidden')
      .replace('{{issuesContainerHidden}}', isConfigured ? '' : 'hidden')
      .replace('{{codePeriodLabel}}', codePeriod === 'new' ? 'New' : 'Overall')
      .replace('{{tabBar}}', tabBarHtml)
      .replace('{{currentTabPanel}}', currentTabPanelHtml);
  }

  private _getMediaDir(): string {
    if (this.extensionUri && fs.existsSync(path.join(this.extensionUri.fsPath, 'media'))) {
      return path.join(this.extensionUri.fsPath, 'media');
    }
    const relativeFromSrc = path.resolve(__dirname, '../../media');
    if (fs.existsSync(relativeFromSrc)) {
      return relativeFromSrc;
    }
    return path.resolve(__dirname, '../media');
  }
}

const TAB_BAR_HTML = `<div id="tab-bar" class="tab-bar" role="tablist" aria-label="Code scope">
        <button id="tab-overall" class="tab-btn active" role="tab" aria-selected="true">Project</button>
        <button id="tab-current" class="tab-btn" role="tab" aria-selected="false">Local Code (0)</button>
      </div>`;

const CURRENT_TAB_PANEL_HTML = `<div id="current-tab-panel" class="hidden" style="display: flex; flex-direction: column; gap: 8px;">
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
      </div>`;

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
