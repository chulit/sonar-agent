"use strict";var Y=Object.create;var T=Object.defineProperty;var J=Object.getOwnPropertyDescriptor;var X=Object.getOwnPropertyNames;var Z=Object.getPrototypeOf,ee=Object.prototype.hasOwnProperty;var te=(l,e)=>{for(var t in e)T(l,t,{get:e[t],enumerable:!0})},_=(l,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of X(e))!ee.call(l,i)&&i!==t&&T(l,i,{get:()=>e[i],enumerable:!(n=J(e,i))||n.enumerable});return l};var w=(l,e,t)=>(t=l!=null?Y(Z(l)):{},_(e||!l||!l.__esModule?T(t,"default",{value:l,enumerable:!0}):t,l)),ie=l=>_(T({},"__esModule",{value:!0}),l);var ae={};te(ae,{activate:()=>re,deactivate:()=>se});module.exports=ie(ae);var h=w(require("vscode"));var O=w(require("node:path")),K=w(require("node:fs/promises")),S="sonarAgent.token",N="profiles",M="activeProfileId",U=l=>`${S}.${l}`;function ne(l){return l.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+/,"").replace(/-+$/,"")||"profile"}var B=class l{secrets;config;workspaceRoot;readFileFn;activeProjectKey;activeServerUrl;activeToken;profileTokenCache=new Map;constructor(e){this.secrets=e.secretStorage,this.config=e.workspaceConfig,this.workspaceRoot=e.workspaceRoot,this.readFileFn=e.readFileFn??(t=>K.readFile(t,"utf-8"))}static parseProperties(e){let t=e.split(/\r?\n/),n,i,o=!1;for(let r of t){let s=r.trim();if(!s||s.startsWith("#")||s.startsWith(";"))continue;let a=s.indexOf("=");if(a===-1)continue;let c=s.slice(0,a).trim(),u=s.slice(a+1).trim();c==="sonar.projectKey"?n=u:c==="sonar.host.url"?i=u:(c==="sonar.login"||c==="sonar.password"||c==="sonar.token")&&(o=!0)}return{projectKey:n,serverUrl:i,hasPlaintextCredentials:o}}readProfiles(){return this.config.get(N,[])}readActiveId(){return this.config.get(M,void 0)||void 0}async persistProfiles(e,t){await this.config.update(N,e,!0),await this.config.update(M,t??"",!0)}async listProfiles(){return this.readProfiles().map(e=>({...e}))}async getActiveProfile(){let e=this.readActiveId();return e?this.readProfiles().find(t=>t.id===e)??null:null}async createProfile(e){let t=this.readProfiles(),n=new Set(t.map(a=>a.id)),i=ne(e.name),o=i,r=2;for(;n.has(o);)o=`${i}-${r++}`;let s={id:o,name:e.name.trim(),serverUrl:e.serverUrl.trim(),projectKey:e.projectKey.trim(),updatedAt:Date.now()};return await this.persistProfiles([...t,s],o),e.token!==void 0&&await this.updateProfileToken(o,e.token),{...s}}async activateProfile(e){if(!this.readProfiles().some(n=>n.id===e))throw new Error(`Unknown connection profile: ${e}`);await this.config.update(M,e,!0)}async updateProfileToken(e,t){if(!this.readProfiles().some(i=>i.id===e))throw new Error(`Unknown connection profile: ${e}`);let n=t.trim();this.profileTokenCache.set(e,n),await this.secrets.store(U(e),n)}async renameProfile(e,t){let i=this.readProfiles().map(r=>r.id===e?{...r,name:t.trim(),updatedAt:Date.now()}:r);await this.persistProfiles(i,this.readActiveId());let o=i.find(r=>r.id===e);if(!o)throw new Error(`Unknown connection profile: ${e}`);return{...o}}async deleteProfile(e){let t=this.readProfiles().filter(i=>i.id!==e),n=this.readActiveId();await this.persistProfiles(t,n===e?"":n),this.profileTokenCache.delete(e),await this.secrets.delete(U(e))}async updateProfileTarget(e,t){let i=this.readProfiles().map(r=>r.id===e?{...r,serverUrl:t.serverUrl!==void 0?t.serverUrl.trim():r.serverUrl,projectKey:t.projectKey!==void 0?t.projectKey.trim():r.projectKey,updatedAt:Date.now()}:r);await this.persistProfiles(i,this.readActiveId());let o=i.find(r=>r.id===e);if(!o)throw new Error(`Unknown connection profile: ${e}`);return{...o}}hasProfiles(){return this.readProfiles().length>0}async getToken(){if(this.hasProfiles()){let t=await this.getActiveProfile();if(!t)return;let n=this.profileTokenCache.get(t.id);if(n!==void 0)return n||void 0;let i=await this.secrets.get(U(t.id)),o=i?i.trim():null;return this.profileTokenCache.set(t.id,o),o??void 0}if(this.activeToken!==void 0)return this.activeToken??void 0;let e=await this.secrets.get(S);return this.activeToken=e?e.trim():null,this.activeToken??void 0}async setToken(e){if(this.hasProfiles()){let t=await this.getActiveProfile();if(t){await this.updateProfileToken(t.id,e);return}}this.activeToken=e.trim(),await this.secrets.store(S,this.activeToken)}async deleteToken(){if(this.hasProfiles()){let e=await this.getActiveProfile();if(e){this.profileTokenCache.delete(e.id),await this.secrets.delete(U(e.id));return}}this.activeToken=null,await this.secrets.delete(S)}async setServerUrl(e){if(this.hasProfiles()){let t=await this.getActiveProfile();if(t){await this.updateProfileTarget(t.id,{serverUrl:e});return}}this.activeServerUrl=e.trim(),await this.config.update("serverUrl",this.activeServerUrl,!0)}async setProjectKey(e){if(this.hasProfiles()){let t=await this.getActiveProfile();if(t){await this.updateProfileTarget(t.id,{projectKey:e});return}}this.activeProjectKey=e.trim(),await this.config.update("projectKey",this.activeProjectKey,!0)}isConfiguredSync(){if(this.hasProfiles()){let t=this.readProfiles().find(i=>i.id===this.readActiveId());if(!t?.serverUrl)return!1;let n=this.profileTokenCache.get(t.id);return n!==void 0?!!(t.serverUrl&&n):!0}let e=this.activeServerUrl??this.config.get("serverUrl","");return this.activeToken!==void 0?!!(e&&this.activeToken):!!e}async detectWorkspaceProperties(){if(!this.workspaceRoot)return null;let e=O.join(this.workspaceRoot,"sonar-project.properties");try{let t=await this.readFileFn(e);return l.parseProperties(t)}catch{return null}}async getCreationSuggestion(){let e=await this.detectWorkspaceProperties();return{serverUrl:e?.serverUrl,projectKey:e?.projectKey,hasPlaintextCredentials:e?.hasPlaintextCredentials??!1}}async migrateResetIfLegacy(){let e=await this.secrets.get(S),t=this.activeServerUrl??this.config.get("serverUrl",""),n=this.activeProjectKey??this.config.get("projectKey","");return e?.trim()||t||n?(this.activeToken=null,this.activeServerUrl=void 0,this.activeProjectKey=void 0,await this.secrets.delete(S),await this.config.update("serverUrl",void 0,!0),await this.config.update("projectKey",void 0,!0),!0):!1}async getConfig(){if(this.hasProfiles()){let i=await this.getActiveProfile();if(!i)return{serverUrl:"",projectKey:"",hasToken:!1,detectedFromProperties:!1};let o=await this.getToken();return{serverUrl:i.serverUrl,projectKey:i.projectKey,hasToken:!!(o&&o.trim().length>0),detectedFromProperties:!1}}let e=this.activeServerUrl??this.config.get("serverUrl",""),t=this.activeProjectKey??this.config.get("projectKey",""),n=await this.getToken();return{serverUrl:e,projectKey:t,hasToken:!!(n&&n.trim().length>0),detectedFromProperties:!1,hasPlaintextCredentialsWarning:!1}}};var W=w(require("node:crypto")),f=w(require("vscode"));var P=class{serverUrl;token;fetchFn;constructor(e){let t=e.serverUrl;for(;t.endsWith("/");)t=t.slice(0,-1);this.serverUrl=t,this.token=e.token?e.token.trim():void 0,this.fetchFn=e.fetchFn??globalThis.fetch}getAuthHeader(){return this.token?{Authorization:`Basic ${Buffer.from(`${this.token}:`).toString("base64")}`}:{}}parseRating(e){let t=typeof e=="number"?e:Number.parseFloat(String(e||"1.0"));return t<=1?"A":t<=2?"B":t<=3?"C":t<=4?"D":"E"}extractFilePath(e){let t=e.indexOf(":");return t!==-1?e.slice(t+1):e}async authenticatedFetch(e,t=1e4){let n={Accept:"application/json",...this.getAuthHeader()},i=new AbortController,o=setTimeout(()=>i.abort(),t);try{let r=await this.fetchFn(e,{method:"GET",headers:n,signal:i.signal});if(r.status===401&&this.token){let s={Accept:"application/json",Authorization:`Bearer ${this.token}`},a=await this.fetchFn(e,{method:"GET",headers:s,signal:i.signal});if(a.ok)return a}return r}catch(r){throw r.name==="AbortError"||i.signal.aborted?new Error(`Connection timed out after ${t/1e3}s`,{cause:r}):r}finally{clearTimeout(o)}}async verifyConnection(){try{let e=`${this.serverUrl}/api/authentication/validate`,t=await this.authenticatedFetch(e);return t.status===401||t.status===403?{ok:!1,message:`Authentication failed (HTTP ${t.status}). Please verify your token.`}:t.ok?(await t.json())?.valid===!0?{ok:!0}:{ok:!1,message:"Invalid credentials: SonarQube reported token as invalid."}:{ok:!1,message:`Server returned HTTP ${t.status}: ${t.statusText}`}}catch(e){return{ok:!1,message:`Cannot reach SonarQube server at ${this.serverUrl}: ${e.message||String(e)}`}}}async fetchProjects(){let e=[`${this.serverUrl}/api/components/search?qualifiers=TRK&ps=100`,`${this.serverUrl}/api/projects/search?ps=100`,`${this.serverUrl}/api/components/search_projects?ps=100`,`${this.serverUrl}/api/projects/search?ps=100&qualifiers=TRK`];for(let t of e)try{let n=await this.authenticatedFetch(t,4e3);if(!n.ok)continue;let i=await n.json(),o=i.components||i.projects||i.results||(Array.isArray(i)?i:[]);if(Array.isArray(o)&&o.length>0)return o.map(r=>({key:r.key||r.id||r.projectKey,name:r.name||r.key}))}catch{}return[]}async getOverview(e){let t=["bugs","reliability_rating","vulnerabilities","security_rating","code_smells","sqale_rating","accepted_issues","wont_fix_issues","coverage","lines_to_cover","duplicated_lines_density","duplicated_lines","security_hotspots","security_review_rating"].join(","),n=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${t}`,i=await this.authenticatedFetch(n);if(!i.ok&&i.status===400)try{let c=((await i.clone().json())?.errors?.[0]?.msg||"").match(/The following metric keys are not found:\s*([^.]+)/i);if(c?.[1]){let u=new Set(c[1].split(",").map(k=>k.trim())),g=t.split(",").filter(k=>!u.has(k)).join(","),v=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${g}`,C=await this.authenticatedFetch(v);C.ok&&(i=C)}}catch{}if(!i.ok)throw new Error(`Failed to fetch measures: HTTP ${i.status} ${i.statusText}`);let o=await i.json(),r={};for(let s of o.component?.measures||[])s.value!==void 0&&(r[s.metric]=s.value);return{security:{count:Number.parseInt(r.vulnerabilities||"0",10),rating:this.parseRating(r.security_rating)},reliability:{count:Number.parseInt(r.bugs||"0",10),rating:this.parseRating(r.reliability_rating)},maintainability:{count:Number.parseInt(r.code_smells||"0",10),rating:this.parseRating(r.sqale_rating)},acceptedIssues:{count:Number.parseInt(r.accepted_issues||r.wont_fix_issues||"0",10)},coverage:{percentage:Number.parseFloat(r.coverage||"0"),linesToCover:Number.parseInt(r.lines_to_cover||"0",10)},duplications:{percentage:Number.parseFloat(r.duplicated_lines_density||"0"),duplicatedLines:Number.parseInt(r.duplicated_lines||"0",10)},securityHotspots:{count:Number.parseInt(r.security_hotspots||"0",10),rating:this.parseRating(r.security_review_rating||"1.0")}}}async getIssues(e,t){let n;if(t==="accepted")n=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=BUG,VULNERABILITY,CODE_SMELL&issueStatuses=ACCEPTED&ps=100`;else{let r="BUG,VULNERABILITY,CODE_SMELL";t==="reliability"?r="BUG":t==="security"?r="VULNERABILITY":t==="maintainability"&&(r="CODE_SMELL"),n=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=${r}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`}let i=await this.authenticatedFetch(n);if(!i.ok&&t==="accepted"){let r=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=BUG,VULNERABILITY,CODE_SMELL&resolutions=WONTFIX&ps=100`,s=await this.authenticatedFetch(r);s.ok&&(i=s)}if(!i.ok)throw new Error(`Failed to fetch issues: HTTP ${i.status} ${i.statusText}`);return((await i.json()).issues||[]).map(r=>({id:r.key,ruleKey:r.rule||"",message:r.message||"",component:r.component||"",filePath:this.extractFilePath(r.component||""),line:r.line,type:r.type||"CODE_SMELL",severity:r.severity||"MAJOR",status:r.status||"OPEN",effort:r.effort,tags:r.tags||[],creationDate:r.creationDate||"",author:r.author||void 0}))}async getHotspots(e){let t=`${this.serverUrl}/api/hotspots/search?projectKey=${encodeURIComponent(e)}&status=TO_REVIEW&ps=100`,n=await this.authenticatedFetch(t);if(!n.ok)throw new Error(`Failed to fetch hotspots: HTTP ${n.status} ${n.statusText}`);return((await n.json()).hotspots||[]).map(o=>({id:o.key,ruleKey:o.ruleKey||"",message:o.message||"",component:o.component||"",filePath:this.extractFilePath(o.component||""),line:o.line,type:"HOTSPOT",severity:"MAJOR",status:o.status||"TO_REVIEW",tags:["security-hotspot"],creationDate:o.creationDate||"",author:o.author||void 0}))}async getEnrichedRule(e){try{let t=`${this.serverUrl}/api/rules/show?key=${encodeURIComponent(e)}`,n=await this.authenticatedFetch(t);if(!n.ok)return{key:e,name:e,cleanDesc:"Verify code adherence to Sonar rule guidelines."};let i=await n.json(),r=(i.rule?.mdDesc||i.rule?.htmlDesc||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();return{key:i.rule?.key||e,name:i.rule?.name||e,cleanDesc:r||"Verify code adherence to Sonar rule guidelines."}}catch{return{key:e,name:e,cleanDesc:"Verify code adherence to Sonar rule guidelines."}}}async getCoverageFiles(e){let t=`${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(e)}&metricKeys=uncovered_lines,coverage&qualifiers=FIL&strategy=leaves&s=metric&metricSort=uncovered_lines&asc=false&ps=100`,n=await this.authenticatedFetch(t);if(!n.ok)throw new Error(`Failed to fetch coverage files: HTTP ${n.status} ${n.statusText}`);let i=await n.json(),o=[];for(let r of i.components||[]){let s={};for(let u of r.measures||[])s[u.metric]=u.value;let a=Number.parseInt(s.uncovered_lines||"0",10),c=Number.parseFloat(s.coverage||"0");(a>0||c<80)&&o.push({id:r.key,ruleKey:"coverage:uncovered_lines",message:`${a} uncovered lines (${c.toFixed(0)}% coverage)`,component:r.key,filePath:r.path||this.extractFilePath(r.key),type:"COVERAGE",severity:c<50?"CRITICAL":"MAJOR",status:"UNCOVERED",effort:`${a} lines`,tags:["test-coverage","unit-test"],creationDate:new Date().toISOString()})}return o}async getDuplicationFiles(e){let t=`${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(e)}&metricKeys=duplicated_lines_density,duplicated_blocks&qualifiers=FIL&strategy=leaves&s=metric&metricSort=duplicated_lines_density&asc=false&ps=100`,n=await this.authenticatedFetch(t);if(!n.ok)throw new Error(`Failed to fetch duplication files: HTTP ${n.status} ${n.statusText}`);let i=await n.json(),o=[];for(let r of i.components||[]){let s={};for(let u of r.measures||[])s[u.metric]=u.value;let a=Number.parseFloat(s.duplicated_lines_density||"0"),c=Number.parseInt(s.duplicated_blocks||"0",10);(a>0||c>0)&&o.push({id:r.key,ruleKey:"duplications:duplicated_code",message:`${a.toFixed(1)}% duplicated lines (${c} duplicated blocks)`,component:r.key,filePath:r.path||this.extractFilePath(r.key),type:"DUPLICATION",severity:a>20?"CRITICAL":"MAJOR",status:"DUPLICATED",effort:`${c} blocks`,tags:["code-duplication","refactoring"],creationDate:new Date().toISOString()})}return o}};var A=w(require("node:path")),z=w(require("node:fs/promises")),m=w(require("vscode")),I=class{workspaceRoot;fileExistsFn;findFilesFn;constructor(e){this.workspaceRoot=e?.workspaceRoot??m.workspace.workspaceFolders?.[0]?.uri.fsPath,this.fileExistsFn=e?.fileExistsFn??(async t=>{try{return await z.stat(t),!0}catch{return!1}}),this.findFilesFn=e?.findFilesFn??(async t=>(await m.workspace.findFiles(t,"**/node_modules/**",5)).map(i=>i.fsPath))}async resolveFilePath(e){if(!this.workspaceRoot)return null;let t=A.isAbsolute(e)?e:A.join(this.workspaceRoot,e);if(await this.fileExistsFn(t))return t;let n=A.basename(e);if(n){let i=await this.findFilesFn(`**/${n}`);if(i&&i.length>0)return i[0]}return null}async openFileAtLine(e,t){let n=await this.resolveFilePath(e);if(!n)return m.window.showWarningMessage(`Could not find file locally: ${e}`),!1;try{let i=m.Uri.file(n),o=await m.workspace.openTextDocument(i),r=await m.window.showTextDocument(o,{preview:!1});if(t!==void 0&&t>0){let s=t-1,a=new m.Position(s,0);r.selection=new m.Selection(a,a),r.revealRange(new m.Range(a,a),m.TextEditorRevealType.InCenter)}return!0}catch(i){return m.window.showErrorMessage(`Failed to open file: ${i.message||String(i)}`),!1}}};var V=w(require("node:path")),H=w(require("node:fs/promises")),d=w(require("vscode"));var j=class{ruleCache=new Map;fileNavigator;projectDetector;sonarClientFactory;getDefaultAgentFn;fetchRuleFn;readCodeSnippetFn;isExtensionInstalledFn;isAntigravityEnvFn;executeCommandFn;sendToAgentPanelFn;constructor(e){this.fileNavigator=e?.fileNavigator??new I,this.projectDetector=e?.projectDetector,this.sonarClientFactory=e?.sonarClientFactory??(t=>new P({serverUrl:t.serverUrl,token:t.token})),this.getDefaultAgentFn=e?.getDefaultAgentFn??(()=>d.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot")),this.fetchRuleFn=e?.fetchRuleFn,this.readCodeSnippetFn=e?.readCodeSnippetFn,this.executeCommandFn=e?.executeCommandFn??((t,...n)=>d.commands.executeCommand(t,...n)),this.sendToAgentPanelFn=e?.sendToAgentPanelFn??(t=>{let n=d.antigravityExtensibility;return n&&typeof n.sendToAgentPanel=="function"?n.sendToAgentPanel(t):Promise.reject(new Error("antigravityExtensibility.sendToAgentPanel not available"))}),this.isExtensionInstalledFn=e?.isExtensionInstalledFn??(t=>{try{return!!d.extensions.getExtension(t)}catch{return!1}}),this.isAntigravityEnvFn=e?.isAntigravityEnvFn??(()=>{try{return!!((d.env.appName||"").toLowerCase().includes("antigravity")||process.env.GEMINI_CLI||process.env.ANTIGRAVITY_IDE||process.env.ANTIGRAVITY_AGENT)}catch{return!1}})}getAvailableAgents(){let e=[];return(this.isExtensionInstalledFn("github.copilot")||this.isExtensionInstalledFn("github.copilot-chat"))&&e.push({id:"copilot",name:"GitHub Copilot",description:"VS Code Copilot Chat",focusCommand:"workbench.action.chat.open"}),(this.isAntigravityEnvFn()||this.isExtensionInstalledFn("google.antigravity")||this.isExtensionInstalledFn("google.gemini"))&&e.push({id:"antigravity",name:"Antigravity Agent",description:"DeepMind Antigravity Agent",focusCommand:"antigravity.openChatView"}),this.isExtensionInstalledFn("anthropic.claude-code")&&e.push({id:"claude-code",name:"Claude Code",description:"Anthropic Claude Code for VS Code",focusCommand:"workbench.view.extension.claude-sidebar"}),this.isExtensionInstalledFn("saoudrizwan.claude-dev")&&e.push({id:"cline",name:"Cline",description:"Autonomous AI coding agent",focusCommand:"claude-dev.focus"}),this.isExtensionInstalledFn("rooveterinaryinc.roo-cline")&&e.push({id:"roo-code",name:"Roo Code",description:"Roo Code coding agent",focusCommand:"roo-cline.focus"}),this.isExtensionInstalledFn("continue.continue")&&e.push({id:"continue",name:"Continue",description:"Continue open-source AI assistant",focusCommand:"continue.focusContinueInputView"}),(this.isExtensionInstalledFn("openai.chatgpt")||this.isExtensionInstalledFn("openai.openai-chatgpt")||this.isExtensionInstalledFn("codex.codex"))&&e.push({id:"codex",name:"Codex Agent",description:"OpenAI Codex AI Assistant",focusCommand:"chatgpt.focus"}),e.push({id:"clipboard",name:"Clipboard Only",description:"Copy prompt to clipboard"}),e}async getRule(e){if(this.ruleCache.has(e))return this.ruleCache.get(e);let t;if(this.fetchRuleFn)t=await this.fetchRuleFn(e);else if(this.projectDetector)try{let n=await this.projectDetector.getConfig(),i=await this.projectDetector.getToken();n.serverUrl&&i&&(t=await this.sonarClientFactory({serverUrl:n.serverUrl,token:i}).getEnrichedRule(e))}catch{}return t||(t={key:e,name:e,cleanDesc:"Adhere to SonarQube quality standard for this rule."}),this.ruleCache.set(e,t),t}detectLanguage(e){switch(V.extname(e).toLowerCase()){case".ts":case".tsx":return"typescript";case".js":case".jsx":return"javascript";case".vue":return"vue";case".html":return"html";case".css":return"css";case".py":return"python";case".java":return"java";case".go":return"go";case".rs":return"rust";default:return""}}async readCodeSnippet(e,t){if(this.readCodeSnippetFn)return this.readCodeSnippetFn(e,t);let n=await this.fileNavigator.resolveFilePath(e);if(!n)return null;try{let o=(await H.readFile(n,"utf-8")).split(/\r?\n/),r=o.length,s=t!==void 0&&t>0?t:1,a=Math.max(1,s-10),c=Math.min(r,s+10),u=[];for(let g=a;g<=c;g++){let v=o[g-1],C=g===s?" ---> [ISSUE HERE] ":"      ";u.push(`${g.toString().padStart(4," ")} |${C}${v}`)}return{snippet:u.join(`
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
`,o}let n=await this.getRule(e.ruleKey),i=`@workspace Please fix the following SonarQube issue:

`;return i+=`### \u{1F4CD} Location
`,i+=`- File: \`${e.filePath}\`
`,i+=`- Line: ${e.line||"File level"}

`,i+=`### \u26A0\uFE0F Issue Details
`,i+=`- Message: "${e.message}"
`,i+=`- Type: ${e.type} | Severity: ${e.severity}
`,i+=`- Sonar Rule: \`${n.key}\` - ${n.name}

`,i+=`### \u{1F4D6} SonarQube Rule Details
`,i+=`${n.cleanDesc}
`,n.recommendation&&(i+=`> Sonar Recommendation: ${n.recommendation}
`),i+=`
`,t&&(i+=`### \u{1F4BB} Local Code Snippet (\`${e.filePath}\` L${t.startLine}-L${t.endLine})
`,i+=`\`\`\`${t.language}
${t.snippet}
\`\`\`

`),i+=`### \u{1F3AF} Instructions for Agent
`,i+=`1. Fix the issue according to the SonarQube rule without breaking existing functionality.
`,i+=`2. Maintain consistent code style with the existing codebase.
`,i+=`3. Provide the complete fixed code and concisely explain the changes.
`,i}async assembleBatchPrompt(e){if(e.length===1)return this.assemblePrompt(e[0]);let t=`@workspace Please fix the following ${e.length} SonarQube issues:

`,n=new Map;for(let i of e){let o=n.get(i.filePath)||[];o.push(i),n.set(i.filePath,o)}for(let[i,o]of n){t+=`## \u{1F4C1} File: \`${i}\` (${o.length} issues)

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
`,t}async dispatch(e,t,n,i){try{await d.env.clipboard.writeText(e)}catch{}if(n?.line&&await this.fileNavigator.openFileAtLine(n.filePath,n.line),t==="copilot")try{return await this.executeCommandFn("workbench.action.chat.open",{query:e}),d.window.showInformationMessage("Dispatched Fix Prompt to GitHub Copilot Chat!"),{ok:!0,message:"Dispatched to GitHub Copilot Chat."}}catch{return d.window.showInformationMessage("Prompt copied to clipboard! Paste it into GitHub Copilot Chat."),{ok:!0,message:"Copied to clipboard (Copilot chat command not found)."}}if(t==="antigravity"){try{let a=[],c=i&&i.length>0?i:n?[n]:[],u=new Set;for(let g of c)if(g.filePath){let v=await this.fileNavigator.resolveFilePath(g.filePath);if(v&&!u.has(v)){u.add(v);let C=g.line&&g.line>0?g.line-1:0;a.push({uri:d.Uri.file(v),startLine:C,endLine:C})}}return await this.sendToAgentPanelFn({message:e,files:a.length>0?a:void 0,autoSend:!1}),d.window.showInformationMessage("Dispatched Fix Prompt to Antigravity Chat!"),{ok:!0,message:"Dispatched to Antigravity Chat."}}catch{}for(let a of["workbench.action.chat.open","antigravity.prioritized.chat.open","workbench.action.openChat"])try{return await this.executeCommandFn(a,{query:e}),d.window.showInformationMessage("Dispatched Fix Prompt to Antigravity Chat!"),{ok:!0,message:"Dispatched to Antigravity Chat."}}catch{}try{return await this.executeCommandFn("antigravity.openChatView"),d.window.showInformationMessage("Antigravity Chat opened & prompt copied to clipboard! Press Cmd+V / Ctrl+V to paste."),{ok:!0,message:"Chat opened and prompt ready in clipboard."}}catch{return d.window.showInformationMessage("Fix Prompt copied to clipboard for Antigravity Agent! Paste it into your agent chat."),{ok:!0,message:"Prompt ready in clipboard for Antigravity Agent."}}}let o=this.getAvailableAgents().find(a=>a.id===t),r={"claude-code":"Claude Code",cline:"Cline","roo-code":"Roo Code",continue:"Continue",codex:"Codex Agent"},s=o?.name??r[t]??"Clipboard";if(t==="claude-code"){let a=["workbench.view.extension.claude-sidebar","claude-code.focus","claude.focus"];for(let c of a)try{await this.executeCommandFn(c);break}catch{}}else if(t==="codex"){let a=["chatgpt.focus","openai.chatgpt.focus","codex.focus"];for(let c of a)try{await this.executeCommandFn(c);break}catch{}}else if(o?.focusCommand)try{await this.executeCommandFn(o.focusCommand)}catch{}return t==="clipboard"?(d.window.showInformationMessage("Fix Prompt copied to clipboard!"),{ok:!0,message:"Prompt ready in clipboard."}):(d.window.showInformationMessage(`Fix Prompt copied to clipboard for ${s}! Paste it into your agent chat.`),{ok:!0,message:`Prompt ready in clipboard for ${s}.`})}async resolveTargetAgent(e){let t=await this.getAvailableAgents();if(e&&t.some(i=>i.id===e))return e;if(e==="clipboard")return"clipboard";let n=this.getDefaultAgentFn();return n&&t.some(i=>i.id===n)?n:t[0]?.id||"clipboard"}async dispatchIssue(e,t){let n=await this.resolveTargetAgent(t?.targetAgentId),i=await this.assemblePrompt(e);return this.dispatch(i,n,e)}async dispatchBatch(e,t){if(!e||e.length===0)return{ok:!1,message:"No items to dispatch."};let n=await this.resolveTargetAgent(t?.targetAgentId),i=await this.assembleBatchPrompt(e);return this.dispatch(i,n,e[0],e)}async dispatchDiagnostic(e,t,n){let i="MAJOR";e.severity===d.DiagnosticSeverity.Error?i="CRITICAL":e.severity===d.DiagnosticSeverity.Information?i="MINOR":e.severity===d.DiagnosticSeverity.Hint&&(i="INFO");let o=d.workspace.asRelativePath?d.workspace.asRelativePath(t.uri):t.fileName,r="";typeof e.code=="object"&&e.code!==null?r=String(e.code.value):e.code!==void 0&&e.code!==null&&(r=String(e.code));let s={id:r||"sonar-issue",ruleKey:r,message:e.message,component:o,filePath:o,line:e.range.start.line+1,severity:i,type:"CODE_SMELL",status:"OPEN",tags:[],creationDate:new Date().toISOString()};return this.dispatchIssue(s,n)}};var b=w(require("vscode"));var Q=w(require("vscode")),p=class{static channel;static initialize(e){return e?this.channel=e:this.channel??=Q.window.createOutputChannel("Sonar Agent",{log:!0}),this.channel}static sanitize(e){if(!e)return"";let t=e.replace(/https?:\/\/[^\s"'`<>]+/gi,"[SERVER]");return t=t.replace(/(token|bearer|authorization|password)\s*[:=]\s*[^\s,;&]+/gi,"$1: [REDACTED]"),t}static info(e){this.channel||this.initialize(),this.channel?.info(this.sanitize(e))}static warn(e){this.channel||this.initialize(),this.channel?.warn(this.sanitize(e))}static error(e,t){this.channel||this.initialize();let n="";if(t)if(t instanceof Error)n=` - ${t.message}`;else if(typeof t=="object")try{n=` - ${JSON.stringify(t)}`}catch{n=" - [Object]"}else n=` - ${String(t)}`;this.channel?.error(this.sanitize(`${e}${n}`))}static debug(e){this.channel||this.initialize(),this.channel?.debug(this.sanitize(e))}static show(){this.channel?.show(!0)}static dispose(){this.channel?.dispose(),this.channel=void 0}};var R=class{constructor(e){this.options=e;this.projectDetector=e.projectDetector,this.onConfigChanged=e.onConfigChanged}projectDetector;onConfigChanged;get sonarClientFactory(){return this.options.sonarClientFactory??(e=>new P(e))}get showQuickPickFn(){return this.options.showQuickPickFn??b.window.showQuickPick}get showInputBoxFn(){return this.options.showInputBoxFn??b.window.showInputBox}get showInformationMessageFn(){return this.options.showInformationMessageFn??b.window.showInformationMessage}get showWarningMessageFn(){return this.options.showWarningMessageFn??b.window.showWarningMessage}get showErrorMessageFn(){return this.options.showErrorMessageFn??b.window.showErrorMessage}get withProgressFn(){return this.options.withProgressFn??b.window.withProgress}get executeCommandFn(){return this.options.executeCommandFn??b.commands.executeCommand}profilesCapable(){return typeof this.projectDetector.listProfiles=="function"}async notifyConfigChanged(){this.onConfigChanged&&await this.onConfigChanged()}async promptProjectSelection(){return this.options.promptProjectSelectionFn?this.options.promptProjectSelectionFn():this.promptProjectSelectionInternal()}async promptProjectSelectionInternal(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!e.serverUrl||!t){this.showWarningMessageFn("Please connect to SonarQube first.");return}let i=await this.sonarClientFactory({serverUrl:e.serverUrl,token:t}).fetchProjects(),o={label:"$(edit) Enter Project Key manually...",description:"Type the exact project key from SonarQube",detail:"Use this if your project is not listed or search is restricted"},r=[o,...i.map(a=>({label:a.name,description:a.key,detail:a.key===e.projectKey?"(Currently selected)":void 0}))],s=await this.showQuickPickFn(r,{placeHolder:"Select a SonarQube project or enter key manually",matchOnDescription:!0});if(s===o){let a=await this.showInputBoxFn({prompt:"Enter the SonarQube Project Key",placeHolder:"e.g. org.company:my-project",value:e.projectKey||"",validateInput:c=>c.trim()?null:"Project Key cannot be empty"});if(a?.trim()){let c=a.trim();await this.projectDetector.setProjectKey(c),await this.notifyConfigChanged(),this.showInformationMessageFn(`Active SonarQube project set to: ${c}`)}return}if(s?.description){let a=s.description;await this.projectDetector.setProjectKey(a),await this.notifyConfigChanged(),this.showInformationMessageFn(`Active SonarQube project set to: ${s.label}`)}}async promptConfigureConnection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken(),n=!!(e.serverUrl&&t),i=[{label:"$(link) Update Server URL & Token",description:n?"Connected":"Not connected",detail:e.serverUrl?`Server: ${e.serverUrl}`:"Configure SonarQube host URL and authentication token",action:"updateCredentials"},{label:"$(folder-active) Select Sonar Project",description:e.projectKey?"Active":"Not selected",detail:e.projectKey?`Current project: ${e.projectKey}`:"Choose an active project on the server",action:"selectProject"},{label:"$(settings-gear) Open Extension Settings",detail:"Configure default AI agent and advanced preferences",action:"openSettings"},{label:"$(output) Show Extension Logs",detail:"Open the Sonar Agent output log channel",action:"showLogs"}];n&&i.push({label:"$(debug-disconnect) Disconnect & Reset Credentials",detail:"Remove stored token from OS Keychain and disconnect",action:"disconnect"}),this.profilesCapable()&&(i.splice(2,0,{label:"$(arrow-swap) Switch Connection Profile",detail:"Activate a different server + project + token binding",action:"switchProfile"}),i.splice(3,0,{label:"$(add) New Connection Profile...",detail:"Create a named server + project binding with live verification",action:"newProfile"}),i.splice(4,0,{label:"$(edit) Rename Connection Profile...",detail:"Rename a stored connection profile",action:"renameProfile"}),i.splice(5,0,{label:"$(trash) Delete Connection Profile...",detail:"Remove a profile and delete its token from the OS Keychain",action:"deleteProfile"}),i.splice(6,0,{label:"$(check) Verify Active Connection",detail:"Live-check the active profile against the SonarQube server",action:"verifyConnection"}));let o=await this.showQuickPickFn(i,{placeHolder:"Sonar Agent: Configure Connection & Settings",matchOnDescription:!0,matchOnDetail:!0});if(!o)return;let r=o.action;switch(r){case"updateCredentials":await this.promptUpdateCredentials(e.serverUrl);break;case"selectProject":await this.promptProjectSelection();break;case"switchProfile":case"newProfile":case"renameProfile":case"deleteProfile":case"verifyConnection":await this.runProfileAction(r);break;case"openSettings":await this.executeCommandFn("workbench.action.openSettings","@ext:chulit.sonar-agent");break;case"showLogs":p.show();break;case"disconnect":await this.executeCommandFn("sonarAgent.resetConnection");break}}async promptUpdateCredentials(e,t){let n=e||(await this.projectDetector.getConfig()).serverUrl||"http://localhost:9000",i=t||"";for(;;){let o=await this.showInputBoxFn({title:"SonarQube Connection (1/2)",prompt:"Enter the SonarQube Server URL",placeHolder:"http://localhost:9000 or https://sonar.example.com",value:n,ignoreFocusOut:!0,validateInput:c=>this.validateServerUrlInput(c)});if(o===void 0)return;n=o.trim();let r=await this.showInputBoxFn({title:"SonarQube Connection (2/2)",prompt:"Enter your SonarQube User Token",placeHolder:"sqp_...",value:i,password:!0,ignoreFocusOut:!0,validateInput:c=>c.trim()?null:"User Token is required"});if(r===void 0)return;i=r.trim();let s={ok:!1};if(await this.withProgressFn({location:b.ProgressLocation.Notification,title:"Verifying SonarQube connection...",cancellable:!1},async()=>{s=await this.sonarClientFactory({serverUrl:n,token:i}).verifyConnection()}),!s.ok){if(await this.showErrorMessageFn(`SonarQube connection verification failed: ${s.message||"Unknown error"}`,"Retry","Cancel")==="Retry")continue;return}await this.projectDetector.setServerUrl(n),await this.projectDetector.setToken(i),this.showInformationMessageFn("SonarQube connection successfully verified and saved!"),(await this.projectDetector.getConfig()).projectKey||await this.promptProjectSelection(),await this.notifyConfigChanged();return}}validateServerUrlInput(e){let t=e.trim();if(!t)return"Server URL is required";if(!t.startsWith("http://")&&!t.startsWith("https://"))return"Server URL must start with http:// or https://";try{if(!new URL(t).hostname)return"Please enter a valid URL with hostname"}catch{return"Please enter a valid URL"}return null}async promptManageProfiles(){let e=[{label:"$(arrow-swap) Switch Profile",action:"switchProfile"},{label:"$(add) New Profile...",action:"newProfile"},{label:"$(edit) Rename Profile...",action:"renameProfile"},{label:"$(trash) Delete Profile...",action:"deleteProfile"},{label:"$(check) Verify Active Connection",action:"verifyConnection"}],t=await this.showQuickPickFn(e,{placeHolder:"Sonar Agent: Manage Connection Profiles"});t&&await this.runProfileAction(t.action)}async runProfileAction(e){switch(e){case"switchProfile":{let t=await this.pickProfile("Select the connection profile to activate");if(!t)return;try{await this.projectDetector.activateProfile(t.id)}catch(n){let i=n?.message||`Unknown connection profile: ${t.id}`;this.showErrorMessageFn(i);return}this.showInformationMessageFn(`Active connection profile: ${t.name}`),await this.notifyConfigChanged();break}case"newProfile":await this.promptCreateProfile();break;case"renameProfile":{let t=await this.pickProfile("Select the connection profile to rename");if(!t)return;let n=await this.showInputBoxFn({prompt:`New name for profile "${t.name}"`,value:t.name,ignoreFocusOut:!0,validateInput:i=>i.trim()?null:"Profile name is required"});if(!n?.trim())return;await this.projectDetector.renameProfile(t.id,n.trim()),await this.notifyConfigChanged();break}case"deleteProfile":{let t=await this.pickProfile("Select the connection profile to delete");if(!t||await this.showWarningMessageFn(`Delete connection profile "${t.name}" and its stored token?`,{modal:!0},"Delete")!=="Delete")return;await this.projectDetector.deleteProfile(t.id),this.showInformationMessageFn(`Connection profile "${t.name}" deleted. Create a profile to reconnect.`),await this.notifyConfigChanged();break}case"verifyConnection":{let t=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken();if(!t.serverUrl||!n){this.showWarningMessageFn("No active connection profile to verify.");return}let i={ok:!1};await this.withProgressFn({location:b.ProgressLocation.Notification,title:"Verifying SonarQube connection...",cancellable:!1},async()=>{i=await this.sonarClientFactory({serverUrl:t.serverUrl,token:n}).verifyConnection()}),i.ok?this.showInformationMessageFn("SonarQube connection verified."):this.showErrorMessageFn(`SonarQube connection verification failed: ${i.message||"Unknown error"}`);break}}}async pickProfile(e){let t=await this.projectDetector.listProfiles();if(t.length===0){this.showInformationMessageFn("No connection profiles yet. Create one first.");return}let n=await this.showQuickPickFn(t.map(i=>({label:i.name,description:i.id,detail:`${i.serverUrl} \xB7 ${i.projectKey}`})),{placeHolder:e,matchOnDescription:!0,matchOnDetail:!0});return n?t.find(i=>i.id===n.description):void 0}async promptCreateProfile(){let e=await this.projectDetector.getCreationSuggestion(),t="",n=e?.serverUrl??"http://localhost:9000",i="",o=e?.projectKey??"";for(;;){let r=await this.showInputBoxFn({title:"New Connection Profile (1/4)",prompt:"Name this profile (e.g. kantor-prod)",value:t,ignoreFocusOut:!0,validateInput:v=>v.trim()?null:"Profile name is required"});if(r===void 0)return;t=r.trim();let s=await this.showInputBoxFn({title:"New Connection Profile (2/4)",prompt:"Enter the SonarQube Server URL",placeHolder:"http://localhost:9000 or https://sonar.example.com",value:n,ignoreFocusOut:!0,validateInput:v=>this.validateServerUrlInput(v)});if(s===void 0)return;n=s.trim();let a=await this.showInputBoxFn({title:"New Connection Profile (3/4)",prompt:"Enter your SonarQube User Token",placeHolder:"sqp_...",value:i,password:!0,ignoreFocusOut:!0,validateInput:v=>v.trim()?null:"User Token is required"});if(a===void 0)return;i=a.trim();let c=await this.showInputBoxFn({title:"New Connection Profile (4/4)",prompt:"Enter the SonarQube Project Key (optional, pick later)",value:o,ignoreFocusOut:!0});if(c===void 0)return;o=c.trim();let u={ok:!1};if(await this.withProgressFn({location:b.ProgressLocation.Notification,title:"Verifying SonarQube connection...",cancellable:!1},async()=>{u=await this.sonarClientFactory({serverUrl:n,token:i}).verifyConnection()}),!u.ok){if(await this.showErrorMessageFn(`SonarQube connection verification failed: ${u.message||"Unknown error"}`,"Retry","Cancel")==="Retry")continue;return}let g=await this.projectDetector.createProfile({name:t,serverUrl:n,projectKey:o,token:i});e?.hasPlaintextCredentials&&this.showWarningMessageFn("sonar-project.properties contains plaintext credentials. They were not imported; remove them to avoid leaking secrets."),this.showInformationMessageFn(`Connection profile "${g.name}" created and activated.`),g.projectKey||await this.promptProjectSelection(),await this.notifyConfigChanged();return}}};var D=class{constructor(e,t,n,i,o,r){this.extensionUri=e;this.projectDetector=t;this.fileNavigator=n??new I,this.agentDispatcher=i??new j({fileNavigator:this.fileNavigator,projectDetector:this.projectDetector}),this.diagnosticCollection=o??f.languages.createDiagnosticCollection("SonarQube"),this.connectionWizard=r??new R({projectDetector:this.projectDetector,onConfigChanged:()=>this.refresh(),promptProjectSelectionFn:()=>this.promptProjectSelection()})}static viewType="sonarAgent.overviewView";_view;_webviewReady=!1;_lastStateMessage;fileNavigator;agentDispatcher;diagnosticCollection;connectionWizard;resolveWebviewView(e,t,n){this._view=e,this._webviewReady=!1;let i=this.projectDetector.isConfiguredSync?.()??!1;p.info(`[Host] resolveWebviewView called. visible=${e.visible}, isConfigured=${i}`),e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtmlForWebview(e.webview,i),e.webview.onDidReceiveMessage(async o=>{try{let r=o.text?` text="${o.text}"`:"";switch(p.info(`[Host] onDidReceiveMessage: command=${o.command}${r}`),o.command){case"log":{p.info(`[Webview] ${o.text}`);break}case"ready":case"init":{this._webviewReady=!0,this._lastStateMessage&&this._view&&await this._view.webview.postMessage(this._lastStateMessage),await this._syncState();break}case"connect":{await this._handleConnect(o.serverUrl,o.token);break}case"disconnect":{await this._handleDisconnect();break}case"selectProject":{o.projectKey&&(await this.projectDetector.setProjectKey(o.projectKey),await this._syncState());break}case"switchProfile":{await this._handleSwitchProfile(o.profileId);break}case"createProfile":{await this.promptCreateProfile();break}case"openProjectPicker":{await this.promptProjectSelection();break}case"fetchDetails":{await this._handleFetchDetails(o.category);break}case"openFile":{await this.fileNavigator.openFileAtLine(o.filePath,o.line);break}case"sendToAgent":{await this._handleSendToAgent(o.item,o.targetAgentId);break}case"sendBatchToAgent":{await this._handleSendBatchToAgent(o.items,o.targetAgentId);break}case"setTargetAgent":{await f.workspace.getConfiguration("sonarAgent").update("defaultAgent",o.agentId,!0);break}case"refresh":{await this._syncState();break}}}catch(r){console.error("[SonarAgent] Webview message handling error:",r),this._view?.webview.postMessage({type:"error",message:r?.message||"Error processing request."})}}),this._syncState(),e.onDidChangeVisibility(()=>{e.visible&&this._syncState()})}async refresh(){this._view&&await this._syncState()}async promptProjectSelection(){return this.connectionWizard.promptProjectSelectionInternal()}async promptConfigureConnection(){return this.connectionWizard.promptConfigureConnection()}async promptUpdateCredentials(e,t){return this.connectionWizard.promptUpdateCredentials(e,t)}async promptManageProfiles(){return this.connectionWizard.promptManageProfiles()}async promptCreateProfile(){return this.connectionWizard.promptCreateProfile()}async _handleSendToAgent(e,t){await this.agentDispatcher.dispatchIssue(e,{targetAgentId:t})}async _handleSendBatchToAgent(e,t){await this.agentDispatcher.dispatchBatch(e,{targetAgentId:t})}async _handleFetchDetails(e){if(!this._view)return;let t=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken();if(!(!t.serverUrl||!t.projectKey||!n)){this._view.webview.postMessage({type:"loadingDetails",loading:!0});try{let i=new P({serverUrl:t.serverUrl,token:n}),o=[];e==="hotspots"?o=await i.getHotspots(t.projectKey):e==="coverage"?o=await i.getCoverageFiles(t.projectKey):e==="duplications"?o=await i.getDuplicationFiles(t.projectKey):e==="reliability"||e==="security"||e==="maintainability"||e==="accepted"?o=await i.getIssues(t.projectKey,e):o=await i.getIssues(t.projectKey),this._view.webview.postMessage({type:"details",category:e,items:o}),await this.syncDiagnostics(o)}catch(i){this._view.webview.postMessage({type:"detailsError",message:i.message||"Failed to load issues."})}finally{this._view.webview.postMessage({type:"loadingDetails",loading:!1})}}}async syncDiagnostics(e){this.diagnosticCollection.clear();let t=new Map;for(let n of e){if(!n.filePath)continue;let i=await this.fileNavigator.resolveFilePath(n.filePath);if(!i)continue;let o=f.Uri.file(i),r=n.line&&n.line>0?n.line-1:0,s=new f.Range(r,0,r,100),a=f.DiagnosticSeverity.Information;n.severity==="BLOCKER"||n.severity==="CRITICAL"?a=f.DiagnosticSeverity.Error:n.severity==="MAJOR"&&(a=f.DiagnosticSeverity.Warning);let c=new f.Diagnostic(s,n.message,a);c.code=n.ruleKey,c.source="SonarQube";let u=t.get(o.toString())||{uri:o,diagnostics:[]};u.diagnostics.push(c),t.set(o.toString(),u)}for(let{uri:n,diagnostics:i}of t.values())this.diagnosticCollection.set(n,i)}async _handleSwitchProfile(e){try{await this.projectDetector.activateProfile(e)}catch(t){this._view?.webview.postMessage({type:"error",message:t?.message||`Unknown connection profile: ${e}`});return}await this._syncState()}async _syncState(){if(this._view)try{let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken(),n=f.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),i=this.agentDispatcher.getAvailableAgents(),o=n;i.some(a=>a.id===o)||(o=i[0]?.id||"clipboard");let r=await this.projectDetector.listProfiles?.()??[],s=await this.projectDetector.getActiveProfile?.()??null;if(p.info(`[Host] _syncState: serverUrl=${e.serverUrl}, hasToken=${e.hasToken}, tokenPresent=${!!t}`),r.length===0&&!e.serverUrl&&!t){let a={type:"state",state:"no-profiles",serverUrl:"http://localhost:9000",profiles:r,activeProfileId:s?.id,defaultAgent:o,availableAgents:i};this._lastStateMessage=a,await this._view.webview.postMessage(a);return}if(e.serverUrl&&e.hasToken&&t){let a={type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:e.projectKey,projects:[],profiles:r,activeProfileId:s?.id,defaultAgent:o,availableAgents:i};this._lastStateMessage=a;let c=await this._view.webview.postMessage(a);p.info(`[Host] Immediate postMessage(connected) delivered=${c}`),await this._view.webview.postMessage({type:"loading",loading:!0});let u=new P({serverUrl:e.serverUrl,token:t}),g=e.projectKey,[v,C]=await Promise.allSettled([u.fetchProjects(),g?u.getOverview(g):Promise.resolve(null)]),k=v.status==="fulfilled"?v.value:[];v.status==="rejected"&&console.error("[SonarAgent] fetchProjects error:",v.reason);let x=g;!x&&k.length>0&&(x=k[0].key,await this.projectDetector.setProjectKey(x));let y=null,F;if(x&&x===g)C.status==="fulfilled"?(y=C.value,y&&p.info(`Measures updated for [${x}]: ${y.security.count} vulnerabilities, ${y.reliability.count} bugs, ${y.maintainability.count} smells, ${y.coverage.percentage.toFixed(1)}% coverage.`)):(F=C.reason?.message||"Failed to fetch project measures.",p.error(`Failed to fetch project measures for [${x}]`,F));else if(x)try{y=await u.getOverview(x),y&&p.info(`Measures updated for [${x}]: ${y.security.count} vulnerabilities, ${y.reliability.count} bugs, ${y.maintainability.count} smells, ${y.coverage.percentage.toFixed(1)}% coverage.`)}catch(q){F=q.message||"Failed to fetch project measures.",p.error(`Failed to fetch project measures for [${x}]`,F)}let $={type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:x,projects:k,overview:y,overviewError:F,profiles:r,activeProfileId:s?.id,defaultAgent:o,availableAgents:i};this._lastStateMessage=$;let G=await this._view.webview.postMessage($);p.info(`[Host] Full postMessage(connected) delivered=${G}`),await this._view.webview.postMessage({type:"loading",loading:!1}),!this._webviewReady&&this._view&&setTimeout(async()=>{!this._webviewReady&&this._view&&this._lastStateMessage&&await this._view.webview.postMessage(this._lastStateMessage)},350)}else{let a={type:"state",state:"onboarding",serverUrl:e.serverUrl||"http://localhost:9000",profiles:r,activeProfileId:s?.id,defaultAgent:o,availableAgents:i};this._lastStateMessage=a;let c=await this._view.webview.postMessage(a);p.info(`[Host] postMessage(onboarding) delivered=${c}`)}}catch(e){console.error("[SonarAgent] _syncState error:",e),p.error("Failed to synchronize Sonar Agent state",e),this._view?.webview.postMessage({type:"error",message:e.message||"Failed to synchronize Sonar Agent state."}),this._view?.webview.postMessage({type:"loading",loading:!1})}}async _handleConnect(e,t){let n=(t||"").trim(),i=(e||"").trim();if(!i||!n){this._view?.webview.postMessage({type:"error",message:"Server URL and User Token are required."});return}for(!i.startsWith("http://")&&!i.startsWith("https://")&&(i="https://"+i);i.endsWith("/");)i=i.slice(0,-1);this._view?.webview.postMessage({type:"connecting"}),p.info("Verifying SonarQube credentials...");try{let r=await new P({serverUrl:i,token:n}).verifyConnection();if(!r.ok){p.warn(`Connection verification failed: ${r.message||"Unknown error"}`),this._view?.webview.postMessage({type:"error",message:r.message||"Connection verification failed."});return}await this.projectDetector.setServerUrl(i),await this.projectDetector.setToken(n),p.info("SonarQube connection verified and saved."),f.window.showInformationMessage("SonarQube connection successfully verified!"),await this._syncState()}catch(o){console.error("[SonarAgent] _handleConnect error:",o),p.error("Unexpected connection error occurred",o),this._view?.webview.postMessage({type:"error",message:o?.message||"Unexpected connection error occurred."})}}async _handleDisconnect(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!!!(e.serverUrl&&t)){this._view?.webview.postMessage({type:"disconnected",message:"Connection credentials cleared."}),f.window.showInformationMessage("Sonar Agent connection inputs cleared.");return}await f.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await this.projectDetector.deleteToken(),p.info("SonarQube credentials removed and disconnected."),this._view?.webview.postMessage({type:"disconnected",message:"Disconnected from SonarQube. Credentials removed."}),f.window.showInformationMessage("SonarQube credentials have been removed."),await this._syncState())}_getHtmlForWebview(e,t=!1){let n=oe();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${e.cspSource} 'unsafe-inline'; font-src ${e.cspSource}; img-src ${e.cspSource} https: data:; script-src 'nonce-${n}' ${e.cspSource}; connect-src ${e.cspSource} https:;">
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
        <select id="profile-switcher" class="hidden" title="Connection profile" style="max-width: 140px; font-size: 11px; padding: 2px 4px;"></select>
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

    <!-- No Profiles Empty State -->
    <div id="no-profiles-view" class="card hidden">
      <p style="font-size: 12px; line-height: 1.4; color: var(--vscode-descriptionForeground);">
        No connection profiles yet. Create one to connect to SonarQube and monitor Overall Code quality.
      </p>
      <button id="create-profile-btn" class="btn">New Connection Profile</button>
    </div>

    <!-- Connected Dashboard View -->
    <div id="connected-view" class="${t?"":"hidden"}" style="display: flex; flex-direction: column; gap: 10px;">
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
        <div class="metric-card" data-category="security" role="button" tabindex="0" aria-label="Security: open issues and rating">
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
        <div class="metric-card" data-category="reliability" role="button" tabindex="0" aria-label="Reliability: open issues and rating">
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
        <div class="metric-card" data-category="maintainability" role="button" tabindex="0" aria-label="Maintainability: open issues and rating">
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
        <div class="metric-card" data-category="hotspots" role="button" tabindex="0" aria-label="Security Hotspots: review count and rating">
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
        <div class="metric-card" data-category="coverage" role="button" tabindex="0" aria-label="Coverage: code coverage percentage and lines to cover">
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
        <div class="metric-card" data-category="duplications" role="button" tabindex="0" aria-label="Duplications: duplicated lines percentage">
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

  <script nonce="${n}">
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
      footerMeta.textContent = (item.line ? "L" + item.line : "File level") + (item.effort ? " \u2022 " + item.effort : "");

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
        agentBtnLabel = "Generate Tests";
      } else if (item.type === "DUPLICATION") {
        agentBtnLabel = "Refactor";
      } else if (item.type === "HOTSPOT") {
        agentBtnLabel = "Review";
      }
      agentBtn.setAttribute("aria-label", agentBtnLabel + " for " + item.message);
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
        opt.textContent = p.name + " \xB7 " + p.serverUrl + " \xB7 " + p.projectKey;
        opt.title = p.name + " \xB7 " + p.serverUrl + " \xB7 " + p.projectKey;
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
        case "details": {
          renderIssues(message.items || [], message.category);
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
            connectedView.classList.add("hidden");
            onboardingView.classList.add("hidden");
            noProfilesView.classList.remove("hidden");
            renderProfileSwitcher(message.profiles, message.activeProfileId);
          } else {
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
</html>`}};function oe(){return W.randomBytes(16).toString("hex")}var E=w(require("vscode"));var L=class{static providedCodeActionKinds=[E.CodeActionKind.QuickFix];dispatcher;constructor(e){this.dispatcher=e.dispatcher??new j({projectDetector:e.projectDetector,fileNavigator:e.fileNavigator})}provideCodeActions(e,t,n,i){let o=[];for(let r of n.diagnostics)if(r.source?.toLowerCase().includes("sonar")){let s=typeof r.code=="object"&&r.code!==null?r.code.value:r.code,a=s?`\u26A1 Send to AI Agent (${s})`:"\u26A1 Send to AI Agent (SonarQube)",c=new E.CodeAction(a,E.CodeActionKind.QuickFix);c.command={command:"sonarAgent.fixWithAgent",title:"Send to Agent",arguments:[r,e]},c.diagnostics=[r],c.isPreferred=!0,o.push(c)}return o}async executeFixWithAgent(e,t){return this.dispatcher.dispatchDiagnostic(e,t)}};function re(l){let e=p.initialize();l.subscriptions.push(e),p.info("Sonar Agent extension activated.");let t=h.workspace.workspaceFolders?.[0]?.uri.fsPath,n=new B({secretStorage:l.secrets,workspaceConfig:{get:(r,s)=>h.workspace.getConfiguration("sonarAgent").get(r,s),update:(r,s,a)=>h.workspace.getConfiguration("sonarAgent").update(r,s,a)},workspaceRoot:t}),i=new D(l.extensionUri,n),o=new L({projectDetector:n});l.subscriptions.push(h.window.registerWebviewViewProvider(D.viewType,i),h.commands.registerCommand("sonarAgent.refresh",async()=>{await i.refresh()}),h.commands.registerCommand("sonarAgent.configure",async()=>{await i.promptConfigureConnection()}),h.commands.registerCommand("sonarAgent.selectProject",async()=>{await i.promptProjectSelection()}),h.commands.registerCommand("sonarAgent.profile.manage",async()=>{await i.promptManageProfiles()}),h.commands.registerCommand("sonarAgent.resetConnection",async()=>{await h.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await n.deleteToken(),await i.refresh(),h.window.showInformationMessage("SonarQube credentials have been removed."))}),h.commands.registerCommand("sonarAgent.showLogs",()=>{p.show()}),h.languages.registerCodeActionsProvider({scheme:"file"},o,{providedCodeActionKinds:L.providedCodeActionKinds}),h.commands.registerCommand("sonarAgent.fixWithAgent",async(r,s)=>{!r||!s||await o.executeFixWithAgent(r,s)})),n.migrateResetIfLegacy().then(r=>{r&&(p.info("Legacy single connection removed; directing user to create a profile."),h.window.showInformationMessage("Single connection removed \u2014 create a profile to reconnect.","New Profile").then(s=>{s==="New Profile"&&i.promptCreateProfile()}))})}function se(){p.dispose()}0&&(module.exports={activate,deactivate});
