import * as vscode from "vscode";
import { ProjectDetector } from "./ProjectDetector.js";
import { SonarClient, SonarDetailItem, SonarOverview } from "./SonarClient.js";
import { FileNavigator } from "./FileNavigator.js";

export class SonarOverviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sonarAgent.overviewView";
  private _view?: vscode.WebviewView;
  private readonly fileNavigator: FileNavigator;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectDetector: ProjectDetector,
    fileNavigator?: FileNavigator
  ) {
    this.fileNavigator = fileNavigator ?? new FileNavigator();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "init": {
          await this._syncState();
          break;
        }
        case "connect": {
          await this._handleConnect(message.serverUrl, message.token);
          break;
        }
        case "disconnect": {
          await this._handleDisconnect();
          break;
        }
        case "selectProject": {
          if (message.projectKey) {
            await this.projectDetector.setProjectKey(message.projectKey);
            await this._syncState();
          }
          break;
        }
        case "openProjectPicker": {
          await this.promptProjectSelection();
          break;
        }
        case "fetchDetails": {
          await this._handleFetchDetails(message.category);
          break;
        }
        case "openFile": {
          await this.fileNavigator.openFileAtLine(message.filePath, message.line);
          break;
        }
        case "refresh": {
          await this._syncState();
          break;
        }
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
      vscode.window.showWarningMessage("Please connect to SonarQube first.");
      return;
    }

    const client = new SonarClient({ serverUrl: config.serverUrl, token });
    const projects = await client.fetchProjects();

    if (projects.length === 0) {
      vscode.window.showInformationMessage("No projects found on the SonarQube server.");
      return;
    }

    const items = projects.map((p) => ({
      label: p.name,
      description: p.key,
      detail: p.key === config.projectKey ? "(Currently selected)" : undefined,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select a SonarQube project for this workspace",
      matchOnDescription: true,
    });

    if (selected && selected.description) {
      await this.projectDetector.setProjectKey(selected.description);
      await this._syncState();
      vscode.window.showInformationMessage(`Active SonarQube project set to: ${selected.label}`);
    }
  }

  private async _handleFetchDetails(category: string): Promise<void> {
    if (!this._view) return;

    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();
    if (!config.serverUrl || !config.projectKey || !token) return;

    this._view.webview.postMessage({ type: "loadingDetails", loading: true });

    try {
      const client = new SonarClient({ serverUrl: config.serverUrl, token });
      let items: SonarDetailItem[] = [];

      if (category === "hotspots") {
        items = await client.getHotspots(config.projectKey);
      } else if (category === "reliability" || category === "security" || category === "maintainability") {
        items = await client.getIssues(config.projectKey, category);
      } else {
        items = await client.getIssues(config.projectKey);
      }

      this._view.webview.postMessage({
        type: "details",
        category,
        items,
      });
    } catch (err: any) {
      this._view.webview.postMessage({
        type: "detailsError",
        message: err.message || "Failed to load issues.",
      });
    } finally {
      this._view.webview.postMessage({ type: "loadingDetails", loading: false });
    }
  }

  private async _syncState(): Promise<void> {
    if (!this._view) {
      return;
    }

    const config = await this.projectDetector.getConfig();
    const token = await this.projectDetector.getToken();

    if (config.serverUrl && config.hasToken && token) {
      this._view.webview.postMessage({ type: "loading", loading: true });

      const client = new SonarClient({ serverUrl: config.serverUrl, token });
      const projects = await client.fetchProjects();

      let effectiveProjectKey = config.projectKey;
      if (!effectiveProjectKey && projects.length > 0) {
        effectiveProjectKey = projects[0].key;
        await this.projectDetector.setProjectKey(effectiveProjectKey);
      }

      let overview: SonarOverview | null = null;
      let overviewError: string | undefined;

      if (effectiveProjectKey) {
        try {
          overview = await client.getOverview(effectiveProjectKey);
        } catch (err: any) {
          overviewError = err.message || "Failed to fetch project measures.";
        }
      }

      this._view.webview.postMessage({
        type: "state",
        state: "connected",
        serverUrl: config.serverUrl,
        projectKey: effectiveProjectKey,
        detectedFromProperties: config.detectedFromProperties ?? false,
        hasPlaintextWarning: config.hasPlaintextCredentialsWarning ?? false,
        projects,
        overview,
        overviewError,
      });

      this._view.webview.postMessage({ type: "loading", loading: false });
    } else {
      this._view.webview.postMessage({
        type: "state",
        state: "onboarding",
        serverUrl: config.serverUrl || "http://localhost:9000",
      });
    }
  }

  private async _handleConnect(serverUrl: string, token: string): Promise<void> {
    if (!serverUrl || !token) {
      this._view?.webview.postMessage({
        type: "error",
        message: "Server URL and User Token are required.",
      });
      return;
    }

    this._view?.webview.postMessage({ type: "connecting" });

    const client = new SonarClient({ serverUrl, token });
    const result = await client.verifyConnection();

    if (!result.ok) {
      this._view?.webview.postMessage({
        type: "error",
        message: result.message || "Connection verification failed.",
      });
      return;
    }

    await this.projectDetector.setServerUrl(serverUrl);
    await this.projectDetector.setToken(token);

    vscode.window.showInformationMessage("SonarQube connection successfully verified!");

    await this._syncState();
  }

  private async _handleDisconnect(): Promise<void> {
    await this.projectDetector.deleteToken();
    vscode.window.showInformationMessage("Disconnected from SonarQube.");
    await this._syncState();
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
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

    /* Tabs SonarQube Style */
    .tabs-nav {
      display: flex;
      border-bottom: 1px solid var(--sonar-border);
      gap: 8px;
    }

    .tab-item {
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      display: flex;
      align-items: center;
      gap: 6px;
      user-select: none;
    }

    .tab-item.active {
      color: var(--vscode-foreground);
      border-bottom-color: var(--sonar-blue);
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
    }

    .metric-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
      border-radius: 6px;
      padding: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: border-color 0.15s ease, transform 0.1s ease;
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
    }

    .metric-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
    }

    .metric-value-row {
      display: flex;
      align-items: baseline;
      gap: 5px;
    }

    .metric-big-num {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.1;
      color: var(--vscode-foreground);
    }

    .metric-sublabel {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .metric-helper {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
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
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 2.5px solid var(--sonar-green);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .dot-inner {
      width: 6px;
      height: 6px;
      background: var(--sonar-green);
      border-radius: 50%;
    }

    .clock-badge {
      width: 24px;
      height: 24px;
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
      gap: 4px;
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
        <button id="header-refresh-btn" class="icon-btn" title="Refresh measures">⟳</button>
        <button id="header-disconnect-btn" class="icon-btn" title="Disconnect server">⏻</button>
      </div>
    </div>

    <!-- Onboarding Form -->
    <div id="onboarding-view" class="card">
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
    <div id="connected-view" class="hidden" style="display: flex; flex-direction: column; gap: 10px;">
      <!-- Project Selector Bar -->
      <div class="card" style="padding: 8px 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <label style="font-size: 10px;">PROJECT BINDING</label>
          <span id="detected-badge" class="source-badge hidden">sonar-project.properties</span>
        </div>
        <select id="project-dropdown">
          <option value="">Loading projects...</option>
        </select>
      </div>

      <div id="plaintext-warning" class="alert warning hidden">
        ⚠️ Warning: Plaintext credentials found in sonar-project.properties. Please remove them to avoid leaking secrets.
      </div>

      <!-- Sonar Tabs -->
      <div class="tabs-nav">
        <div class="tab-item">
          New Code
        </div>
        <div class="tab-item active">
          Overall Code
        </div>
      </div>

      <!-- Loading State -->
      <div id="loading-indicator" class="loading-overlay hidden">
        <div class="spinner"></div>
        <span>Fetching Overall Code measures...</span>
      </div>

      <div id="overview-error" class="alert error"></div>

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

        <!-- Accepted Issues -->
        <div class="metric-card" data-category="accepted">
          <div class="metric-info">
            <span class="metric-title">Accepted issues</span>
            <div class="metric-value-row">
              <span id="metric-accepted-count" class="metric-big-num">0</span>
            </div>
            <span class="metric-helper">Valid issues not fixed</span>
          </div>
          <div class="clock-badge">⏱</div>
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

        <!-- Security Hotspots -->
        <div class="metric-card" data-category="hotspots">
          <div class="metric-info">
            <span class="metric-title">Security Hotspots</span>
            <div class="metric-value-row">
              <span id="metric-hotspots-count" class="metric-big-num">-</span>
            </div>
          </div>
          <div id="badge-hotspots" class="rating-badge rating-A">A</div>
        </div>
      </div>

      <!-- Issues Drilldown Section -->
      <div id="issues-section" class="issues-section hidden">
        <div class="section-title">
          <span id="issues-list-title">Issues</span>
          <span id="issues-list-count" class="source-badge">0 items</span>
        </div>

        <div id="issues-loading" class="loading-overlay hidden">
          <div class="spinner"></div>
          <span>Loading issues list...</span>
        </div>

        <div id="issues-container" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const onboardingView = document.getElementById("onboarding-view");
    const connectedView = document.getElementById("connected-view");
    const alertBox = document.getElementById("alert-box");
    const overviewError = document.getElementById("overview-error");
    const plaintextWarning = document.getElementById("plaintext-warning");
    const loadingIndicator = document.getElementById("loading-indicator");
    const metricsGrid = document.getElementById("metrics-grid");

    const issuesSection = document.getElementById("issues-section");
    const issuesListTitle = document.getElementById("issues-list-title");
    const issuesListCount = document.getElementById("issues-list-count");
    const issuesLoading = document.getElementById("issues-loading");
    const issuesContainer = document.getElementById("issues-container");

    const serverUrlInput = document.getElementById("server-url");
    const userTokenInput = document.getElementById("user-token");
    const connectBtn = document.getElementById("connect-btn");
    const headerRefreshBtn = document.getElementById("header-refresh-btn");
    const headerDisconnectBtn = document.getElementById("header-disconnect-btn");
    const projectDropdown = document.getElementById("project-dropdown");
    const detectedBadge = document.getElementById("detected-badge");

    // Metric DOM elements
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

    let activeCategory = null;

    function showAlert(msg) {
      alertBox.textContent = msg;
      alertBox.className = "alert error";
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
    }

    function renderIssues(items, category) {
      issuesSection.classList.remove("hidden");
      issuesListTitle.textContent = category.toUpperCase() + " ISSUES";
      issuesListCount.textContent = items.length + " items";
      issuesContainer.innerHTML = "";

      if (items.length === 0) {
        issuesContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px;">No issues found in this category.</div>';
        return;
      }

      items.forEach((item) => {
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
        checkbox.dataset.issueId = item.id;

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
        jumpBtn.textContent = "👁 Jump";
        jumpBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          vscode.postMessage({ command: "openFile", filePath: item.filePath, line: item.line });
        });

        actionsDiv.appendChild(jumpBtn);
        footerDiv.appendChild(footerMeta);
        footerDiv.appendChild(actionsDiv);

        card.appendChild(pathDiv);
        card.appendChild(bodyDiv);
        card.appendChild(badgesDiv);
        card.appendChild(footerDiv);

        issuesContainer.appendChild(card);
      });
    }

    // Add click listeners to metric cards to trigger drilldown
    document.querySelectorAll(".metric-card").forEach((card) => {
      card.addEventListener("click", () => {
        const cat = card.dataset.category;
        if (!cat || cat === "accepted") return;

        document.querySelectorAll(".metric-card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        activeCategory = cat;

        issuesContainer.innerHTML = "";
        issuesLoading.classList.remove("hidden");
        issuesSection.classList.remove("hidden");
        issuesListTitle.textContent = cat.toUpperCase();

        vscode.postMessage({ command: "fetchDetails", category: cat });
      });
    });

    connectBtn.addEventListener("click", () => {
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
    });

    projectDropdown.addEventListener("change", () => {
      const selectedKey = projectDropdown.value;
      if (selectedKey) {
        vscode.postMessage({ command: "selectProject", projectKey: selectedKey });
      }
    });

    headerRefreshBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "refresh" });
      if (activeCategory) {
        vscode.postMessage({ command: "fetchDetails", category: activeCategory });
      }
    });

    headerDisconnectBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "disconnect" });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
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
            onboardingView.classList.add("hidden");
            connectedView.classList.remove("hidden");

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

            projectDropdown.innerHTML = "";
            const projects = message.projects || [];
            if (projects.length === 0) {
              const opt = document.createElement("option");
              opt.value = message.projectKey || "";
              opt.textContent = message.projectKey || "No projects found";
              projectDropdown.appendChild(opt);
            } else {
              projects.forEach((proj) => {
                const opt = document.createElement("option");
                opt.value = proj.key;
                opt.textContent = proj.name + " (" + proj.key + ")";
                if (proj.key === message.projectKey) {
                  opt.selected = true;
                }
                projectDropdown.appendChild(opt);
              });
            }

            if (message.overviewError) {
              overviewError.textContent = message.overviewError;
              overviewError.className = "alert error";
            } else if (message.overview) {
              overviewError.className = "alert";
              renderOverview(message.overview);
            }
          } else {
            connectedView.classList.add("hidden");
            onboardingView.classList.remove("hidden");
            if (message.serverUrl) {
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
        case "error": {
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          showAlert(message.message);
          break;
        }
      }
    });

    vscode.postMessage({ command: "init" });
  </script>
</body>
</html>`;
  }
}
