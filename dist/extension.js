"use strict";var k=Object.create;var u=Object.defineProperty;var j=Object.getOwnPropertyDescriptor;var C=Object.getOwnPropertyNames;var P=Object.getPrototypeOf,S=Object.prototype.hasOwnProperty;var B=(o,e)=>{for(var t in e)u(o,t,{get:e[t],enumerable:!0})},y=(o,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of C(e))!S.call(o,r)&&r!==t&&u(o,r,{get:()=>e[r],enumerable:!(i=j(e,r))||i.enumerable});return o};var m=(o,e,t)=>(t=o!=null?k(P(o)):{},y(e||!o||!o.__esModule?u(t,"default",{value:o,enumerable:!0}):t,o)),E=o=>y(u({},"__esModule",{value:!0}),o);var F={};B(F,{activate:()=>T,deactivate:()=>I});module.exports=E(F);var c=m(require("vscode"));var w=m(require("node:path")),x=m(require("node:fs/promises")),f="sonarAgent.token",b=class o{secrets;config;workspaceRoot;readFileFn;constructor(e){this.secrets=e.secretStorage,this.config=e.workspaceConfig,this.workspaceRoot=e.workspaceRoot,this.readFileFn=e.readFileFn??(t=>x.readFile(t,"utf-8"))}static parseProperties(e){let t=e.split(/\r?\n/),i,r,s=!1;for(let n of t){let a=n.trim();if(!a||a.startsWith("#")||a.startsWith(";"))continue;let p=a.indexOf("=");if(p===-1)continue;let g=a.slice(0,p).trim(),h=a.slice(p+1).trim();g==="sonar.projectKey"?i=h:g==="sonar.host.url"?r=h:(g==="sonar.login"||g==="sonar.password"||g==="sonar.token")&&(s=!0)}return{projectKey:i,serverUrl:r,hasPlaintextCredentials:s}}async getToken(){return this.secrets.get(f)}async setToken(e){await this.secrets.store(f,e)}async deleteToken(){await this.secrets.delete(f)}async setServerUrl(e){await this.config.update("serverUrl",e,!0)}async setProjectKey(e){await this.config.update("projectKey",e,!0)}async detectWorkspaceProperties(){if(!this.workspaceRoot)return null;let e=w.join(this.workspaceRoot,"sonar-project.properties");try{let t=await this.readFileFn(e);return o.parseProperties(t)}catch{return null}}async getConfig(){let e=this.config.get("serverUrl",""),t=this.config.get("projectKey",""),i=!1,r=!1,s=await this.detectWorkspaceProperties();s&&(s.projectKey&&(t=s.projectKey,i=!0),!e&&s.serverUrl&&(e=s.serverUrl),s.hasPlaintextCredentials&&(r=!0));let n=await this.getToken();return{serverUrl:e,projectKey:t,hasToken:!!(n&&n.trim().length>0),detectedFromProperties:i,hasPlaintextCredentialsWarning:r}}};var d=m(require("vscode"));var l=class{serverUrl;token;fetchFn;constructor(e){this.serverUrl=e.serverUrl.replace(/\/+$/,""),this.token=e.token,this.fetchFn=e.fetchFn??globalThis.fetch}getAuthHeader(){return this.token?{Authorization:`Basic ${Buffer.from(`${this.token}:`).toString("base64")}`}:{}}parseRating(e){let t=typeof e=="number"?e:parseFloat(String(e||"1.0"));return t<=1?"A":t<=2?"B":t<=3?"C":t<=4?"D":"E"}async verifyConnection(){try{let e=`${this.serverUrl}/api/authentication/validate`,t=await this.fetchFn(e,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(t.status===401||t.status===403)return{ok:!1,message:`Authentication failed (HTTP ${t.status}). Please verify your token.`};if(!t.ok)return{ok:!1,message:`Server returned HTTP ${t.status}: ${t.statusText}`};let i=await t.json();return i&&i.valid===!0?{ok:!0}:{ok:!1,message:"Invalid credentials: SonarQube reported token as invalid."}}catch(e){return{ok:!1,message:`Cannot reach SonarQube server at ${this.serverUrl}: ${e.message||String(e)}`}}}async fetchProjects(){try{let e=`${this.serverUrl}/api/projects/search?ps=100`,t=await this.fetchFn(e,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(!t.ok)throw new Error(`HTTP ${t.status}: ${t.statusText}`);return((await t.json()).components||[]).map(r=>({key:r.key,name:r.name||r.key}))}catch(e){return console.error("Failed to fetch SonarQube projects:",e.message),[]}}async getOverview(e){let t=["bugs","reliability_rating","vulnerabilities","security_rating","code_smells","sqale_rating","coverage","lines_to_cover","duplicated_lines_density","duplicated_lines","security_hotspots"].join(","),i=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${t}`,r=await this.fetchFn(i,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(!r.ok)throw new Error(`Failed to fetch measures: HTTP ${r.status} ${r.statusText}`);let s=await r.json(),n={};for(let a of s.component?.measures||[])a.value!==void 0&&(n[a.metric]=a.value);return{security:{count:parseInt(n.vulnerabilities||"0",10),rating:this.parseRating(n.security_rating)},reliability:{count:parseInt(n.bugs||"0",10),rating:this.parseRating(n.reliability_rating)},maintainability:{count:parseInt(n.code_smells||"0",10),rating:this.parseRating(n.sqale_rating)},acceptedIssues:{count:0},coverage:{percentage:parseFloat(n.coverage||"0"),linesToCover:parseInt(n.lines_to_cover||"0",10)},duplications:{percentage:parseFloat(n.duplicated_lines_density||"0"),duplicatedLines:parseInt(n.duplicated_lines||"0",10)},securityHotspots:{count:parseInt(n.security_hotspots||"0",10),rating:"A"}}}};var v=class{constructor(e,t){this.extensionUri=e;this.projectDetector=t}static viewType="sonarAgent.overviewView";_view;resolveWebviewView(e,t,i){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtmlForWebview(e.webview),e.webview.onDidReceiveMessage(async r=>{switch(r.command){case"init":{await this._syncState();break}case"connect":{await this._handleConnect(r.serverUrl,r.token);break}case"disconnect":{await this._handleDisconnect();break}case"selectProject":{r.projectKey&&(await this.projectDetector.setProjectKey(r.projectKey),await this._syncState());break}case"openProjectPicker":{await this.promptProjectSelection();break}case"refresh":{await this._syncState();break}}})}async refresh(){this._view&&await this._syncState()}async promptProjectSelection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!e.serverUrl||!t){d.window.showWarningMessage("Please connect to SonarQube first.");return}let r=await new l({serverUrl:e.serverUrl,token:t}).fetchProjects();if(r.length===0){d.window.showInformationMessage("No projects found on the SonarQube server.");return}let s=r.map(a=>({label:a.name,description:a.key,detail:a.key===e.projectKey?"(Currently selected)":void 0})),n=await d.window.showQuickPick(s,{placeHolder:"Select a SonarQube project for this workspace",matchOnDescription:!0});n&&n.description&&(await this.projectDetector.setProjectKey(n.description),await this._syncState(),d.window.showInformationMessage(`Active SonarQube project set to: ${n.label}`))}async _syncState(){if(!this._view)return;let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(e.serverUrl&&e.hasToken&&t){this._view.webview.postMessage({type:"loading",loading:!0});let i=new l({serverUrl:e.serverUrl,token:t}),r=await i.fetchProjects(),s=e.projectKey;!s&&r.length>0&&(s=r[0].key,await this.projectDetector.setProjectKey(s));let n=null,a;if(s)try{n=await i.getOverview(s)}catch(p){a=p.message||"Failed to fetch project measures."}this._view.webview.postMessage({type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:s,detectedFromProperties:e.detectedFromProperties??!1,hasPlaintextWarning:e.hasPlaintextCredentialsWarning??!1,projects:r,overview:n,overviewError:a}),this._view.webview.postMessage({type:"loading",loading:!1})}else this._view.webview.postMessage({type:"state",state:"onboarding",serverUrl:e.serverUrl||"http://localhost:9000"})}async _handleConnect(e,t){if(!e||!t){this._view?.webview.postMessage({type:"error",message:"Server URL and User Token are required."});return}this._view?.webview.postMessage({type:"connecting"});let r=await new l({serverUrl:e,token:t}).verifyConnection();if(!r.ok){this._view?.webview.postMessage({type:"error",message:r.message||"Connection verification failed."});return}await this.projectDetector.setServerUrl(e),await this.projectDetector.setToken(t),d.window.showInformationMessage("SonarQube connection successfully verified!"),await this._syncState()}async _handleDisconnect(){await this.projectDetector.deleteToken(),d.window.showInformationMessage("Disconnected from SonarQube."),await this._syncState()}_getHtmlForWebview(e){return`<!DOCTYPE html>
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

    .tab-badge-fail {
      background: rgba(212, 51, 63, 0.15);
      color: var(--sonar-red);
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 10px;
      font-weight: 600;
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
      box-shadow: 0 0 0 1px var(--sonar-blue);
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

    .rating-A {
      background: rgba(0, 170, 94, 0.15);
      color: var(--sonar-green);
    }

    .rating-B {
      background: rgba(129, 179, 0, 0.15);
      color: var(--sonar-lime);
    }

    .rating-C {
      background: rgba(234, 190, 6, 0.15);
      color: var(--sonar-yellow);
    }

    .rating-D {
      background: rgba(237, 125, 32, 0.15);
      color: var(--sonar-orange);
    }

    .rating-E {
      background: rgba(212, 51, 63, 0.15);
      color: var(--sonar-red);
    }

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

    .loading-overlay {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 20px 0;
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
        <button id="header-refresh-btn" class="icon-btn" title="Refresh measures">\u27F3</button>
        <button id="header-disconnect-btn" class="icon-btn" title="Disconnect server">\u23FB</button>
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
        \u26A0\uFE0F Warning: Plaintext credentials found in sonar-project.properties. Please remove them to avoid leaking secrets.
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
          <div class="clock-badge">\u23F1</div>
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

    // Notify extension host that webview is loaded
    vscode.postMessage({ command: "init" });
  </script>
</body>
</html>`}};function T(o){let e=c.workspace.workspaceFolders?.[0]?.uri.fsPath,t=c.workspace.getConfiguration("sonarAgent"),i=new b({secretStorage:o.secrets,workspaceConfig:t,workspaceRoot:e}),r=new v(o.extensionUri,i);o.subscriptions.push(c.window.registerWebviewViewProvider(v.viewType,r)),o.subscriptions.push(c.commands.registerCommand("sonarAgent.refresh",async()=>{await r.refresh()})),o.subscriptions.push(c.commands.registerCommand("sonarAgent.configure",async()=>{await c.commands.executeCommand("sonarAgent.overviewView.focus")})),o.subscriptions.push(c.commands.registerCommand("sonarAgent.selectProject",async()=>{await r.promptProjectSelection()})),o.subscriptions.push(c.commands.registerCommand("sonarAgent.resetConnection",async()=>{await c.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await i.deleteToken(),await r.refresh(),c.window.showInformationMessage("SonarQube credentials have been removed."))}))}function I(){}0&&(module.exports={activate,deactivate});
