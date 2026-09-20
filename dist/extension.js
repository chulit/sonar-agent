"use strict";var z=Object.create;var j=Object.defineProperty;var K=Object.getOwnPropertyDescriptor;var H=Object.getOwnPropertyNames;var V=Object.getPrototypeOf,W=Object.prototype.hasOwnProperty;var Q=(d,e)=>{for(var t in e)j(d,t,{get:e[t],enumerable:!0})},T=(d,e,t,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let n of H(e))!W.call(d,n)&&n!==t&&j(d,n,{get:()=>e[n],enumerable:!(r=K(e,n))||r.enumerable});return d};var x=(d,e,t)=>(t=d!=null?z(V(d)):{},T(e||!d||!d.__esModule?j(t,"default",{value:d,enumerable:!0}):t,d)),G=d=>T(j({},"__esModule",{value:!0}),d);var X={};Q(X,{activate:()=>Y,deactivate:()=>J});module.exports=G(X);var y=x(require("vscode"));var B=x(require("node:path")),R=x(require("node:fs/promises")),L="sonarAgent.token",D=class d{secrets;config;workspaceRoot;readFileFn;activeProjectKey;activeServerUrl;activeToken;constructor(e){this.secrets=e.secretStorage,this.config=e.workspaceConfig,this.workspaceRoot=e.workspaceRoot,this.readFileFn=e.readFileFn??(t=>R.readFile(t,"utf-8"))}static parseProperties(e){let t=e.split(/\r?\n/),r,n,i=!1;for(let o of t){let s=o.trim();if(!s||s.startsWith("#")||s.startsWith(";"))continue;let a=s.indexOf("=");if(a===-1)continue;let c=s.slice(0,a).trim(),p=s.slice(a+1).trim();c==="sonar.projectKey"?r=p:c==="sonar.host.url"?n=p:(c==="sonar.login"||c==="sonar.password"||c==="sonar.token")&&(i=!0)}return{projectKey:r,serverUrl:n,hasPlaintextCredentials:i}}async getToken(){if(this.activeToken!==void 0)return this.activeToken??void 0;let e=await this.secrets.get(L);return this.activeToken=e?e.trim():null,this.activeToken??void 0}async setToken(e){this.activeToken=e.trim(),await this.secrets.store(L,this.activeToken)}async deleteToken(){this.activeToken=null,await this.secrets.delete(L)}async setServerUrl(e){this.activeServerUrl=e.trim(),await this.config.update("serverUrl",this.activeServerUrl,!0)}async setProjectKey(e){this.activeProjectKey=e.trim(),await this.config.update("projectKey",this.activeProjectKey,!0)}isConfiguredSync(){let e=this.activeServerUrl??this.config.get("serverUrl","");return this.activeToken!==void 0?!!(e&&this.activeToken):!!e}async detectWorkspaceProperties(){if(!this.workspaceRoot)return null;let e=B.join(this.workspaceRoot,"sonar-project.properties");try{let t=await this.readFileFn(e);return d.parseProperties(t)}catch{return null}}async getConfig(){let e=this.activeServerUrl??this.config.get("serverUrl",""),t=this.activeProjectKey??this.config.get("projectKey",""),r=!1,n=!1,i=await this.detectWorkspaceProperties();i&&(i.projectKey&&(t=i.projectKey,r=!0),!e&&i.serverUrl&&(e=i.serverUrl),i.hasPlaintextCredentials&&(n=!0));let o=await this.getToken();return{serverUrl:e,projectKey:t,hasToken:!!(o&&o.trim().length>0),detectedFromProperties:r,hasPlaintextCredentialsWarning:n}}};var l=x(require("vscode"));var C=class{serverUrl;token;fetchFn;constructor(e){this.serverUrl=e.serverUrl.replace(/\/+$/,""),this.token=e.token?e.token.trim():void 0,this.fetchFn=e.fetchFn??globalThis.fetch}getAuthHeader(){return this.token?{Authorization:`Basic ${Buffer.from(`${this.token}:`).toString("base64")}`}:{}}parseRating(e){let t=typeof e=="number"?e:parseFloat(String(e||"1.0"));return t<=1?"A":t<=2?"B":t<=3?"C":t<=4?"D":"E"}extractFilePath(e){let t=e.indexOf(":");return t!==-1?e.slice(t+1):e}async authenticatedFetch(e,t=1e4){let r={Accept:"application/json",...this.getAuthHeader()},n=new AbortController,i=setTimeout(()=>n.abort(),t);try{let o=await this.fetchFn(e,{method:"GET",headers:r,signal:n.signal});if(o.status===401&&this.token){let s={Accept:"application/json",Authorization:`Bearer ${this.token}`},a=await this.fetchFn(e,{method:"GET",headers:s,signal:n.signal});if(a.ok)return a}return o}catch(o){throw o.name==="AbortError"||n.signal.aborted?new Error(`Connection timed out after ${t/1e3}s`,{cause:o}):o}finally{clearTimeout(i)}}async verifyConnection(){try{let e=`${this.serverUrl}/api/authentication/validate`,t=await this.authenticatedFetch(e);if(t.status===401||t.status===403)return{ok:!1,message:`Authentication failed (HTTP ${t.status}). Please verify your token.`};if(!t.ok)return{ok:!1,message:`Server returned HTTP ${t.status}: ${t.statusText}`};let r=await t.json();return r&&r.valid===!0?{ok:!0}:{ok:!1,message:"Invalid credentials: SonarQube reported token as invalid."}}catch(e){return{ok:!1,message:`Cannot reach SonarQube server at ${this.serverUrl}: ${e.message||String(e)}`}}}async fetchProjects(){let e=[`${this.serverUrl}/api/components/search?qualifiers=TRK&ps=100`,`${this.serverUrl}/api/projects/search?ps=100`,`${this.serverUrl}/api/components/search_projects?ps=100`,`${this.serverUrl}/api/projects/search?ps=100&qualifiers=TRK`,`${this.serverUrl}/api/components/search?qualifiers=TRK`];for(let t of e)try{let r=await this.authenticatedFetch(t,4e3);if(!r.ok)continue;let n=await r.json(),i=n.components||n.projects||n.results||(Array.isArray(n)?n:[]);if(Array.isArray(i)&&i.length>0)return i.map(o=>({key:o.key||o.id||o.projectKey,name:o.name||o.key}))}catch{}return[]}async getOverview(e){let t=["bugs","reliability_rating","vulnerabilities","security_rating","code_smells","sqale_rating","accepted_issues","wont_fix_issues","coverage","lines_to_cover","duplicated_lines_density","duplicated_lines","security_hotspots"].join(","),r=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${t}`,n=await this.authenticatedFetch(r);if(!n.ok&&n.status===400)try{let c=((await n.clone().json())?.errors?.[0]?.msg||"").match(/The following metric keys are not found:\s*([^.]+)/i);if(c&&c[1]){let p=c[1].split(",").map(g=>g.trim()),v=t.split(",").filter(g=>!p.includes(g)).join(","),b=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${v}`,h=await this.authenticatedFetch(b);h.ok&&(n=h)}}catch{}if(!n.ok)throw new Error(`Failed to fetch measures: HTTP ${n.status} ${n.statusText}`);let i=await n.json(),o={};for(let s of i.component?.measures||[])s.value!==void 0&&(o[s.metric]=s.value);return{security:{count:parseInt(o.vulnerabilities||"0",10),rating:this.parseRating(o.security_rating)},reliability:{count:parseInt(o.bugs||"0",10),rating:this.parseRating(o.reliability_rating)},maintainability:{count:parseInt(o.code_smells||"0",10),rating:this.parseRating(o.sqale_rating)},acceptedIssues:{count:parseInt(o.accepted_issues||o.wont_fix_issues||"0",10)},coverage:{percentage:parseFloat(o.coverage||"0"),linesToCover:parseInt(o.lines_to_cover||"0",10)},duplications:{percentage:parseFloat(o.duplicated_lines_density||"0"),duplicatedLines:parseInt(o.duplicated_lines||"0",10)},securityHotspots:{count:parseInt(o.security_hotspots||"0",10),rating:"A"}}}async getIssues(e,t){let r;if(t==="accepted")r=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=BUG,VULNERABILITY,CODE_SMELL&issueStatuses=ACCEPTED&ps=100`;else{let o="BUG,VULNERABILITY,CODE_SMELL";t==="reliability"?o="BUG":t==="security"?o="VULNERABILITY":t==="maintainability"&&(o="CODE_SMELL"),r=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=${o}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`}let n=await this.authenticatedFetch(r);if(!n.ok&&t==="accepted"){let o=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=BUG,VULNERABILITY,CODE_SMELL&resolutions=WONTFIX&ps=100`,s=await this.authenticatedFetch(o);s.ok&&(n=s)}if(!n.ok)throw new Error(`Failed to fetch issues: HTTP ${n.status} ${n.statusText}`);return((await n.json()).issues||[]).map(o=>({id:o.key,ruleKey:o.rule||"",message:o.message||"",component:o.component||"",filePath:this.extractFilePath(o.component||""),line:o.line,type:o.type||"CODE_SMELL",severity:o.severity||"MAJOR",status:o.status||"OPEN",effort:o.effort,tags:o.tags||[],creationDate:o.creationDate||"",author:o.author||void 0}))}async getHotspots(e){let t=`${this.serverUrl}/api/hotspots/search?projectKey=${encodeURIComponent(e)}&status=TO_REVIEW&ps=100`,r=await this.authenticatedFetch(t);if(!r.ok)throw new Error(`Failed to fetch hotspots: HTTP ${r.status} ${r.statusText}`);return((await r.json()).hotspots||[]).map(i=>({id:i.key,ruleKey:i.ruleKey||"",message:i.message||"",component:i.component||"",filePath:this.extractFilePath(i.component||""),line:i.line,type:"HOTSPOT",severity:"MAJOR",status:i.status||"TO_REVIEW",tags:["security-hotspot"],creationDate:i.creationDate||"",author:i.author||void 0}))}async getEnrichedRule(e){try{let t=`${this.serverUrl}/api/rules/show?key=${encodeURIComponent(e)}`,r=await this.authenticatedFetch(t);if(!r.ok)return{key:e,name:e,cleanDesc:"Verify code adherence to Sonar rule guidelines."};let n=await r.json(),o=(n.rule?.mdDesc||n.rule?.htmlDesc||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();return{key:n.rule?.key||e,name:n.rule?.name||e,cleanDesc:o||"Verify code adherence to Sonar rule guidelines."}}catch{return{key:e,name:e,cleanDesc:"Verify code adherence to Sonar rule guidelines."}}}async getCoverageFiles(e){let t=`${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(e)}&metricKeys=uncovered_lines,coverage&qualifiers=FIL&strategy=leaves&s=metric&metricSort=uncovered_lines&asc=false&ps=100`,r=await this.authenticatedFetch(t);if(!r.ok)throw new Error(`Failed to fetch coverage files: HTTP ${r.status} ${r.statusText}`);let n=await r.json(),i=[];for(let o of n.components||[]){let s={};for(let p of o.measures||[])s[p.metric]=p.value;let a=parseInt(s.uncovered_lines||"0",10),c=parseFloat(s.coverage||"0");(a>0||c<80)&&i.push({id:o.key,ruleKey:"coverage:uncovered_lines",message:`${a} uncovered lines (${c.toFixed(0)}% coverage)`,component:o.key,filePath:o.path||this.extractFilePath(o.key),type:"COVERAGE",severity:c<50?"CRITICAL":"MAJOR",status:"UNCOVERED",effort:`${a} lines`,tags:["test-coverage","unit-test"],creationDate:new Date().toISOString()})}return i}async getDuplicationFiles(e){let t=`${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(e)}&metricKeys=duplicated_lines_density,duplicated_blocks&qualifiers=FIL&strategy=leaves&s=metric&metricSort=duplicated_lines_density&asc=false&ps=100`,r=await this.authenticatedFetch(t);if(!r.ok)throw new Error(`Failed to fetch duplication files: HTTP ${r.status} ${r.statusText}`);let n=await r.json(),i=[];for(let o of n.components||[]){let s={};for(let p of o.measures||[])s[p.metric]=p.value;let a=parseFloat(s.duplicated_lines_density||"0"),c=parseInt(s.duplicated_blocks||"0",10);(a>0||c>0)&&i.push({id:o.key,ruleKey:"duplications:duplicated_code",message:`${a.toFixed(1)}% duplicated lines (${c} duplicated blocks)`,component:o.key,filePath:o.path||this.extractFilePath(o.key),type:"DUPLICATION",severity:a>20?"CRITICAL":"MAJOR",status:"DUPLICATED",effort:`${c} blocks`,tags:["code-duplication","refactoring"],creationDate:new Date().toISOString()})}return i}};var I=x(require("node:path")),U=x(require("node:fs/promises")),f=x(require("vscode")),k=class{workspaceRoot;fileExistsFn;findFilesFn;constructor(e){this.workspaceRoot=e?.workspaceRoot??f.workspace.workspaceFolders?.[0]?.uri.fsPath,this.fileExistsFn=e?.fileExistsFn??(async t=>{try{return await U.stat(t),!0}catch{return!1}}),this.findFilesFn=e?.findFilesFn??(async t=>(await f.workspace.findFiles(t,"**/node_modules/**",5)).map(n=>n.fsPath))}async resolveFilePath(e){if(!this.workspaceRoot)return null;let t=I.isAbsolute(e)?e:I.join(this.workspaceRoot,e);if(await this.fileExistsFn(t))return t;let r=I.basename(e);if(r){let n=await this.findFilesFn(`**/${r}`);if(n&&n.length>0)return n[0]}return null}async openFileAtLine(e,t){let r=await this.resolveFilePath(e);if(!r)return f.window.showWarningMessage(`Could not find file locally: ${e}`),!1;try{let n=f.Uri.file(r),i=await f.workspace.openTextDocument(n),o=await f.window.showTextDocument(i,{preview:!1});if(t!==void 0&&t>0){let s=t-1,a=new f.Position(s,0);o.selection=new f.Selection(a,a),o.revealRange(new f.Range(a,a),f.TextEditorRevealType.InCenter)}return!0}catch(n){return f.window.showErrorMessage(`Failed to open file: ${n.message||String(n)}`),!1}}};var M=x(require("node:path")),$=x(require("node:fs/promises")),m=x(require("vscode"));var S=class{ruleCache=new Map;fileNavigator;fetchRuleFn;readCodeSnippetFn;isExtensionInstalledFn;isAntigravityEnvFn;executeCommandFn;sendToAgentPanelFn;constructor(e){this.fileNavigator=e?.fileNavigator??new k,this.fetchRuleFn=e?.fetchRuleFn,this.readCodeSnippetFn=e?.readCodeSnippetFn,this.executeCommandFn=e?.executeCommandFn??((t,...r)=>m.commands.executeCommand(t,...r)),this.sendToAgentPanelFn=e?.sendToAgentPanelFn??(t=>{let r=m.antigravityExtensibility;return r&&typeof r.sendToAgentPanel=="function"?r.sendToAgentPanel(t):Promise.reject(new Error("antigravityExtensibility.sendToAgentPanel not available"))}),this.isExtensionInstalledFn=e?.isExtensionInstalledFn??(t=>{try{return!!m.extensions.getExtension(t)}catch{return!1}}),this.isAntigravityEnvFn=e?.isAntigravityEnvFn??(()=>{try{return!!((m.env.appName||"").toLowerCase().includes("antigravity")||process.env.GEMINI_CLI||process.env.ANTIGRAVITY_IDE||process.env.ANTIGRAVITY_AGENT)}catch{return!1}})}getAvailableAgents(){let e=[];return(this.isExtensionInstalledFn("github.copilot")||this.isExtensionInstalledFn("github.copilot-chat"))&&e.push({id:"copilot",name:"GitHub Copilot",description:"VS Code Copilot Chat",focusCommand:"workbench.action.chat.open"}),(this.isAntigravityEnvFn()||this.isExtensionInstalledFn("google.antigravity")||this.isExtensionInstalledFn("google.gemini"))&&e.push({id:"antigravity",name:"Antigravity Agent",description:"DeepMind Antigravity Agent",focusCommand:"antigravity.openChatView"}),this.isExtensionInstalledFn("anthropic.claude-code")&&e.push({id:"claude-code",name:"Claude Code",description:"Anthropic Claude Code for VS Code",focusCommand:"workbench.view.extension.claude-sidebar"}),this.isExtensionInstalledFn("saoudrizwan.claude-dev")&&e.push({id:"cline",name:"Cline",description:"Autonomous AI coding agent",focusCommand:"claude-dev.focus"}),this.isExtensionInstalledFn("rooveterinaryinc.roo-cline")&&e.push({id:"roo-code",name:"Roo Code",description:"Roo Code coding agent",focusCommand:"roo-cline.focus"}),this.isExtensionInstalledFn("continue.continue")&&e.push({id:"continue",name:"Continue",description:"Continue open-source AI assistant",focusCommand:"continue.focusContinueInputView"}),e.push({id:"clipboard",name:"Clipboard Only",description:"Copy prompt to clipboard"}),e}async getRule(e){if(this.ruleCache.has(e))return this.ruleCache.get(e);let t;return this.fetchRuleFn?t=await this.fetchRuleFn(e):t={key:e,name:e,cleanDesc:"Adhere to SonarQube quality standard for this rule."},this.ruleCache.set(e,t),t}detectLanguage(e){switch(M.extname(e).toLowerCase()){case".ts":case".tsx":return"typescript";case".js":case".jsx":return"javascript";case".vue":return"vue";case".html":return"html";case".css":return"css";case".py":return"python";case".java":return"java";case".go":return"go";case".rs":return"rust";default:return""}}async readCodeSnippet(e,t){if(this.readCodeSnippetFn)return this.readCodeSnippetFn(e,t);let r=await this.fileNavigator.resolveFilePath(e);if(!r)return null;try{let i=(await $.readFile(r,"utf-8")).split(/\r?\n/),o=i.length,s=t!==void 0&&t>0?t:1,a=Math.max(1,s-10),c=Math.min(o,s+10),p=[];for(let v=a;v<=c;v++){let b=i[v-1],h=v===s?" ---> [ISSUE HERE] ":"      ";p.push(`${v.toString().padStart(4," ")} |${h}${b}`)}return{snippet:p.join(`
`),startLine:a,endLine:c,language:this.detectLanguage(e)}}catch{return null}}async assemblePrompt(e){let t=await this.readCodeSnippet(e.filePath,e.line);if(e.type==="COVERAGE"){let i=`@workspace Please generate unit tests to improve test coverage for the following file:

`;return i+=`### \u{1F4CD} Target File
`,i+=`- File: \`${e.filePath}\`
`,i+=`- Status: ${e.message}

`,t&&(i+=`### \u{1F4BB} Local Code Snippet (\`${e.filePath}\`)
`,i+=`\`\`\`${t.language}
${t.snippet}
\`\`\`

`),i+=`### \u{1F3AF} Instructions for Agent
`,i+=`1. Analyze the code in \`${e.filePath}\`.
`,i+=`2. Generate comprehensive unit tests covering untested functions, branches, and lines.
`,i+=`3. Use testing frameworks and conventions consistent with this project.
`,i}if(e.type==="DUPLICATION"){let i=`@workspace Please refactor duplicated code in the following file:

`;return i+=`### \u{1F4CD} Target File
`,i+=`- File: \`${e.filePath}\`
`,i+=`- Status: ${e.message}

`,t&&(i+=`### \u{1F4BB} Local Code Snippet (\`${e.filePath}\`)
`,i+=`\`\`\`${t.language}
${t.snippet}
\`\`\`

`),i+=`### \u{1F3AF} Instructions for Agent
`,i+=`1. Identify repeated/duplicated code blocks in \`${e.filePath}\`.
`,i+=`2. Extract repeated logic into a helper function, shared method, or reusable module.
`,i+=`3. Ensure existing behavior, inputs, and outputs remain intact without regressions.
`,i}let r=await this.getRule(e.ruleKey),n=`@workspace Please fix the following SonarQube issue:

`;return n+=`### \u{1F4CD} Location
`,n+=`- File: \`${e.filePath}\`
`,n+=`- Line: ${e.line||"File level"}

`,n+=`### \u26A0\uFE0F Issue Details
`,n+=`- Message: "${e.message}"
`,n+=`- Type: ${e.type} | Severity: ${e.severity}
`,n+=`- Sonar Rule: \`${r.key}\` - ${r.name}

`,n+=`### \u{1F4D6} SonarQube Rule Details
`,n+=`${r.cleanDesc}
`,r.recommendation&&(n+=`> Sonar Recommendation: ${r.recommendation}
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

`,r=new Map;for(let n of e){let i=r.get(n.filePath)||[];i.push(n),r.set(n.filePath,i)}for(let[n,i]of r){t+=`## \u{1F4C1} File: \`${n}\` (${i.length} issues)

`;for(let o=0;o<i.length;o++){let s=i[o],a=await this.getRule(s.ruleKey),c=await this.readCodeSnippet(s.filePath,s.line);t+=`### Issue #${o+1}: Line ${s.line||"File level"} [${s.severity}] ${a.name}
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
`,t}async dispatch(e,t,r,n){try{await m.env.clipboard.writeText(e)}catch{}if(r&&r.line&&await this.fileNavigator.openFileAtLine(r.filePath,r.line),t==="copilot")try{return await this.executeCommandFn("workbench.action.chat.open",{query:e}),m.window.showInformationMessage("Dispatched Fix Prompt to GitHub Copilot Chat!"),{ok:!0,message:"Dispatched to GitHub Copilot Chat."}}catch{return m.window.showInformationMessage("Prompt copied to clipboard! Paste it into GitHub Copilot Chat."),{ok:!0,message:"Copied to clipboard (Copilot chat command not found)."}}if(t==="antigravity"){try{let s=[],a=n&&n.length>0?n:r?[r]:[],c=new Set;for(let p of a)if(p.filePath){let v=await this.fileNavigator.resolveFilePath(p.filePath);if(v&&!c.has(v)){c.add(v);let b=p.line&&p.line>0?p.line-1:0;s.push({uri:m.Uri.file(v),startLine:b,endLine:b})}}return await this.sendToAgentPanelFn({message:e,files:s.length>0?s:void 0,autoSend:!1}),m.window.showInformationMessage("Dispatched Fix Prompt to Antigravity Chat!"),{ok:!0,message:"Dispatched to Antigravity Chat."}}catch{}for(let s of["workbench.action.chat.open","antigravity.prioritized.chat.open","workbench.action.openChat"])try{return await this.executeCommandFn(s,{query:e}),m.window.showInformationMessage("Dispatched Fix Prompt to Antigravity Chat!"),{ok:!0,message:"Dispatched to Antigravity Chat."}}catch{}try{return await this.executeCommandFn("antigravity.openChatView"),m.window.showInformationMessage("Antigravity Chat opened & prompt copied to clipboard! Press Cmd+V / Ctrl+V to paste."),{ok:!0,message:"Chat opened and prompt ready in clipboard."}}catch{return m.window.showInformationMessage("Fix Prompt copied to clipboard for Antigravity Agent! Paste it into your agent chat."),{ok:!0,message:"Prompt ready in clipboard for Antigravity Agent."}}}let i=this.getAvailableAgents().find(s=>s.id===t),o=i?.name||(t==="claude-code"?"Claude Code":t==="cline"?"Cline":t==="roo-code"?"Roo Code":t==="continue"?"Continue":"Clipboard");if(t==="claude-code"){let s=["workbench.view.extension.claude-sidebar","claude-code.focus","claude.focus"];for(let a of s)try{await this.executeCommandFn(a);break}catch{}}else if(i?.focusCommand)try{await this.executeCommandFn(i.focusCommand)}catch{}return t==="clipboard"?(m.window.showInformationMessage("Fix Prompt copied to clipboard!"),{ok:!0,message:"Prompt ready in clipboard."}):(m.window.showInformationMessage(`Fix Prompt copied to clipboard for ${o}! Paste it into your agent chat.`),{ok:!0,message:`Prompt ready in clipboard for ${o}.`})}};var _=x(require("vscode")),u=class{static channel;static initialize(e){return e?this.channel=e:this.channel||(this.channel=_.window.createOutputChannel("Sonar Agent",{log:!0})),this.channel}static sanitize(e){if(!e)return"";let t=e.replace(/https?:\/\/[^\s"'`<>]+/gi,"[SERVER]");return t=t.replace(/(token|bearer|authorization|password)\s*[:=]\s*[^\s,;&]+/gi,"$1: [REDACTED]"),t}static info(e){this.channel||this.initialize(),this.channel?.info(this.sanitize(e))}static warn(e){this.channel||this.initialize(),this.channel?.warn(this.sanitize(e))}static error(e,t){this.channel||this.initialize();let r="";t&&(t instanceof Error?r=` - ${t.message}`:r=` - ${String(t)}`),this.channel?.error(this.sanitize(`${e}${r}`))}static debug(e){this.channel||this.initialize(),this.channel?.debug(this.sanitize(e))}static show(){this.channel?.show(!0)}static dispose(){this.channel?.dispose(),this.channel=void 0}};var A=class{constructor(e,t,r,n,i){this.extensionUri=e;this.projectDetector=t;this.fileNavigator=r??new k,this.agentDispatcher=n??new S({fileNavigator:this.fileNavigator}),this.diagnosticCollection=i??l.languages.createDiagnosticCollection("SonarQube")}static viewType="sonarAgent.overviewView";_view;_webviewReady=!1;_lastStateMessage;fileNavigator;agentDispatcher;diagnosticCollection;resolveWebviewView(e,t,r){this._view=e,this._webviewReady=!1;let n=this.projectDetector.isConfiguredSync?.()??!1;u.info(`[Host] resolveWebviewView called. visible=${e.visible}, isConfigured=${n}`),e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtmlForWebview(e.webview,n),e.webview.onDidReceiveMessage(async i=>{try{switch(u.info(`[Host] onDidReceiveMessage: command=${i.command}${i.text?` text="${i.text}"`:""}`),i.command){case"log":{u.info(`[Webview] ${i.text}`);break}case"ready":case"init":{this._webviewReady=!0,this._lastStateMessage&&this._view&&await this._view.webview.postMessage(this._lastStateMessage),await this._syncState();break}case"connect":{await this._handleConnect(i.serverUrl,i.token);break}case"disconnect":{await this._handleDisconnect();break}case"selectProject":{i.projectKey&&(await this.projectDetector.setProjectKey(i.projectKey),await this._syncState());break}case"openProjectPicker":{await this.promptProjectSelection();break}case"fetchDetails":{await this._handleFetchDetails(i.category);break}case"openFile":{await this.fileNavigator.openFileAtLine(i.filePath,i.line);break}case"sendToAgent":{await this._handleSendToAgent(i.item,i.targetAgentId);break}case"sendBatchToAgent":{await this._handleSendBatchToAgent(i.items,i.targetAgentId);break}case"setTargetAgent":{await l.workspace.getConfiguration("sonarAgent").update("defaultAgent",i.agentId,!0);break}case"refresh":{await this._syncState();break}}}catch(o){console.error("[SonarAgent] Webview message handling error:",o),this._view?.webview.postMessage({type:"error",message:o?.message||"Error processing request."})}}),this._syncState(),e.onDidChangeVisibility(()=>{e.visible&&this._syncState()})}async refresh(){this._view&&await this._syncState()}async promptProjectSelection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!e.serverUrl||!t){l.window.showWarningMessage("Please connect to SonarQube first.");return}let n=await new C({serverUrl:e.serverUrl,token:t}).fetchProjects(),i={label:"$(edit) Enter Project Key manually...",description:"Type the exact project key from SonarQube",detail:"Use this if your project is not listed or search is restricted"},o=[i,...n.map(a=>({label:a.name,description:a.key,detail:a.key===e.projectKey?"(Currently selected)":void 0}))],s=await l.window.showQuickPick(o,{placeHolder:"Select a SonarQube project or enter key manually",matchOnDescription:!0});if(s===i){let a=await l.window.showInputBox({prompt:"Enter the SonarQube Project Key",placeHolder:"e.g. org.company:my-project",value:e.projectKey||"",validateInput:c=>c.trim()?null:"Project Key cannot be empty"});if(a&&a.trim()){let c=a.trim();await this.projectDetector.setProjectKey(c),await this._syncState(),l.window.showInformationMessage(`Active SonarQube project set to: ${c}`)}return}s&&s.description&&(await this.projectDetector.setProjectKey(s.description),await this._syncState(),l.window.showInformationMessage(`Active SonarQube project set to: ${s.label}`))}async promptConfigureConnection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken(),r=!!(e.serverUrl&&t),n=[{label:"$(link) Update Server URL & Token",description:r?"Connected":"Not connected",detail:e.serverUrl?`Server: ${e.serverUrl}`:"Configure SonarQube host URL and authentication token",action:"updateCredentials"},{label:"$(folder-active) Select Sonar Project",description:e.projectKey?"Active":"Not selected",detail:e.projectKey?`Current project: ${e.projectKey}`:"Choose an active project on the server",action:"selectProject"},{label:"$(settings-gear) Open Extension Settings",detail:"Configure default AI agent and advanced preferences",action:"openSettings"},{label:"$(output) Show Extension Logs",detail:"Open the Sonar Agent output log channel",action:"showLogs"}];r&&n.push({label:"$(debug-disconnect) Disconnect & Reset Credentials",detail:"Remove stored token from OS Keychain and disconnect",action:"disconnect"});let i=await l.window.showQuickPick(n,{placeHolder:"Sonar Agent: Configure Connection & Settings",matchOnDescription:!0,matchOnDetail:!0});if(i)switch(i.action){case"updateCredentials":await this.promptUpdateCredentials(e.serverUrl);break;case"selectProject":await this.promptProjectSelection();break;case"openSettings":await l.commands.executeCommand("workbench.action.openSettings","@ext:chulit.sonar-agent");break;case"showLogs":u.show();break;case"disconnect":await l.commands.executeCommand("sonarAgent.resetConnection");break}}async promptUpdateCredentials(e,t){let r=e||(await this.projectDetector.getConfig()).serverUrl||"http://localhost:9000",n=t||"";for(;;){let i=await l.window.showInputBox({title:"SonarQube Connection (1/2)",prompt:"Enter the SonarQube Server URL",placeHolder:"http://localhost:9000 or https://sonar.example.com",value:r,ignoreFocusOut:!0,validateInput:c=>{let p=c.trim();if(!p)return"Server URL is required";if(!p.startsWith("http://")&&!p.startsWith("https://"))return"Server URL must start with http:// or https://";try{if(!new URL(p).hostname)return"Please enter a valid URL with hostname"}catch{return"Please enter a valid URL"}return null}});if(i===void 0)return;r=i.trim();let o=await l.window.showInputBox({title:"SonarQube Connection (2/2)",prompt:"Enter your SonarQube User Token",placeHolder:"sqp_...",value:n,password:!0,ignoreFocusOut:!0,validateInput:c=>c.trim()?null:"User Token is required"});if(o===void 0)return;n=o.trim();let s={ok:!1};if(await l.window.withProgress({location:l.ProgressLocation.Notification,title:"Verifying SonarQube connection...",cancellable:!1},async()=>{s=await new C({serverUrl:r,token:n}).verifyConnection()}),!s.ok){if(await l.window.showErrorMessage(`SonarQube connection verification failed: ${s.message||"Unknown error"}`,"Retry","Cancel")==="Retry")continue;return}await this.projectDetector.setServerUrl(r),await this.projectDetector.setToken(n),l.window.showInformationMessage("SonarQube connection successfully verified and saved!"),(await this.projectDetector.getConfig()).projectKey||await this.promptProjectSelection(),await this.refresh();return}}async _handleSendToAgent(e,t){let r=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken(),i=t||l.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),o;r.serverUrl&&n&&(o=new C({serverUrl:r.serverUrl,token:n}));let s=new S({fileNavigator:this.fileNavigator,fetchRuleFn:o?c=>o.getEnrichedRule(c):void 0}),a=await s.assemblePrompt(e);await s.dispatch(a,i,e)}async _handleSendBatchToAgent(e,t){if(!e||e.length===0)return;let r=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken(),i=t||l.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),o;r.serverUrl&&n&&(o=new C({serverUrl:r.serverUrl,token:n}));let s=new S({fileNavigator:this.fileNavigator,fetchRuleFn:o?c=>o.getEnrichedRule(c):void 0}),a=await s.assembleBatchPrompt(e);await s.dispatch(a,i,e[0],e)}async _handleFetchDetails(e){if(!this._view)return;let t=await this.projectDetector.getConfig(),r=await this.projectDetector.getToken();if(!(!t.serverUrl||!t.projectKey||!r)){this._view.webview.postMessage({type:"loadingDetails",loading:!0});try{let n=new C({serverUrl:t.serverUrl,token:r}),i=[];e==="hotspots"?i=await n.getHotspots(t.projectKey):e==="coverage"?i=await n.getCoverageFiles(t.projectKey):e==="duplications"?i=await n.getDuplicationFiles(t.projectKey):e==="reliability"||e==="security"||e==="maintainability"||e==="accepted"?i=await n.getIssues(t.projectKey,e):i=await n.getIssues(t.projectKey),this._view.webview.postMessage({type:"details",category:e,items:i}),await this.syncDiagnostics(i)}catch(n){this._view.webview.postMessage({type:"detailsError",message:n.message||"Failed to load issues."})}finally{this._view.webview.postMessage({type:"loadingDetails",loading:!1})}}}async syncDiagnostics(e){this.diagnosticCollection.clear();let t=new Map;for(let r of e){if(!r.filePath)continue;let n=await this.fileNavigator.resolveFilePath(r.filePath);if(!n)continue;let i=l.Uri.file(n),o=r.line&&r.line>0?r.line-1:0,s=new l.Range(o,0,o,100),a=l.DiagnosticSeverity.Information;r.severity==="BLOCKER"||r.severity==="CRITICAL"?a=l.DiagnosticSeverity.Error:r.severity==="MAJOR"&&(a=l.DiagnosticSeverity.Warning);let c=new l.Diagnostic(s,r.message,a);c.code=r.ruleKey,c.source="SonarQube";let p=t.get(i.toString())||{uri:i,diagnostics:[]};p.diagnostics.push(c),t.set(i.toString(),p)}for(let{uri:r,diagnostics:n}of t.values())this.diagnosticCollection.set(r,n)}async _syncState(){if(this._view)try{let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken(),r=l.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),n=this.agentDispatcher.getAvailableAgents(),i=r;if(n.some(o=>o.id===i)||(i=n[0]?.id||"clipboard"),u.info(`[Host] _syncState: serverUrl=${e.serverUrl}, hasToken=${e.hasToken}, tokenPresent=${!!t}`),e.serverUrl&&e.hasToken&&t){let o={type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:e.projectKey,detectedFromProperties:e.detectedFromProperties??!1,hasPlaintextWarning:e.hasPlaintextCredentialsWarning??!1,projects:[],defaultAgent:i,availableAgents:n};this._lastStateMessage=o;let s=await this._view.webview.postMessage(o);u.info(`[Host] Immediate postMessage(connected) delivered=${s}`),await this._view.webview.postMessage({type:"loading",loading:!0});let a=new C({serverUrl:e.serverUrl,token:t}),c=e.projectKey,[p,v]=await Promise.allSettled([a.fetchProjects(),c?a.getOverview(c):Promise.resolve(null)]),b=p.status==="fulfilled"?p.value:[];p.status==="rejected"&&console.error("[SonarAgent] fetchProjects error:",p.reason);let h=c;!h&&b.length>0&&(h=b[0].key,await this.projectDetector.setProjectKey(h));let g=null,P;if(h&&h===c)v.status==="fulfilled"?(g=v.value,g&&u.info(`Measures updated for [${h}]: ${g.security.count} vulnerabilities, ${g.reliability.count} bugs, ${g.maintainability.count} smells, ${g.coverage.percentage.toFixed(1)}% coverage.`)):(P=v.reason?.message||"Failed to fetch project measures.",u.error(`Failed to fetch project measures for [${h}]`,P));else if(h)try{g=await a.getOverview(h),g&&u.info(`Measures updated for [${h}]: ${g.security.count} vulnerabilities, ${g.reliability.count} bugs, ${g.maintainability.count} smells, ${g.coverage.percentage.toFixed(1)}% coverage.`)}catch(O){P=O.message||"Failed to fetch project measures.",u.error(`Failed to fetch project measures for [${h}]`,P)}let F={type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:h,detectedFromProperties:e.detectedFromProperties??!1,hasPlaintextWarning:e.hasPlaintextCredentialsWarning??!1,projects:b,overview:g,overviewError:P,defaultAgent:i,availableAgents:n};this._lastStateMessage=F;let N=await this._view.webview.postMessage(F);u.info(`[Host] Full postMessage(connected) delivered=${N}`),await this._view.webview.postMessage({type:"loading",loading:!1}),!this._webviewReady&&this._view&&setTimeout(async()=>{!this._webviewReady&&this._view&&this._lastStateMessage&&await this._view.webview.postMessage(this._lastStateMessage)},350)}else{let o={type:"state",state:"onboarding",serverUrl:e.serverUrl||"http://localhost:9000",defaultAgent:i,availableAgents:n};this._lastStateMessage=o;let s=await this._view.webview.postMessage(o);u.info(`[Host] postMessage(onboarding) delivered=${s}`)}}catch(e){console.error("[SonarAgent] _syncState error:",e),u.error("Failed to synchronize Sonar Agent state",e),this._view?.webview.postMessage({type:"error",message:e.message||"Failed to synchronize Sonar Agent state."}),this._view?.webview.postMessage({type:"loading",loading:!1})}}async _handleConnect(e,t){let r=(t||"").trim(),n=(e||"").trim();if(!n||!r){this._view?.webview.postMessage({type:"error",message:"Server URL and User Token are required."});return}!n.startsWith("http://")&&!n.startsWith("https://")&&(n="http://"+n),n=n.replace(/\/+$/,""),this._view?.webview.postMessage({type:"connecting"}),u.info("Verifying SonarQube credentials...");try{let o=await new C({serverUrl:n,token:r}).verifyConnection();if(!o.ok){u.warn(`Connection verification failed: ${o.message||"Unknown error"}`),this._view?.webview.postMessage({type:"error",message:o.message||"Connection verification failed."});return}await this.projectDetector.setServerUrl(n),await this.projectDetector.setToken(r),u.info("SonarQube connection verified and saved."),l.window.showInformationMessage("SonarQube connection successfully verified!"),await this._syncState()}catch(i){console.error("[SonarAgent] _handleConnect error:",i),u.error("Unexpected connection error occurred",i),this._view?.webview.postMessage({type:"error",message:i?.message||"Unexpected connection error occurred."})}}async _handleDisconnect(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!!!(e.serverUrl&&t)){this._view?.webview.postMessage({type:"disconnected",message:"Connection credentials cleared."}),l.window.showInformationMessage("Sonar Agent connection inputs cleared.");return}await l.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await this.projectDetector.deleteToken(),u.info("SonarQube credentials removed and disconnected."),this._view?.webview.postMessage({type:"disconnected",message:"Disconnected from SonarQube. Credentials removed."}),l.window.showInformationMessage("SonarQube credentials have been removed."),await this._syncState())}_getHtmlForWebview(e,t=!1){let r=q();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${e.cspSource} 'unsafe-inline'; font-src ${e.cspSource}; img-src ${e.cspSource} https: data:; script-src 'nonce-${r}' ${e.cspSource}; connect-src ${e.cspSource} https:;">
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
        <button id="header-disconnect-btn" class="icon-btn ${t?"":"hidden"}" title="Disconnect server">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1v7h1V1h-1z"/><path d="M3.05 3.05a7 7 0 1 0 9.9 0l-.7.7a6 6 0 1 1-8.5 0l-.7-.7z"/></svg>
        </button>
      </div>
    </div>

    <!-- Onboarding Form -->
    <div id="onboarding-view" class="card ${t?"hidden":""}">
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
    <div id="connected-view" class="${t?"":"hidden"}" style="display: flex; flex-direction: column; gap: 10px;">
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
      <div id="loading-indicator" class="loading-overlay ${t?"":"hidden"}">
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

  <script nonce="${r}">
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
</html>`}};function q(){let d="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)d+=e.charAt(Math.floor(Math.random()*e.length));return d}var w=x(require("vscode"));var E=class{static providedCodeActionKinds=[w.CodeActionKind.QuickFix];projectDetector;fileNavigator;customDispatcher;constructor(e){this.projectDetector=e.projectDetector,this.fileNavigator=e.fileNavigator??new k,this.customDispatcher=e.dispatcher}provideCodeActions(e,t,r,n){let i=[];for(let o of r.diagnostics)if(o.source&&o.source.toLowerCase().includes("sonar")){let s=o.code?`\u26A1 Send to AI Agent (${o.code})`:"\u26A1 Send to AI Agent (SonarQube)",a=new w.CodeAction(s,w.CodeActionKind.QuickFix);a.command={command:"sonarAgent.fixWithAgent",title:"Send to Agent",arguments:[o,e]},a.diagnostics=[o],a.isPreferred=!0,i.push(a)}return i}async executeFixWithAgent(e,t){let r=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken(),i;r.serverUrl&&n&&(i=new C({serverUrl:r.serverUrl,token:n}));let o=this.customDispatcher??new S({fileNavigator:this.fileNavigator,fetchRuleFn:i?g=>i.getEnrichedRule(g):void 0}),s=await o.getAvailableAgents(),c=w.workspace.getConfiguration("sonarAgent").get("defaultAgent");(!c||!s.some(g=>g.id===c))&&(c=s[0]?.id||"antigravity");let p="MAJOR";e.severity===w.DiagnosticSeverity.Error?p="CRITICAL":e.severity===w.DiagnosticSeverity.Information?p="MINOR":e.severity===w.DiagnosticSeverity.Hint&&(p="INFO");let v=w.workspace.asRelativePath?w.workspace.asRelativePath(t.uri):t.fileName,b={id:String(e.code||"sonar-issue"),ruleKey:String(e.code||""),message:e.message,component:v,filePath:v,line:e.range.start.line+1,severity:p,type:"CODE_SMELL",status:"OPEN",tags:[],creationDate:new Date().toISOString()},h=await o.assemblePrompt(b);return o.dispatch(h,c,b)}};function Y(d){let e=u.initialize();d.subscriptions.push(e),u.info("Sonar Agent extension activated.");let t=y.workspace.workspaceFolders?.[0]?.uri.fsPath,r=new D({secretStorage:d.secrets,workspaceConfig:{get:(o,s)=>y.workspace.getConfiguration("sonarAgent").get(o,s),update:(o,s,a)=>y.workspace.getConfiguration("sonarAgent").update(o,s,a)},workspaceRoot:t}),n=new A(d.extensionUri,r);d.subscriptions.push(y.window.registerWebviewViewProvider(A.viewType,n)),d.subscriptions.push(y.commands.registerCommand("sonarAgent.refresh",async()=>{await n.refresh()})),d.subscriptions.push(y.commands.registerCommand("sonarAgent.configure",async()=>{await n.promptConfigureConnection()})),d.subscriptions.push(y.commands.registerCommand("sonarAgent.selectProject",async()=>{await n.promptProjectSelection()})),d.subscriptions.push(y.commands.registerCommand("sonarAgent.resetConnection",async()=>{await y.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await r.deleteToken(),await n.refresh(),y.window.showInformationMessage("SonarQube credentials have been removed."))})),d.subscriptions.push(y.commands.registerCommand("sonarAgent.showLogs",()=>{u.show()}));let i=new E({projectDetector:r});d.subscriptions.push(y.languages.registerCodeActionsProvider({scheme:"file"},i,{providedCodeActionKinds:E.providedCodeActionKinds})),d.subscriptions.push(y.commands.registerCommand("sonarAgent.fixWithAgent",async(o,s)=>{!o||!s||await i.executeFixWithAgent(o,s)}))}function J(){u.dispose()}0&&(module.exports={activate,deactivate});
