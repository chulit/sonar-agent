import * as vscode from "vscode";
import { ProjectDetector } from "./ProjectDetector.js";
import { SonarClient } from "./SonarClient.js";

export class SonarOverviewViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "sonarAgent.overviewView";
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly projectDetector: ProjectDetector
  ) {}

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

  private async _syncState(): Promise<void> {
    if (!this._view) {
      return;
    }

    const config = await this.projectDetector.getConfig();
    if (config.serverUrl && config.hasToken) {
      this._view.webview.postMessage({
        type: "state",
        state: "connected",
        serverUrl: config.serverUrl,
        projectKey: config.projectKey,
      });
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
      --sonar-red: #d4333f;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      padding: 12px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background-color: var(--vscode-sideBar-background);
    }

    .container {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
    }

    .header-icon {
      width: 20px;
      height: 20px;
      color: var(--sonar-blue);
    }

    .header h2 {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
      border-radius: 6px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    label {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
    }

    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 7px 9px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      font-size: 12px;
      outline: none;
    }

    input[type="text"]:focus, input[type="password"]:focus {
      border-color: var(--vscode-focusBorder);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 14px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      transition: background 0.15s ease;
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

    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
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

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: var(--sonar-green);
      background: rgba(0, 170, 94, 0.12);
      padding: 4px 8px;
      border-radius: 4px;
      align-self: flex-start;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--sonar-green);
    }

    .connected-info {
      font-size: 12px;
      line-height: 1.6;
    }

    .connected-info span {
      color: var(--vscode-descriptionForeground);
      display: block;
      font-size: 11px;
    }

    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/>
        <path d="M12 6a6 6 0 1 0 6 6 6 6 0 0 0-6-6z"/>
        <circle cx="12" cy="12" r="2"/>
        <line x1="12" y1="12" x2="19" y2="5"/>
      </svg>
      <h2>Sonar Agent</h2>
    </div>

    <!-- Onboarding Form -->
    <div id="onboarding-view" class="card">
      <p style="font-size: 12px; line-height: 1.4; color: var(--vscode-descriptionForeground);">
        Connect to your SonarQube server to monitor Overall Code quality and delegate fixes to AI Agents.
      </p>

      <div id="alert-box" class="alert"></div>

      <div class="form-group">
        <label for="server-url">SonarQube Server URL</label>
        <input type="text" id="server-url" placeholder="http://localhost:9000" spellcheck="false" />
      </div>

      <div class="form-group">
        <label for="user-token">User Token</label>
        <input type="password" id="user-token" placeholder="Enter SonarQube User Token" spellcheck="false" />
      </div>

      <button id="connect-btn" class="btn">Connect & Verify</button>
    </div>

    <!-- Connected State View -->
    <div id="connected-view" class="card hidden">
      <div class="status-badge">
        <div class="status-dot"></div>
        Connected to SonarQube
      </div>

      <div class="connected-info">
        <span>SERVER</span>
        <strong id="connected-server-url">-</strong>
      </div>

      <div class="connected-info">
        <span>PROJECT BINDING</span>
        <strong id="connected-project-key">Auto-detecting...</strong>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 6px;">
        <button id="refresh-btn" class="btn btn-secondary" style="flex: 1;">Refresh</button>
        <button id="disconnect-btn" class="btn btn-secondary" style="flex: 1;">Disconnect</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    const onboardingView = document.getElementById("onboarding-view");
    const connectedView = document.getElementById("connected-view");
    const alertBox = document.getElementById("alert-box");
    const serverUrlInput = document.getElementById("server-url");
    const userTokenInput = document.getElementById("user-token");
    const connectBtn = document.getElementById("connect-btn");
    const disconnectBtn = document.getElementById("disconnect-btn");
    const refreshBtn = document.getElementById("refresh-btn");
    const connectedServerUrl = document.getElementById("connected-server-url");
    const connectedProjectKey = document.getElementById("connected-project-key");

    function showAlert(msg) {
      alertBox.textContent = msg;
      alertBox.className = "alert error";
    }

    function clearAlert() {
      alertBox.textContent = "";
      alertBox.className = "alert";
    }

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

    disconnectBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "disconnect" });
    });

    refreshBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "refresh" });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      switch (message.type) {
        case "state": {
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect & Verify";
          if (message.state === "connected") {
            onboardingView.classList.add("hidden");
            connectedView.classList.remove("hidden");
            connectedServerUrl.textContent = message.serverUrl;
            connectedProjectKey.textContent = message.projectKey || "No project selected yet";
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

    // Notify extension host that webview is loaded
    vscode.postMessage({ command: "init" });
  </script>
</body>
</html>`;
  }
}
