"use strict";var x=Object.create;var v=Object.defineProperty;var j=Object.getOwnPropertyDescriptor;var P=Object.getOwnPropertyNames;var C=Object.getPrototypeOf,S=Object.prototype.hasOwnProperty;var U=(r,e)=>{for(var t in e)v(r,t,{get:e[t],enumerable:!0})},w=(r,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of P(e))!S.call(r,o)&&o!==t&&v(r,o,{get:()=>e[o],enumerable:!(n=j(e,o))||n.enumerable});return r};var u=(r,e,t)=>(t=r!=null?x(C(r)):{},w(e||!r||!r.__esModule?v(t,"default",{value:r,enumerable:!0}):t,r)),B=r=>w(v({},"__esModule",{value:!0}),r);var F={};U(F,{activate:()=>T,deactivate:()=>E});module.exports=B(F);var i=u(require("vscode"));var y=u(require("node:path")),k=u(require("node:fs/promises")),m="sonarAgent.token",f=class r{secrets;config;workspaceRoot;readFileFn;constructor(e){this.secrets=e.secretStorage,this.config=e.workspaceConfig,this.workspaceRoot=e.workspaceRoot,this.readFileFn=e.readFileFn??(t=>k.readFile(t,"utf-8"))}static parseProperties(e){let t=e.split(/\r?\n/),n,o,s=!1;for(let c of t){let a=c.trim();if(!a||a.startsWith("#")||a.startsWith(";"))continue;let h=a.indexOf("=");if(h===-1)continue;let p=a.slice(0,h).trim(),b=a.slice(h+1).trim();p==="sonar.projectKey"?n=b:p==="sonar.host.url"?o=b:(p==="sonar.login"||p==="sonar.password"||p==="sonar.token")&&(s=!0)}return{projectKey:n,serverUrl:o,hasPlaintextCredentials:s}}async getToken(){return this.secrets.get(m)}async setToken(e){await this.secrets.store(m,e)}async deleteToken(){await this.secrets.delete(m)}async setServerUrl(e){await this.config.update("serverUrl",e,!0)}async setProjectKey(e){await this.config.update("projectKey",e,!0)}async detectWorkspaceProperties(){if(!this.workspaceRoot)return null;let e=y.join(this.workspaceRoot,"sonar-project.properties");try{let t=await this.readFileFn(e);return r.parseProperties(t)}catch{return null}}async getConfig(){let e=this.config.get("serverUrl",""),t=this.config.get("projectKey",""),n=!1,o=!1,s=await this.detectWorkspaceProperties();s&&(s.projectKey&&(t=s.projectKey,n=!0),!e&&s.serverUrl&&(e=s.serverUrl),s.hasPlaintextCredentials&&(o=!0));let c=await this.getToken();return{serverUrl:e,projectKey:t,hasToken:!!(c&&c.trim().length>0),detectedFromProperties:n,hasPlaintextCredentialsWarning:o}}};var d=u(require("vscode"));var l=class{serverUrl;token;fetchFn;constructor(e){this.serverUrl=e.serverUrl.replace(/\/+$/,""),this.token=e.token,this.fetchFn=e.fetchFn??globalThis.fetch}getAuthHeader(){return this.token?{Authorization:`Basic ${Buffer.from(`${this.token}:`).toString("base64")}`}:{}}async verifyConnection(){try{let e=`${this.serverUrl}/api/authentication/validate`,t=await this.fetchFn(e,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(t.status===401||t.status===403)return{ok:!1,message:`Authentication failed (HTTP ${t.status}). Please verify your token.`};if(!t.ok)return{ok:!1,message:`Server returned HTTP ${t.status}: ${t.statusText}`};let n=await t.json();return n&&n.valid===!0?{ok:!0}:{ok:!1,message:"Invalid credentials: SonarQube reported token as invalid."}}catch(e){return{ok:!1,message:`Cannot reach SonarQube server at ${this.serverUrl}: ${e.message||String(e)}`}}}async fetchProjects(){try{let e=`${this.serverUrl}/api/projects/search?ps=100`,t=await this.fetchFn(e,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(!t.ok)throw new Error(`HTTP ${t.status}: ${t.statusText}`);return((await t.json()).components||[]).map(o=>({key:o.key,name:o.name||o.key}))}catch(e){return console.error("Failed to fetch SonarQube projects:",e.message),[]}}};var g=class{constructor(e,t){this.extensionUri=e;this.projectDetector=t}static viewType="sonarAgent.overviewView";_view;resolveWebviewView(e,t,n){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtmlForWebview(e.webview),e.webview.onDidReceiveMessage(async o=>{switch(o.command){case"init":{await this._syncState();break}case"connect":{await this._handleConnect(o.serverUrl,o.token);break}case"disconnect":{await this._handleDisconnect();break}case"selectProject":{o.projectKey&&(await this.projectDetector.setProjectKey(o.projectKey),await this._syncState());break}case"openProjectPicker":{await this.promptProjectSelection();break}case"refresh":{await this._syncState();break}}})}async refresh(){this._view&&await this._syncState()}async promptProjectSelection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!e.serverUrl||!t){d.window.showWarningMessage("Please connect to SonarQube first.");return}let o=await new l({serverUrl:e.serverUrl,token:t}).fetchProjects();if(o.length===0){d.window.showInformationMessage("No projects found on the SonarQube server.");return}let s=o.map(a=>({label:a.name,description:a.key,detail:a.key===e.projectKey?"(Currently selected)":void 0})),c=await d.window.showQuickPick(s,{placeHolder:"Select a SonarQube project for this workspace",matchOnDescription:!0});c&&c.description&&(await this.projectDetector.setProjectKey(c.description),await this._syncState(),d.window.showInformationMessage(`Active SonarQube project set to: ${c.label}`))}async _syncState(){if(!this._view)return;let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(e.serverUrl&&e.hasToken&&t){let o=await new l({serverUrl:e.serverUrl,token:t}).fetchProjects(),s=e.projectKey;!s&&o.length>0&&(s=o[0].key,await this.projectDetector.setProjectKey(s)),this._view.webview.postMessage({type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:s,detectedFromProperties:e.detectedFromProperties??!1,hasPlaintextWarning:e.hasPlaintextCredentialsWarning??!1,projects:o})}else this._view.webview.postMessage({type:"state",state:"onboarding",serverUrl:e.serverUrl||"http://localhost:9000"})}async _handleConnect(e,t){if(!e||!t){this._view?.webview.postMessage({type:"error",message:"Server URL and User Token are required."});return}this._view?.webview.postMessage({type:"connecting"});let o=await new l({serverUrl:e,token:t}).verifyConnection();if(!o.ok){this._view?.webview.postMessage({type:"error",message:o.message||"Connection verification failed."});return}await this.projectDetector.setServerUrl(e),await this.projectDetector.setToken(t),d.window.showInformationMessage("SonarQube connection successfully verified!"),await this._syncState()}async _handleDisconnect(){await this.projectDetector.deleteToken(),d.window.showInformationMessage("Disconnected from SonarQube."),await this._syncState()}_getHtmlForWebview(e){return`<!DOCTYPE html>
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
      --sonar-yellow: #eabe06;
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

    input[type="text"], input[type="password"], select {
      width: 100%;
      padding: 7px 9px;
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

    .alert.warning {
      display: block;
      background: rgba(234, 190, 6, 0.15);
      border: 1px solid var(--sonar-yellow);
      color: var(--sonar-yellow);
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

    .source-badge {
      display: inline-flex;
      font-size: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      padding: 2px 6px;
      border-radius: 3px;
      margin-left: 6px;
      font-weight: normal;
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
        <input type="text" id="server-url" placeholder="http://localhost:9000" spellcheck="false" autocomplete="off" />
      </div>

      <div class="form-group">
        <label for="user-token">User Token</label>
        <input type="password" id="user-token" placeholder="Enter SonarQube User Token" spellcheck="false" autocomplete="off" />
      </div>

      <button id="connect-btn" class="btn">Connect & Verify</button>
    </div>

    <!-- Connected State View -->
    <div id="connected-view" class="card hidden">
      <div class="status-badge">
        <div class="status-dot"></div>
        Connected to SonarQube
      </div>

      <div id="plaintext-warning" class="alert warning hidden">
        \u26A0\uFE0F Warning: Plaintext credentials found in sonar-project.properties. Please remove them and use secure token storage to avoid leaking secrets.
      </div>

      <div class="connected-info">
        <span>SERVER</span>
        <strong id="connected-server-url">-</strong>
      </div>

      <div class="connected-info">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span>PROJECT BINDING</span>
          <span id="detected-badge" class="source-badge hidden">sonar-project.properties</span>
        </div>
        <div style="margin-top: 4px;">
          <select id="project-dropdown">
            <option value="">Loading projects...</option>
          </select>
        </div>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 6px;">
        <button id="change-project-btn" class="btn btn-secondary" style="flex: 1;">Pick Project</button>
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
    const plaintextWarning = document.getElementById("plaintext-warning");
    const serverUrlInput = document.getElementById("server-url");
    const userTokenInput = document.getElementById("user-token");
    const connectBtn = document.getElementById("connect-btn");
    const disconnectBtn = document.getElementById("disconnect-btn");
    const refreshBtn = document.getElementById("refresh-btn");
    const changeProjectBtn = document.getElementById("change-project-btn");
    const connectedServerUrl = document.getElementById("connected-server-url");
    const projectDropdown = document.getElementById("project-dropdown");
    const detectedBadge = document.getElementById("detected-badge");

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

    projectDropdown.addEventListener("change", () => {
      const selectedKey = projectDropdown.value;
      if (selectedKey) {
        vscode.postMessage({ command: "selectProject", projectKey: selectedKey });
      }
    });

    changeProjectBtn.addEventListener("click", () => {
      vscode.postMessage({ command: "openProjectPicker" });
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

            // Populate projects dropdown
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
</html>`}};function T(r){let e=i.workspace.workspaceFolders?.[0]?.uri.fsPath,t=i.workspace.getConfiguration("sonarAgent"),n=new f({secretStorage:r.secrets,workspaceConfig:t,workspaceRoot:e}),o=new g(r.extensionUri,n);r.subscriptions.push(i.window.registerWebviewViewProvider(g.viewType,o)),r.subscriptions.push(i.commands.registerCommand("sonarAgent.refresh",async()=>{await o.refresh()})),r.subscriptions.push(i.commands.registerCommand("sonarAgent.configure",async()=>{await i.commands.executeCommand("sonarAgent.overviewView.focus")})),r.subscriptions.push(i.commands.registerCommand("sonarAgent.selectProject",async()=>{await o.promptProjectSelection()})),r.subscriptions.push(i.commands.registerCommand("sonarAgent.resetConnection",async()=>{await i.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await n.deleteToken(),await o.refresh(),i.window.showInformationMessage("SonarQube credentials have been removed."))}))}function E(){}0&&(module.exports={activate,deactivate});
