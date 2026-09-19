"use strict";var E=Object.create;var b=Object.defineProperty;var D=Object.getOwnPropertyDescriptor;var S=Object.getOwnPropertyNames;var I=Object.getPrototypeOf,F=Object.prototype.hasOwnProperty;var B=(a,e)=>{for(var t in e)b(a,t,{get:e[t],enumerable:!0})},k=(a,e,t,s)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of S(e))!F.call(a,r)&&r!==t&&b(a,r,{get:()=>e[r],enumerable:!(s=D(e,r))||s.enumerable});return a};var p=(a,e,t)=>(t=a!=null?E(I(a)):{},k(e||!a||!a.__esModule?b(t,"default",{value:a,enumerable:!0}):t,a)),T=a=>k(b({},"__esModule",{value:!0}),a);var U={};B(U,{activate:()=>L,deactivate:()=>R});module.exports=T(U);var d=p(require("vscode"));var C=p(require("node:path")),P=p(require("node:fs/promises")),w="sonarAgent.token",h=class a{secrets;config;workspaceRoot;readFileFn;constructor(e){this.secrets=e.secretStorage,this.config=e.workspaceConfig,this.workspaceRoot=e.workspaceRoot,this.readFileFn=e.readFileFn??(t=>P.readFile(t,"utf-8"))}static parseProperties(e){let t=e.split(/\r?\n/),s,r,i=!1;for(let n of t){let o=n.trim();if(!o||o.startsWith("#")||o.startsWith(";"))continue;let l=o.indexOf("=");if(l===-1)continue;let m=o.slice(0,l).trim(),x=o.slice(l+1).trim();m==="sonar.projectKey"?s=x:m==="sonar.host.url"?r=x:(m==="sonar.login"||m==="sonar.password"||m==="sonar.token")&&(i=!0)}return{projectKey:s,serverUrl:r,hasPlaintextCredentials:i}}async getToken(){return this.secrets.get(w)}async setToken(e){await this.secrets.store(w,e)}async deleteToken(){await this.secrets.delete(w)}async setServerUrl(e){await this.config.update("serverUrl",e,!0)}async setProjectKey(e){await this.config.update("projectKey",e,!0)}async detectWorkspaceProperties(){if(!this.workspaceRoot)return null;let e=C.join(this.workspaceRoot,"sonar-project.properties");try{let t=await this.readFileFn(e);return a.parseProperties(t)}catch{return null}}async getConfig(){let e=this.config.get("serverUrl",""),t=this.config.get("projectKey",""),s=!1,r=!1,i=await this.detectWorkspaceProperties();i&&(i.projectKey&&(t=i.projectKey,s=!0),!e&&i.serverUrl&&(e=i.serverUrl),i.hasPlaintextCredentials&&(r=!0));let n=await this.getToken();return{serverUrl:e,projectKey:t,hasToken:!!(n&&n.trim().length>0),detectedFromProperties:s,hasPlaintextCredentialsWarning:r}}};var u=p(require("vscode"));var g=class{serverUrl;token;fetchFn;constructor(e){this.serverUrl=e.serverUrl.replace(/\/+$/,""),this.token=e.token,this.fetchFn=e.fetchFn??globalThis.fetch}getAuthHeader(){return this.token?{Authorization:`Basic ${Buffer.from(`${this.token}:`).toString("base64")}`}:{}}parseRating(e){let t=typeof e=="number"?e:parseFloat(String(e||"1.0"));return t<=1?"A":t<=2?"B":t<=3?"C":t<=4?"D":"E"}extractFilePath(e){let t=e.indexOf(":");return t!==-1?e.slice(t+1):e}async verifyConnection(){try{let e=`${this.serverUrl}/api/authentication/validate`,t=await this.fetchFn(e,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(t.status===401||t.status===403)return{ok:!1,message:`Authentication failed (HTTP ${t.status}). Please verify your token.`};if(!t.ok)return{ok:!1,message:`Server returned HTTP ${t.status}: ${t.statusText}`};let s=await t.json();return s&&s.valid===!0?{ok:!0}:{ok:!1,message:"Invalid credentials: SonarQube reported token as invalid."}}catch(e){return{ok:!1,message:`Cannot reach SonarQube server at ${this.serverUrl}: ${e.message||String(e)}`}}}async fetchProjects(){try{let e=`${this.serverUrl}/api/projects/search?ps=100`,t=await this.fetchFn(e,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(!t.ok)throw new Error(`HTTP ${t.status}: ${t.statusText}`);return((await t.json()).components||[]).map(r=>({key:r.key,name:r.name||r.key}))}catch(e){return console.error("Failed to fetch SonarQube projects:",e.message),[]}}async getOverview(e){let t=["bugs","reliability_rating","vulnerabilities","security_rating","code_smells","sqale_rating","coverage","lines_to_cover","duplicated_lines_density","duplicated_lines","security_hotspots"].join(","),s=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${t}`,r=await this.fetchFn(s,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(!r.ok)throw new Error(`Failed to fetch measures: HTTP ${r.status} ${r.statusText}`);let i=await r.json(),n={};for(let o of i.component?.measures||[])o.value!==void 0&&(n[o.metric]=o.value);return{security:{count:parseInt(n.vulnerabilities||"0",10),rating:this.parseRating(n.security_rating)},reliability:{count:parseInt(n.bugs||"0",10),rating:this.parseRating(n.reliability_rating)},maintainability:{count:parseInt(n.code_smells||"0",10),rating:this.parseRating(n.sqale_rating)},acceptedIssues:{count:0},coverage:{percentage:parseFloat(n.coverage||"0"),linesToCover:parseInt(n.lines_to_cover||"0",10)},duplications:{percentage:parseFloat(n.duplicated_lines_density||"0"),duplicatedLines:parseInt(n.duplicated_lines||"0",10)},securityHotspots:{count:parseInt(n.security_hotspots||"0",10),rating:"A"}}}async getIssues(e,t){let s="BUG,VULNERABILITY,CODE_SMELL";t==="reliability"?s="BUG":t==="security"?s="VULNERABILITY":t==="maintainability"&&(s="CODE_SMELL");let r=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=${s}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`,i=await this.fetchFn(r,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(!i.ok)throw new Error(`Failed to fetch issues: HTTP ${i.status} ${i.statusText}`);return((await i.json()).issues||[]).map(o=>({id:o.key,ruleKey:o.rule||"",message:o.message||"",component:o.component||"",filePath:this.extractFilePath(o.component||""),line:o.line,type:o.type||"CODE_SMELL",severity:o.severity||"MAJOR",status:o.status||"OPEN",effort:o.effort,tags:o.tags||[],creationDate:o.creationDate||""}))}async getHotspots(e){let t=`${this.serverUrl}/api/hotspots/search?projectKey=${encodeURIComponent(e)}&status=TO_REVIEW&ps=100`,s=await this.fetchFn(t,{method:"GET",headers:{Accept:"application/json",...this.getAuthHeader()}});if(!s.ok)throw new Error(`Failed to fetch hotspots: HTTP ${s.status} ${s.statusText}`);return((await s.json()).hotspots||[]).map(i=>({id:i.key,ruleKey:i.ruleKey||"",message:i.message||"",component:i.component||"",filePath:this.extractFilePath(i.component||""),line:i.line,type:"HOTSPOT",severity:i.vulnerabilityProbability==="HIGH"?"CRITICAL":"MAJOR",status:i.status||"TO_REVIEW",tags:["security-hotspot"],creationDate:i.creationDate||""}))}};var v=p(require("node:path")),j=p(require("node:fs/promises")),c=p(require("vscode")),y=class{workspaceRoot;fileExistsFn;findFilesFn;constructor(e){this.workspaceRoot=e?.workspaceRoot??c.workspace.workspaceFolders?.[0]?.uri.fsPath,this.fileExistsFn=e?.fileExistsFn??(async t=>{try{return await j.stat(t),!0}catch{return!1}}),this.findFilesFn=e?.findFilesFn??(async t=>(await c.workspace.findFiles(t,"**/node_modules/**",5)).map(r=>r.fsPath))}async resolveFilePath(e){if(!this.workspaceRoot)return null;let t=v.isAbsolute(e)?e:v.join(this.workspaceRoot,e);if(await this.fileExistsFn(t))return t;let s=v.basename(e);if(s){let r=await this.findFilesFn(`**/${s}`);if(r&&r.length>0)return r[0]}return null}async openFileAtLine(e,t){let s=await this.resolveFilePath(e);if(!s)return c.window.showWarningMessage(`Could not find file locally: ${e}`),!1;try{let r=c.Uri.file(s),i=await c.workspace.openTextDocument(r),n=await c.window.showTextDocument(i,{preview:!1});if(t!==void 0&&t>0){let o=t-1,l=new c.Position(o,0);n.selection=new c.Selection(l,l),n.revealRange(new c.Range(l,l),c.TextEditorRevealType.InCenter)}return!0}catch(r){return c.window.showErrorMessage(`Failed to open file: ${r.message||String(r)}`),!1}}};var f=class{constructor(e,t,s){this.extensionUri=e;this.projectDetector=t;this.fileNavigator=s??new y}static viewType="sonarAgent.overviewView";_view;fileNavigator;resolveWebviewView(e,t,s){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtmlForWebview(e.webview),e.webview.onDidReceiveMessage(async r=>{switch(r.command){case"init":{await this._syncState();break}case"connect":{await this._handleConnect(r.serverUrl,r.token);break}case"disconnect":{await this._handleDisconnect();break}case"selectProject":{r.projectKey&&(await this.projectDetector.setProjectKey(r.projectKey),await this._syncState());break}case"openProjectPicker":{await this.promptProjectSelection();break}case"fetchDetails":{await this._handleFetchDetails(r.category);break}case"openFile":{await this.fileNavigator.openFileAtLine(r.filePath,r.line);break}case"refresh":{await this._syncState();break}}})}async refresh(){this._view&&await this._syncState()}async promptProjectSelection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!e.serverUrl||!t){u.window.showWarningMessage("Please connect to SonarQube first.");return}let r=await new g({serverUrl:e.serverUrl,token:t}).fetchProjects();if(r.length===0){u.window.showInformationMessage("No projects found on the SonarQube server.");return}let i=r.map(o=>({label:o.name,description:o.key,detail:o.key===e.projectKey?"(Currently selected)":void 0})),n=await u.window.showQuickPick(i,{placeHolder:"Select a SonarQube project for this workspace",matchOnDescription:!0});n&&n.description&&(await this.projectDetector.setProjectKey(n.description),await this._syncState(),u.window.showInformationMessage(`Active SonarQube project set to: ${n.label}`))}async _handleFetchDetails(e){if(!this._view)return;let t=await this.projectDetector.getConfig(),s=await this.projectDetector.getToken();if(!(!t.serverUrl||!t.projectKey||!s)){this._view.webview.postMessage({type:"loadingDetails",loading:!0});try{let r=new g({serverUrl:t.serverUrl,token:s}),i=[];e==="hotspots"?i=await r.getHotspots(t.projectKey):e==="reliability"||e==="security"||e==="maintainability"?i=await r.getIssues(t.projectKey,e):i=await r.getIssues(t.projectKey),this._view.webview.postMessage({type:"details",category:e,items:i})}catch(r){this._view.webview.postMessage({type:"detailsError",message:r.message||"Failed to load issues."})}finally{this._view.webview.postMessage({type:"loadingDetails",loading:!1})}}}async _syncState(){if(!this._view)return;let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(e.serverUrl&&e.hasToken&&t){this._view.webview.postMessage({type:"loading",loading:!0});let s=new g({serverUrl:e.serverUrl,token:t}),r=await s.fetchProjects(),i=e.projectKey;!i&&r.length>0&&(i=r[0].key,await this.projectDetector.setProjectKey(i));let n=null,o;if(i)try{n=await s.getOverview(i)}catch(l){o=l.message||"Failed to fetch project measures."}this._view.webview.postMessage({type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:i,detectedFromProperties:e.detectedFromProperties??!1,hasPlaintextWarning:e.hasPlaintextCredentialsWarning??!1,projects:r,overview:n,overviewError:o}),this._view.webview.postMessage({type:"loading",loading:!1})}else this._view.webview.postMessage({type:"state",state:"onboarding",serverUrl:e.serverUrl||"http://localhost:9000"})}async _handleConnect(e,t){if(!e||!t){this._view?.webview.postMessage({type:"error",message:"Server URL and User Token are required."});return}this._view?.webview.postMessage({type:"connecting"});let r=await new g({serverUrl:e,token:t}).verifyConnection();if(!r.ok){this._view?.webview.postMessage({type:"error",message:r.message||"Connection verification failed."});return}await this.projectDetector.setServerUrl(e),await this.projectDetector.setToken(t),u.window.showInformationMessage("SonarQube connection successfully verified!"),await this._syncState()}async _handleDisconnect(){await this.projectDetector.deleteToken(),u.window.showInformationMessage("Disconnected from SonarQube."),await this._syncState()}_getHtmlForWebview(e){return`<!DOCTYPE html>
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
        footerMeta.textContent = (item.line ? "L" + item.line : "File level") + (item.effort ? " \u2022 " + item.effort : "");

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "issue-actions";

        const jumpBtn = document.createElement("button");
        jumpBtn.className = "btn btn-secondary btn-sm";
        jumpBtn.textContent = "\u{1F441} Jump";
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
</html>`}};function L(a){let e=d.workspace.workspaceFolders?.[0]?.uri.fsPath,t=d.workspace.getConfiguration("sonarAgent"),s=new h({secretStorage:a.secrets,workspaceConfig:t,workspaceRoot:e}),r=new f(a.extensionUri,s);a.subscriptions.push(d.window.registerWebviewViewProvider(f.viewType,r)),a.subscriptions.push(d.commands.registerCommand("sonarAgent.refresh",async()=>{await r.refresh()})),a.subscriptions.push(d.commands.registerCommand("sonarAgent.configure",async()=>{await d.commands.executeCommand("sonarAgent.overviewView.focus")})),a.subscriptions.push(d.commands.registerCommand("sonarAgent.selectProject",async()=>{await r.promptProjectSelection()})),a.subscriptions.push(d.commands.registerCommand("sonarAgent.resetConnection",async()=>{await d.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await s.deleteToken(),await r.refresh(),d.window.showInformationMessage("SonarQube credentials have been removed."))}))}function R(){}0&&(module.exports={activate,deactivate});
