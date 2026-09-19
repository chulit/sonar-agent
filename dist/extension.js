"use strict";var U=Object.create;var P=Object.defineProperty;var M=Object.getOwnPropertyDescriptor;var $=Object.getOwnPropertyNames;var N=Object.getPrototypeOf,O=Object.prototype.hasOwnProperty;var _=(p,e)=>{for(var t in e)P(p,t,{get:e[t],enumerable:!0})},E=(p,e,t,i)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of $(e))!O.call(p,n)&&n!==t&&P(p,n,{get:()=>e[n],enumerable:!(i=M(e,n))||i.enumerable});return p};var y=(p,e,t)=>(t=p!=null?U(N(p)):{},E(e||!p||!p.__esModule?P(t,"default",{value:p,enumerable:!0}):t,p)),K=p=>E(P({},"__esModule",{value:!0}),p);var H={};_(H,{activate:()=>z,deactivate:()=>V});module.exports=K(H);var m=y(require("vscode"));var L=y(require("node:path")),F=y(require("node:fs/promises")),D="sonarAgent.token",I=class p{secrets;config;workspaceRoot;readFileFn;activeProjectKey;constructor(e){this.secrets=e.secretStorage,this.config=e.workspaceConfig,this.workspaceRoot=e.workspaceRoot,this.readFileFn=e.readFileFn??(t=>F.readFile(t,"utf-8"))}static parseProperties(e){let t=e.split(/\r?\n/),i,n,o=!1;for(let r of t){let s=r.trim();if(!s||s.startsWith("#")||s.startsWith(";"))continue;let a=s.indexOf("=");if(a===-1)continue;let c=s.slice(0,a).trim(),l=s.slice(a+1).trim();c==="sonar.projectKey"?i=l:c==="sonar.host.url"?n=l:(c==="sonar.login"||c==="sonar.password"||c==="sonar.token")&&(o=!0)}return{projectKey:i,serverUrl:n,hasPlaintextCredentials:o}}async getToken(){return this.secrets.get(D)}async setToken(e){await this.secrets.store(D,e.trim())}async deleteToken(){await this.secrets.delete(D)}async setServerUrl(e){await this.config.update("serverUrl",e.trim(),!0)}async setProjectKey(e){this.activeProjectKey=e.trim(),await this.config.update("projectKey",this.activeProjectKey,!0)}async detectWorkspaceProperties(){if(!this.workspaceRoot)return null;let e=L.join(this.workspaceRoot,"sonar-project.properties");try{let t=await this.readFileFn(e);return p.parseProperties(t)}catch{return null}}async getConfig(){let e=this.config.get("serverUrl",""),t=this.activeProjectKey??this.config.get("projectKey",""),i=!1,n=!1,o=await this.detectWorkspaceProperties();o&&(o.projectKey&&(t=o.projectKey,i=!0),!e&&o.serverUrl&&(e=o.serverUrl),o.hasPlaintextCredentials&&(n=!0));let r=await this.getToken();return{serverUrl:e,projectKey:t,hasToken:!!(r&&r.trim().length>0),detectedFromProperties:i,hasPlaintextCredentialsWarning:n}}};var d=y(require("vscode"));var f=class{serverUrl;token;fetchFn;constructor(e){this.serverUrl=e.serverUrl.replace(/\/+$/,""),this.token=e.token?e.token.trim():void 0,this.fetchFn=e.fetchFn??globalThis.fetch}getAuthHeader(){return this.token?{Authorization:`Basic ${Buffer.from(`${this.token}:`).toString("base64")}`}:{}}parseRating(e){let t=typeof e=="number"?e:parseFloat(String(e||"1.0"));return t<=1?"A":t<=2?"B":t<=3?"C":t<=4?"D":"E"}extractFilePath(e){let t=e.indexOf(":");return t!==-1?e.slice(t+1):e}async authenticatedFetch(e){let t={Accept:"application/json",...this.getAuthHeader()},i=await this.fetchFn(e,{method:"GET",headers:t});if(i.status===401&&this.token){let n={Accept:"application/json",Authorization:`Bearer ${this.token}`},o=await this.fetchFn(e,{method:"GET",headers:n});if(o.ok)return o}return i}async verifyConnection(){try{let e=`${this.serverUrl}/api/authentication/validate`,t=await this.authenticatedFetch(e);if(t.status===401||t.status===403)return{ok:!1,message:`Authentication failed (HTTP ${t.status}). Please verify your token.`};if(!t.ok)return{ok:!1,message:`Server returned HTTP ${t.status}: ${t.statusText}`};let i=await t.json();return i&&i.valid===!0?{ok:!0}:{ok:!1,message:"Invalid credentials: SonarQube reported token as invalid."}}catch(e){return{ok:!1,message:`Cannot reach SonarQube server at ${this.serverUrl}: ${e.message||String(e)}`}}}async fetchProjects(){let e=[`${this.serverUrl}/api/components/search?qualifiers=TRK&ps=100`,`${this.serverUrl}/api/components/search_projects?ps=100`,`${this.serverUrl}/api/projects/search?ps=100`,`${this.serverUrl}/api/projects/search?ps=100&qualifiers=TRK`,`${this.serverUrl}/api/components/search?qualifiers=TRK`];for(let t of e)try{let i=await this.authenticatedFetch(t);if(!i.ok)continue;let n=await i.json(),o=n.components||n.projects||n.results||(Array.isArray(n)?n:[]);if(Array.isArray(o)&&o.length>0)return o.map(r=>({key:r.key||r.id||r.projectKey,name:r.name||r.key}))}catch{}return[]}async getOverview(e){let t=["bugs","reliability_rating","vulnerabilities","security_rating","code_smells","sqale_rating","accepted_issues","wont_fix_issues","coverage","lines_to_cover","duplicated_lines_density","duplicated_lines","security_hotspots"].join(","),i=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${t}`,n=await this.authenticatedFetch(i);if(!n.ok)throw new Error(`Failed to fetch measures: HTTP ${n.status} ${n.statusText}`);let o=await n.json(),r={};for(let s of o.component?.measures||[])s.value!==void 0&&(r[s.metric]=s.value);return{security:{count:parseInt(r.vulnerabilities||"0",10),rating:this.parseRating(r.security_rating)},reliability:{count:parseInt(r.bugs||"0",10),rating:this.parseRating(r.reliability_rating)},maintainability:{count:parseInt(r.code_smells||"0",10),rating:this.parseRating(r.sqale_rating)},acceptedIssues:{count:parseInt(r.accepted_issues||r.wont_fix_issues||"0",10)},coverage:{percentage:parseFloat(r.coverage||"0"),linesToCover:parseInt(r.lines_to_cover||"0",10)},duplications:{percentage:parseFloat(r.duplicated_lines_density||"0"),duplicatedLines:parseInt(r.duplicated_lines||"0",10)},securityHotspots:{count:parseInt(r.security_hotspots||"0",10),rating:"A"}}}async getIssues(e,t){let i;if(t==="accepted")i=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=BUG,VULNERABILITY,CODE_SMELL&issueStatuses=ACCEPTED&ps=100`;else{let r="BUG,VULNERABILITY,CODE_SMELL";t==="reliability"?r="BUG":t==="security"?r="VULNERABILITY":t==="maintainability"&&(r="CODE_SMELL"),i=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=${r}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`}let n=await this.authenticatedFetch(i);if(!n.ok&&t==="accepted"){let r=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=BUG,VULNERABILITY,CODE_SMELL&resolutions=WONTFIX&ps=100`,s=await this.authenticatedFetch(r);s.ok&&(n=s)}if(!n.ok)throw new Error(`Failed to fetch issues: HTTP ${n.status} ${n.statusText}`);return((await n.json()).issues||[]).map(r=>({id:r.key,ruleKey:r.rule||"",message:r.message||"",component:r.component||"",filePath:this.extractFilePath(r.component||""),line:r.line,type:r.type||"CODE_SMELL",severity:r.severity||"MAJOR",status:r.status||"OPEN",effort:r.effort,tags:r.tags||[],creationDate:r.creationDate||""}))}async getHotspots(e){let t=`${this.serverUrl}/api/hotspots/search?projectKey=${encodeURIComponent(e)}&status=TO_REVIEW&ps=100`,i=await this.authenticatedFetch(t);if(!i.ok)throw new Error(`Failed to fetch hotspots: HTTP ${i.status} ${i.statusText}`);return((await i.json()).hotspots||[]).map(o=>({id:o.key,ruleKey:o.ruleKey||"",message:o.message||"",component:o.component||"",filePath:this.extractFilePath(o.component||""),line:o.line,type:"HOTSPOT",severity:"MAJOR",status:o.status||"TO_REVIEW",tags:["security-hotspot"],creationDate:o.creationDate||""}))}async getEnrichedRule(e){try{let t=`${this.serverUrl}/api/rules/show?key=${encodeURIComponent(e)}`,i=await this.authenticatedFetch(t);if(!i.ok)return{key:e,name:e,cleanDesc:"Verify code adherence to Sonar rule guidelines."};let n=await i.json(),r=(n.rule?.mdDesc||n.rule?.htmlDesc||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();return{key:n.rule?.key||e,name:n.rule?.name||e,cleanDesc:r||"Verify code adherence to Sonar rule guidelines."}}catch{return{key:e,name:e,cleanDesc:"Verify code adherence to Sonar rule guidelines."}}}async getCoverageFiles(e){let t=`${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(e)}&metricKeys=uncovered_lines,coverage&qualifiers=FIL&strategy=leaves&s=metric&metricSort=uncovered_lines&asc=false&ps=100`,i=await this.authenticatedFetch(t);if(!i.ok)throw new Error(`Failed to fetch coverage files: HTTP ${i.status} ${i.statusText}`);let n=await i.json(),o=[];for(let r of n.components||[]){let s={};for(let l of r.measures||[])s[l.metric]=l.value;let a=parseInt(s.uncovered_lines||"0",10),c=parseFloat(s.coverage||"0");(a>0||c<80)&&o.push({id:r.key,ruleKey:"coverage:uncovered_lines",message:`${a} uncovered lines (${c.toFixed(0)}% coverage)`,component:r.key,filePath:r.path||this.extractFilePath(r.key),type:"COVERAGE",severity:c<50?"CRITICAL":"MAJOR",status:"UNCOVERED",effort:`${a} lines`,tags:["test-coverage","unit-test"],creationDate:new Date().toISOString()})}return o}async getDuplicationFiles(e){let t=`${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(e)}&metricKeys=duplicated_lines_density,duplicated_blocks&qualifiers=FIL&strategy=leaves&s=metric&metricSort=duplicated_lines_density&asc=false&ps=100`,i=await this.authenticatedFetch(t);if(!i.ok)throw new Error(`Failed to fetch duplication files: HTTP ${i.status} ${i.statusText}`);let n=await i.json(),o=[];for(let r of n.components||[]){let s={};for(let l of r.measures||[])s[l.metric]=l.value;let a=parseFloat(s.duplicated_lines_density||"0"),c=parseInt(s.duplicated_blocks||"0",10);(a>0||c>0)&&o.push({id:r.key,ruleKey:"duplications:duplicated_code",message:`${a.toFixed(1)}% duplicated lines (${c} duplicated blocks)`,component:r.key,filePath:r.path||this.extractFilePath(r.key),type:"DUPLICATION",severity:a>20?"CRITICAL":"MAJOR",status:"DUPLICATED",effort:`${c} blocks`,tags:["code-duplication","refactoring"],creationDate:new Date().toISOString()})}return o}};var C=y(require("node:path")),T=y(require("node:fs/promises")),u=y(require("vscode")),b=class{workspaceRoot;fileExistsFn;findFilesFn;constructor(e){this.workspaceRoot=e?.workspaceRoot??u.workspace.workspaceFolders?.[0]?.uri.fsPath,this.fileExistsFn=e?.fileExistsFn??(async t=>{try{return await T.stat(t),!0}catch{return!1}}),this.findFilesFn=e?.findFilesFn??(async t=>(await u.workspace.findFiles(t,"**/node_modules/**",5)).map(n=>n.fsPath))}async resolveFilePath(e){if(!this.workspaceRoot)return null;let t=C.isAbsolute(e)?e:C.join(this.workspaceRoot,e);if(await this.fileExistsFn(t))return t;let i=C.basename(e);if(i){let n=await this.findFilesFn(`**/${i}`);if(n&&n.length>0)return n[0]}return null}async openFileAtLine(e,t){let i=await this.resolveFilePath(e);if(!i)return u.window.showWarningMessage(`Could not find file locally: ${e}`),!1;try{let n=u.Uri.file(i),o=await u.workspace.openTextDocument(n),r=await u.window.showTextDocument(o,{preview:!1});if(t!==void 0&&t>0){let s=t-1,a=new u.Position(s,0);r.selection=new u.Selection(a,a),r.revealRange(new u.Range(a,a),u.TextEditorRevealType.InCenter)}return!0}catch(n){return u.window.showErrorMessage(`Failed to open file: ${n.message||String(n)}`),!1}}};var B=y(require("node:path")),R=y(require("node:fs/promises")),g=y(require("vscode"));var w=class{ruleCache=new Map;fileNavigator;fetchRuleFn;readCodeSnippetFn;isExtensionInstalledFn;isAntigravityEnvFn;executeCommandFn;sendToAgentPanelFn;constructor(e){this.fileNavigator=e?.fileNavigator??new b,this.fetchRuleFn=e?.fetchRuleFn,this.readCodeSnippetFn=e?.readCodeSnippetFn,this.executeCommandFn=e?.executeCommandFn??((t,...i)=>g.commands.executeCommand(t,...i)),this.sendToAgentPanelFn=e?.sendToAgentPanelFn??(t=>{let i=g.antigravityExtensibility;return i&&typeof i.sendToAgentPanel=="function"?i.sendToAgentPanel(t):Promise.reject(new Error("antigravityExtensibility.sendToAgentPanel not available"))}),this.isExtensionInstalledFn=e?.isExtensionInstalledFn??(t=>{try{return!!g.extensions.getExtension(t)}catch{return!1}}),this.isAntigravityEnvFn=e?.isAntigravityEnvFn??(()=>{try{return!!((g.env.appName||"").toLowerCase().includes("antigravity")||process.env.GEMINI_CLI||process.env.ANTIGRAVITY_IDE||process.env.ANTIGRAVITY_AGENT)}catch{return!1}})}getAvailableAgents(){let e=[];return(this.isExtensionInstalledFn("github.copilot")||this.isExtensionInstalledFn("github.copilot-chat"))&&e.push({id:"copilot",name:"GitHub Copilot",description:"VS Code Copilot Chat",focusCommand:"workbench.action.chat.open"}),(this.isAntigravityEnvFn()||this.isExtensionInstalledFn("google.antigravity")||this.isExtensionInstalledFn("google.gemini"))&&e.push({id:"antigravity",name:"Antigravity Agent",description:"DeepMind Antigravity Agent",focusCommand:"antigravity.openChatView"}),this.isExtensionInstalledFn("anthropic.claude-code")&&e.push({id:"claude-code",name:"Claude Code",description:"Anthropic Claude Code for VS Code",focusCommand:"workbench.view.extension.claude-sidebar"}),this.isExtensionInstalledFn("saoudrizwan.claude-dev")&&e.push({id:"cline",name:"Cline",description:"Autonomous AI coding agent",focusCommand:"claude-dev.focus"}),this.isExtensionInstalledFn("rooveterinaryinc.roo-cline")&&e.push({id:"roo-code",name:"Roo Code",description:"Roo Code coding agent",focusCommand:"roo-cline.focus"}),this.isExtensionInstalledFn("continue.continue")&&e.push({id:"continue",name:"Continue",description:"Continue open-source AI assistant",focusCommand:"continue.focusContinueInputView"}),e.push({id:"clipboard",name:"Clipboard Only",description:"Copy prompt to clipboard"}),e}async getRule(e){if(this.ruleCache.has(e))return this.ruleCache.get(e);let t;return this.fetchRuleFn?t=await this.fetchRuleFn(e):t={key:e,name:e,cleanDesc:"Adhere to SonarQube quality standard for this rule."},this.ruleCache.set(e,t),t}detectLanguage(e){switch(B.extname(e).toLowerCase()){case".ts":case".tsx":return"typescript";case".js":case".jsx":return"javascript";case".vue":return"vue";case".html":return"html";case".css":return"css";case".py":return"python";case".java":return"java";case".go":return"go";case".rs":return"rust";default:return""}}async readCodeSnippet(e,t){if(this.readCodeSnippetFn)return this.readCodeSnippetFn(e,t);let i=await this.fileNavigator.resolveFilePath(e);if(!i)return null;try{let o=(await R.readFile(i,"utf-8")).split(/\r?\n/),r=o.length,s=t!==void 0&&t>0?t:1,a=Math.max(1,s-10),c=Math.min(r,s+10),l=[];for(let v=a;v<=c;v++){let x=o[v-1],A=v===s?" ---> [ISSUE HERE] ":"      ";l.push(`${v.toString().padStart(4," ")} |${A}${x}`)}return{snippet:l.join(`
`),startLine:a,endLine:c,language:this.detectLanguage(e)}}catch{return null}}async assemblePrompt(e){let t=await this.readCodeSnippet(e.filePath,e.line);if(e.type==="COVERAGE"){let o=`@workspace Please generate unit tests to improve test coverage for the following file:

`;return o+=`### \u{1F4CD} Target File
`,o+=`- File: \`${e.filePath}\`
`,o+=`- Status: ${e.message}

`,t&&(o+=`### \u{1F4BB} Local Code Snippet (\`${e.filePath}\`)
`,o+=`\`\`\`${t.language}
${t.snippet}
\`\`\`

`),o+=`### \u{1F3AF} Instructions for Agent
`,o+=`1. Analyze the code in \`${e.filePath}\`.
`,o+=`2. Generate comprehensive unit tests covering untested functions, branches, and lines.
`,o+=`3. Use testing frameworks and conventions consistent with this project.
`,o}if(e.type==="DUPLICATION"){let o=`@workspace Please refactor duplicated code in the following file:

`;return o+=`### \u{1F4CD} Target File
`,o+=`- File: \`${e.filePath}\`
`,o+=`- Status: ${e.message}

`,t&&(o+=`### \u{1F4BB} Local Code Snippet (\`${e.filePath}\`)
`,o+=`\`\`\`${t.language}
${t.snippet}
\`\`\`

`),o+=`### \u{1F3AF} Instructions for Agent
`,o+=`1. Identify repeated/duplicated code blocks in \`${e.filePath}\`.
`,o+=`2. Extract repeated logic into a helper function, shared method, or reusable module.
`,o+=`3. Ensure existing behavior, inputs, and outputs remain intact without regressions.
`,o}let i=await this.getRule(e.ruleKey),n=`@workspace Please fix the following SonarQube issue:

`;return n+=`### \u{1F4CD} Location
`,n+=`- File: \`${e.filePath}\`
`,n+=`- Line: ${e.line||"File level"}

`,n+=`### \u26A0\uFE0F Issue Details
`,n+=`- Message: "${e.message}"
`,n+=`- Type: ${e.type} | Severity: ${e.severity}
`,n+=`- Sonar Rule: \`${i.key}\` - ${i.name}

`,n+=`### \u{1F4D6} SonarQube Rule Details
`,n+=`${i.cleanDesc}
`,i.recommendation&&(n+=`> Sonar Recommendation: ${i.recommendation}
`),n+=`
`,t&&(n+=`### \u{1F4BB} Local Code Snippet (\`${e.filePath}\` L${t.startLine}-L${t.endLine})
`,n+=`\`\`\`${t.language}
${t.snippet}
\`\`\`

`),n+=`### \u{1F3AF} Instructions for Agent
`,n+=`1. Fix the issue according to the SonarQube rule without breaking existing functionality.
`,n+=`2. Maintain consistent code style with the existing codebase.
`,n+=`3. Provide the complete fixed code and concisely explain the changes.
`,n}async assembleBatchPrompt(e){if(e.length===1)return this.assemblePrompt(e[0]);let t=`@workspace Please fix the following ${e.length} SonarQube issues:

`,i=new Map;for(let n of e){let o=i.get(n.filePath)||[];o.push(n),i.set(n.filePath,o)}for(let[n,o]of i){t+=`## \u{1F4C1} File: \`${n}\` (${o.length} issues)

`;for(let r=0;r<o.length;r++){let s=o[r],a=await this.getRule(s.ruleKey),c=await this.readCodeSnippet(s.filePath,s.line);t+=`### Issue #${r+1}: Line ${s.line||"File level"} [${s.severity}] ${a.name}
`,t+=`- Message: "${s.message}"
`,t+=`- Rule: \`${a.key}\`
`,t+=`- Guidance: ${a.cleanDesc}
`,c&&(t+=`\`\`\`${c.language}
${c.snippet}
\`\`\`
`),t+=`
`}}return t+=`### \u{1F3AF} Instructions for Agent
`,t+=`1. Fix all listed issues sequentially per file.
`,t+=`2. Preserve existing behavior and do not break other functionality.
`,t+=`3. Explain the applied fixes concisely.
`,t}async dispatch(e,t,i,n){try{await g.env.clipboard.writeText(e)}catch{}if(i&&i.line&&await this.fileNavigator.openFileAtLine(i.filePath,i.line),t==="copilot")try{return await this.executeCommandFn("workbench.action.chat.open",{query:e}),g.window.showInformationMessage("Dispatched Fix Prompt to GitHub Copilot Chat!"),{ok:!0,message:"Dispatched to GitHub Copilot Chat."}}catch{return g.window.showInformationMessage("Prompt copied to clipboard! Paste it into GitHub Copilot Chat."),{ok:!0,message:"Copied to clipboard (Copilot chat command not found)."}}if(t==="antigravity"){try{let s=[],a=n&&n.length>0?n:i?[i]:[],c=new Set;for(let l of a)if(l.filePath){let v=await this.fileNavigator.resolveFilePath(l.filePath);if(v&&!c.has(v)){c.add(v);let x=l.line&&l.line>0?l.line-1:0;s.push({uri:g.Uri.file(v),startLine:x,endLine:x})}}return await this.sendToAgentPanelFn({message:e,files:s.length>0?s:void 0,autoSend:!1}),g.window.showInformationMessage("Dispatched Fix Prompt to Antigravity Chat!"),{ok:!0,message:"Dispatched to Antigravity Chat."}}catch{}for(let s of["workbench.action.chat.open","antigravity.prioritized.chat.open","workbench.action.openChat"])try{return await this.executeCommandFn(s,{query:e}),g.window.showInformationMessage("Dispatched Fix Prompt to Antigravity Chat!"),{ok:!0,message:"Dispatched to Antigravity Chat."}}catch{}try{return await this.executeCommandFn("antigravity.openChatView"),g.window.showInformationMessage("Antigravity Chat opened & prompt copied to clipboard! Press Cmd+V / Ctrl+V to paste."),{ok:!0,message:"Chat opened and prompt ready in clipboard."}}catch{return g.window.showInformationMessage("Fix Prompt copied to clipboard for Antigravity Agent! Paste it into your agent chat."),{ok:!0,message:"Prompt ready in clipboard for Antigravity Agent."}}}let o=this.getAvailableAgents().find(s=>s.id===t),r=o?.name||(t==="claude-code"?"Claude Code":t==="cline"?"Cline":t==="roo-code"?"Roo Code":t==="continue"?"Continue":"Clipboard");if(t==="claude-code"){let s=["workbench.view.extension.claude-sidebar","claude-code.focus","claude.focus"];for(let a of s)try{await this.executeCommandFn(a);break}catch{}}else if(o?.focusCommand)try{await this.executeCommandFn(o.focusCommand)}catch{}return t==="clipboard"?(g.window.showInformationMessage("Fix Prompt copied to clipboard!"),{ok:!0,message:"Prompt ready in clipboard."}):(g.window.showInformationMessage(`Fix Prompt copied to clipboard for ${r}! Paste it into your agent chat.`),{ok:!0,message:`Prompt ready in clipboard for ${r}.`})}};var k=class{constructor(e,t,i,n,o){this.extensionUri=e;this.projectDetector=t;this.fileNavigator=i??new b,this.agentDispatcher=n??new w({fileNavigator:this.fileNavigator}),this.diagnosticCollection=o??d.languages.createDiagnosticCollection("SonarQube")}static viewType="sonarAgent.overviewView";_view;fileNavigator;agentDispatcher;diagnosticCollection;resolveWebviewView(e,t,i){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtmlForWebview(e.webview),e.webview.onDidReceiveMessage(async n=>{switch(n.command){case"init":{await this._syncState();break}case"connect":{await this._handleConnect(n.serverUrl,n.token);break}case"disconnect":{await this._handleDisconnect();break}case"selectProject":{n.projectKey&&(await this.projectDetector.setProjectKey(n.projectKey),await this._syncState());break}case"openProjectPicker":{await this.promptProjectSelection();break}case"fetchDetails":{await this._handleFetchDetails(n.category);break}case"openFile":{await this.fileNavigator.openFileAtLine(n.filePath,n.line);break}case"sendToAgent":{await this._handleSendToAgent(n.item,n.targetAgentId);break}case"sendBatchToAgent":{await this._handleSendBatchToAgent(n.items,n.targetAgentId);break}case"setTargetAgent":{await d.workspace.getConfiguration("sonarAgent").update("defaultAgent",n.agentId,!0);break}case"refresh":{await this._syncState();break}}})}async refresh(){this._view&&await this._syncState()}async promptProjectSelection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!e.serverUrl||!t){d.window.showWarningMessage("Please connect to SonarQube first.");return}let n=await new f({serverUrl:e.serverUrl,token:t}).fetchProjects(),o={label:"$(edit) Enter Project Key manually...",description:"Type the exact project key from SonarQube",detail:"Use this if your project is not listed or search is restricted"},r=[o,...n.map(a=>({label:a.name,description:a.key,detail:a.key===e.projectKey?"(Currently selected)":void 0}))],s=await d.window.showQuickPick(r,{placeHolder:"Select a SonarQube project or enter key manually",matchOnDescription:!0});if(s===o){let a=await d.window.showInputBox({prompt:"Enter the SonarQube Project Key",placeHolder:"e.g. org.company:my-project",value:e.projectKey||"",validateInput:c=>c.trim()?null:"Project Key cannot be empty"});if(a&&a.trim()){let c=a.trim();await this.projectDetector.setProjectKey(c),await this._syncState(),d.window.showInformationMessage(`Active SonarQube project set to: ${c}`)}return}s&&s.description&&(await this.projectDetector.setProjectKey(s.description),await this._syncState(),d.window.showInformationMessage(`Active SonarQube project set to: ${s.label}`))}async promptConfigureConnection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken(),i=!!(e.serverUrl&&t),n=[{label:"$(link) Update Server URL & Token",description:i?"Connected":"Not connected",detail:e.serverUrl?`Server: ${e.serverUrl}`:"Configure SonarQube host URL and authentication token",action:"updateCredentials"},{label:"$(folder-active) Select Sonar Project",description:e.projectKey?"Active":"Not selected",detail:e.projectKey?`Current project: ${e.projectKey}`:"Choose an active project on the server",action:"selectProject"},{label:"$(gear) Open Extension Settings",detail:"Configure default AI agent and advanced preferences",action:"openSettings"}];i&&n.push({label:"$(debug-disconnect) Disconnect & Reset Credentials",detail:"Remove stored token from OS Keychain and disconnect",action:"disconnect"});let o=await d.window.showQuickPick(n,{placeHolder:"Sonar Agent: Configure Connection & Settings",matchOnDescription:!0,matchOnDetail:!0});if(o)switch(o.action){case"updateCredentials":await this.promptUpdateCredentials(e.serverUrl);break;case"selectProject":await this.promptProjectSelection();break;case"openSettings":await d.commands.executeCommand("workbench.action.openSettings","@ext:sonar-agent");break;case"disconnect":await d.commands.executeCommand("sonarAgent.resetConnection");break}}async promptUpdateCredentials(e,t){let i=e||(await this.projectDetector.getConfig()).serverUrl||"http://localhost:9000",n=t||"";for(;;){let o=await d.window.showInputBox({title:"SonarQube Connection (1/2)",prompt:"Enter the SonarQube Server URL",placeHolder:"http://localhost:9000 or https://sonar.example.com",value:i,ignoreFocusOut:!0,validateInput:c=>{let l=c.trim();if(!l)return"Server URL is required";if(!l.startsWith("http://")&&!l.startsWith("https://"))return"Server URL must start with http:// or https://";try{if(!new URL(l).hostname)return"Please enter a valid URL with hostname"}catch{return"Please enter a valid URL"}return null}});if(o===void 0)return;i=o.trim();let r=await d.window.showInputBox({title:"SonarQube Connection (2/2)",prompt:"Enter your SonarQube User Token",placeHolder:"sqp_...",value:n,password:!0,ignoreFocusOut:!0,validateInput:c=>c.trim()?null:"User Token is required"});if(r===void 0)return;n=r.trim();let s={ok:!1};if(await d.window.withProgress({location:d.ProgressLocation.Notification,title:"Verifying SonarQube connection...",cancellable:!1},async()=>{s=await new f({serverUrl:i,token:n}).verifyConnection()}),!s.ok){if(await d.window.showErrorMessage(`SonarQube connection verification failed: ${s.message||"Unknown error"}`,"Retry","Cancel")==="Retry")continue;return}await this.projectDetector.setServerUrl(i),await this.projectDetector.setToken(n),d.window.showInformationMessage("SonarQube connection successfully verified and saved!"),(await this.projectDetector.getConfig()).projectKey||await this.promptProjectSelection(),await this.refresh();return}}async _handleSendToAgent(e,t){let i=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken(),o=t||d.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),r;i.serverUrl&&n&&(r=new f({serverUrl:i.serverUrl,token:n}));let s=new w({fileNavigator:this.fileNavigator,fetchRuleFn:r?c=>r.getEnrichedRule(c):void 0}),a=await s.assemblePrompt(e);await s.dispatch(a,o,e)}async _handleSendBatchToAgent(e,t){if(!e||e.length===0)return;let i=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken(),o=t||d.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),r;i.serverUrl&&n&&(r=new f({serverUrl:i.serverUrl,token:n}));let s=new w({fileNavigator:this.fileNavigator,fetchRuleFn:r?c=>r.getEnrichedRule(c):void 0}),a=await s.assembleBatchPrompt(e);await s.dispatch(a,o,e[0],e)}async _handleFetchDetails(e){if(!this._view)return;let t=await this.projectDetector.getConfig(),i=await this.projectDetector.getToken();if(!(!t.serverUrl||!t.projectKey||!i)){this._view.webview.postMessage({type:"loadingDetails",loading:!0});try{let n=new f({serverUrl:t.serverUrl,token:i}),o=[];e==="hotspots"?o=await n.getHotspots(t.projectKey):e==="coverage"?o=await n.getCoverageFiles(t.projectKey):e==="duplications"?o=await n.getDuplicationFiles(t.projectKey):e==="reliability"||e==="security"||e==="maintainability"||e==="accepted"?o=await n.getIssues(t.projectKey,e):o=await n.getIssues(t.projectKey),this._view.webview.postMessage({type:"details",category:e,items:o}),await this.syncDiagnostics(o)}catch(n){this._view.webview.postMessage({type:"detailsError",message:n.message||"Failed to load issues."})}finally{this._view.webview.postMessage({type:"loadingDetails",loading:!1})}}}async syncDiagnostics(e){this.diagnosticCollection.clear();let t=new Map;for(let i of e){if(!i.filePath)continue;let n=await this.fileNavigator.resolveFilePath(i.filePath);if(!n)continue;let o=d.Uri.file(n),r=i.line&&i.line>0?i.line-1:0,s=new d.Range(r,0,r,100),a=d.DiagnosticSeverity.Information;i.severity==="BLOCKER"||i.severity==="CRITICAL"?a=d.DiagnosticSeverity.Error:i.severity==="MAJOR"&&(a=d.DiagnosticSeverity.Warning);let c=new d.Diagnostic(s,i.message,a);c.code=i.ruleKey,c.source="SonarQube";let l=t.get(o.toString())||{uri:o,diagnostics:[]};l.diagnostics.push(c),t.set(o.toString(),l)}for(let{uri:i,diagnostics:n}of t.values())this.diagnosticCollection.set(i,n)}async _syncState(){if(!this._view)return;let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken(),i=d.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),n=this.agentDispatcher.getAvailableAgents(),o=i;if(n.some(r=>r.id===o)||(o=n[0]?.id||"clipboard"),e.serverUrl&&e.hasToken&&t){this._view.webview.postMessage({type:"loading",loading:!0});let r=new f({serverUrl:e.serverUrl,token:t}),s=await r.fetchProjects(),a=e.projectKey;!a&&s.length>0&&(a=s[0].key,await this.projectDetector.setProjectKey(a));let c=null,l;if(a)try{c=await r.getOverview(a)}catch(v){l=v.message||"Failed to fetch project measures."}this._view.webview.postMessage({type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:a,detectedFromProperties:e.detectedFromProperties??!1,hasPlaintextWarning:e.hasPlaintextCredentialsWarning??!1,projects:s,overview:c,overviewError:l,defaultAgent:o,availableAgents:n}),this._view.webview.postMessage({type:"loading",loading:!1})}else this._view.webview.postMessage({type:"state",state:"onboarding",serverUrl:e.serverUrl||"http://localhost:9000",defaultAgent:o,availableAgents:n})}async _handleConnect(e,t){if(!e||!t){this._view?.webview.postMessage({type:"error",message:"Server URL and User Token are required."});return}this._view?.webview.postMessage({type:"connecting"});let n=await new f({serverUrl:e,token:t}).verifyConnection();if(!n.ok){this._view?.webview.postMessage({type:"error",message:n.message||"Connection verification failed."});return}await this.projectDetector.setServerUrl(e),await this.projectDetector.setToken(t),d.window.showInformationMessage("SonarQube connection successfully verified!"),await this._syncState()}async _handleDisconnect(){await this.projectDetector.deleteToken(),d.window.showInformationMessage("Disconnected from SonarQube."),await this._syncState()}_getHtmlForWebview(e){return`<!DOCTYPE html>
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
        <button id="header-disconnect-btn" class="icon-btn" title="Disconnect server">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1v7h1V1h-1z"/><path d="M3.05 3.05a7 7 0 1 0 9.9 0l-.7.7a6 6 0 1 1-8.5 0l-.7-.7z"/></svg>
        </button>
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
      <div id="loading-indicator" class="loading-overlay hidden">
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
    const batchActionBar = document.getElementById("batch-action-bar");
    const selectedCountLabel = document.getElementById("selected-count-label");
    const sendBatchBtn = document.getElementById("send-batch-btn");
    const deselectAllBtn = document.getElementById("deselect-all-btn");

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
    let currentItems = [];
    const selectedItemIds = new Set();

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

    function renderIssues(items, category) {
      currentItems = items;
      selectedItemIds.clear();
      updateBatchBar();

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
      });
    }

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
</html>`}};var h=y(require("vscode"));var S=class{static providedCodeActionKinds=[h.CodeActionKind.QuickFix];projectDetector;fileNavigator;customDispatcher;constructor(e){this.projectDetector=e.projectDetector,this.fileNavigator=e.fileNavigator??new b,this.customDispatcher=e.dispatcher}provideCodeActions(e,t,i,n){let o=[];for(let r of i.diagnostics)if(r.source&&r.source.toLowerCase().includes("sonar")){let s=r.code?`\u26A1 Send to AI Agent (${r.code})`:"\u26A1 Send to AI Agent (SonarQube)",a=new h.CodeAction(s,h.CodeActionKind.QuickFix);a.command={command:"sonarAgent.fixWithAgent",title:"Send to Agent",arguments:[r,e]},a.diagnostics=[r],a.isPreferred=!0,o.push(a)}return o}async executeFixWithAgent(e,t){let i=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken(),o;i.serverUrl&&n&&(o=new f({serverUrl:i.serverUrl,token:n}));let r=this.customDispatcher??new w({fileNavigator:this.fileNavigator,fetchRuleFn:o?j=>o.getEnrichedRule(j):void 0}),s=await r.getAvailableAgents(),c=h.workspace.getConfiguration("sonarAgent").get("defaultAgent");(!c||!s.some(j=>j.id===c))&&(c=s[0]?.id||"antigravity");let l="MAJOR";e.severity===h.DiagnosticSeverity.Error?l="CRITICAL":e.severity===h.DiagnosticSeverity.Information?l="MINOR":e.severity===h.DiagnosticSeverity.Hint&&(l="INFO");let v=h.workspace.asRelativePath?h.workspace.asRelativePath(t.uri):t.fileName,x={id:String(e.code||"sonar-issue"),ruleKey:String(e.code||""),message:e.message,component:v,filePath:v,line:e.range.start.line+1,severity:l,type:"CODE_SMELL",status:"OPEN",tags:[],creationDate:new Date().toISOString()},A=await r.assemblePrompt(x);return r.dispatch(A,c,x)}};function z(p){let e=m.workspace.workspaceFolders?.[0]?.uri.fsPath,t=new I({secretStorage:p.secrets,workspaceConfig:{get:(o,r)=>m.workspace.getConfiguration("sonarAgent").get(o,r),update:(o,r,s)=>m.workspace.getConfiguration("sonarAgent").update(o,r,s)},workspaceRoot:e}),i=new k(p.extensionUri,t);p.subscriptions.push(m.window.registerWebviewViewProvider(k.viewType,i)),p.subscriptions.push(m.commands.registerCommand("sonarAgent.refresh",async()=>{await i.refresh()})),p.subscriptions.push(m.commands.registerCommand("sonarAgent.configure",async()=>{await i.promptConfigureConnection()})),p.subscriptions.push(m.commands.registerCommand("sonarAgent.selectProject",async()=>{await i.promptProjectSelection()})),p.subscriptions.push(m.commands.registerCommand("sonarAgent.resetConnection",async()=>{await m.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await t.deleteToken(),await i.refresh(),m.window.showInformationMessage("SonarQube credentials have been removed."))}));let n=new S({projectDetector:t});p.subscriptions.push(m.languages.registerCodeActionsProvider({scheme:"file"},n,{providedCodeActionKinds:S.providedCodeActionKinds})),p.subscriptions.push(m.commands.registerCommand("sonarAgent.fixWithAgent",async(o,r)=>{!o||!r||await n.executeFixWithAgent(o,r)}))}function V(){}0&&(module.exports={activate,deactivate});
