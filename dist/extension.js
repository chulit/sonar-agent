"use strict";var Q=Object.create;var L=Object.defineProperty;var q=Object.getOwnPropertyDescriptor;var G=Object.getOwnPropertyNames;var Y=Object.getPrototypeOf,J=Object.prototype.hasOwnProperty;var X=(d,e)=>{for(var t in e)L(d,t,{get:e[t],enumerable:!0})},M=(d,e,t,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of G(e))!J.call(d,i)&&i!==t&&L(d,i,{get:()=>e[i],enumerable:!(n=q(e,i))||n.enumerable});return d};var P=(d,e,t)=>(t=d!=null?Q(Y(d)):{},M(e||!d||!d.__esModule?L(t,"default",{value:d,enumerable:!0}):t,d)),Z=d=>M(L({},"__esModule",{value:!0}),d);var oe={};X(oe,{activate:()=>ie,deactivate:()=>ne});module.exports=Z(oe);var m=P(require("vscode"));var _=P(require("node:path")),N=P(require("node:fs/promises")),T="sonarAgent.token",$="profiles",R="activeProfileId",F=d=>`${T}.${d}`;function ee(d){return d.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"profile"}var B=class d{secrets;config;workspaceRoot;readFileFn;activeProjectKey;activeServerUrl;activeToken;profileTokenCache=new Map;constructor(e){this.secrets=e.secretStorage,this.config=e.workspaceConfig,this.workspaceRoot=e.workspaceRoot,this.readFileFn=e.readFileFn??(t=>N.readFile(t,"utf-8"))}static parseProperties(e){let t=e.split(/\r?\n/),n,i,o=!1;for(let r of t){let s=r.trim();if(!s||s.startsWith("#")||s.startsWith(";"))continue;let a=s.indexOf("=");if(a===-1)continue;let l=s.slice(0,a).trim(),p=s.slice(a+1).trim();l==="sonar.projectKey"?n=p:l==="sonar.host.url"?i=p:(l==="sonar.login"||l==="sonar.password"||l==="sonar.token")&&(o=!0)}return{projectKey:n,serverUrl:i,hasPlaintextCredentials:o}}readProfiles(){return this.config.get($,[])}readActiveId(){return this.config.get(R,void 0)||void 0}async persistProfiles(e,t){await this.config.update($,e,!0),await this.config.update(R,t??"",!0)}async listProfiles(){return this.readProfiles().map(e=>({...e}))}async getActiveProfile(){let e=this.readActiveId();return e?this.readProfiles().find(t=>t.id===e)??null:null}async createProfile(e){let t=this.readProfiles(),n=new Set(t.map(a=>a.id)),i=ee(e.name),o=i,r=2;for(;n.has(o);)o=`${i}-${r++}`;let s={id:o,name:e.name.trim(),serverUrl:e.serverUrl.trim(),projectKey:e.projectKey.trim(),updatedAt:Date.now()};return await this.persistProfiles([...t,s],o),e.token!==void 0&&await this.updateProfileToken(o,e.token),{...s}}async activateProfile(e){if(!this.readProfiles().find(n=>n.id===e))throw new Error(`Unknown connection profile: ${e}`);await this.config.update(R,e,!0)}async updateProfileToken(e,t){if(!this.readProfiles().some(i=>i.id===e))throw new Error(`Unknown connection profile: ${e}`);let n=t.trim();this.profileTokenCache.set(e,n),await this.secrets.store(F(e),n)}async renameProfile(e,t){let i=this.readProfiles().map(r=>r.id===e?{...r,name:t.trim(),updatedAt:Date.now()}:r);await this.persistProfiles(i,this.readActiveId());let o=i.find(r=>r.id===e);if(!o)throw new Error(`Unknown connection profile: ${e}`);return{...o}}async deleteProfile(e){let t=this.readProfiles().filter(i=>i.id!==e),n=this.readActiveId();await this.persistProfiles(t,n===e?"":n),this.profileTokenCache.delete(e),await this.secrets.delete(F(e))}async updateProfileTarget(e,t){let i=this.readProfiles().map(r=>r.id===e?{...r,serverUrl:t.serverUrl!==void 0?t.serverUrl.trim():r.serverUrl,projectKey:t.projectKey!==void 0?t.projectKey.trim():r.projectKey,updatedAt:Date.now()}:r);await this.persistProfiles(i,this.readActiveId());let o=i.find(r=>r.id===e);if(!o)throw new Error(`Unknown connection profile: ${e}`);return{...o}}hasProfiles(){return this.readProfiles().length>0}async getToken(){if(this.hasProfiles()){let t=await this.getActiveProfile();if(!t)return;let n=this.profileTokenCache.get(t.id);if(n!==void 0)return n||void 0;let i=await this.secrets.get(F(t.id)),o=i?i.trim():null;return this.profileTokenCache.set(t.id,o),o??void 0}if(this.activeToken!==void 0)return this.activeToken??void 0;let e=await this.secrets.get(T);return this.activeToken=e?e.trim():null,this.activeToken??void 0}async setToken(e){if(this.hasProfiles()){let t=await this.getActiveProfile();if(t){await this.updateProfileToken(t.id,e);return}}this.activeToken=e.trim(),await this.secrets.store(T,this.activeToken)}async deleteToken(){if(this.hasProfiles()){let e=await this.getActiveProfile();if(e){this.profileTokenCache.delete(e.id),await this.secrets.delete(F(e.id));return}}this.activeToken=null,await this.secrets.delete(T)}async setServerUrl(e){if(this.hasProfiles()){let t=await this.getActiveProfile();if(t){await this.updateProfileTarget(t.id,{serverUrl:e});return}}this.activeServerUrl=e.trim(),await this.config.update("serverUrl",this.activeServerUrl,!0)}async setProjectKey(e){if(this.hasProfiles()){let t=await this.getActiveProfile();if(t){await this.updateProfileTarget(t.id,{projectKey:e});return}}this.activeProjectKey=e.trim(),await this.config.update("projectKey",this.activeProjectKey,!0)}isConfiguredSync(){if(this.hasProfiles()){let t=this.readProfiles().find(i=>i.id===this.readActiveId());if(!t?.serverUrl)return!1;let n=this.profileTokenCache.get(t.id);return n!==void 0?!!(t.serverUrl&&n):!0}let e=this.activeServerUrl??this.config.get("serverUrl","");return this.activeToken!==void 0?!!(e&&this.activeToken):!!e}async detectWorkspaceProperties(){if(!this.workspaceRoot)return null;let e=_.join(this.workspaceRoot,"sonar-project.properties");try{let t=await this.readFileFn(e);return d.parseProperties(t)}catch{return null}}async getConfig(){if(this.hasProfiles()){let s=await this.getActiveProfile();if(!s)return{serverUrl:"",projectKey:"",hasToken:!1,detectedFromProperties:!1};let a=await this.getToken();return{serverUrl:s.serverUrl,projectKey:s.projectKey,hasToken:!!(a&&a.trim().length>0),detectedFromProperties:!1}}let e=this.activeServerUrl??this.config.get("serverUrl",""),t=this.activeProjectKey??this.config.get("projectKey",""),n=!1,i=!1,o=await this.detectWorkspaceProperties();o&&(o.projectKey&&(t=o.projectKey,n=!0),!e&&o.serverUrl&&(e=o.serverUrl),o.hasPlaintextCredentials&&(i=!0));let r=await this.getToken();return{serverUrl:e,projectKey:t,hasToken:!!(r&&r.trim().length>0),detectedFromProperties:n,hasPlaintextCredentialsWarning:i}}};var c=P(require("vscode"));var w=class{serverUrl;token;fetchFn;constructor(e){this.serverUrl=e.serverUrl.replace(/\/+$/,""),this.token=e.token?e.token.trim():void 0,this.fetchFn=e.fetchFn??globalThis.fetch}getAuthHeader(){return this.token?{Authorization:`Basic ${Buffer.from(`${this.token}:`).toString("base64")}`}:{}}parseRating(e){let t=typeof e=="number"?e:parseFloat(String(e||"1.0"));return t<=1?"A":t<=2?"B":t<=3?"C":t<=4?"D":"E"}extractFilePath(e){let t=e.indexOf(":");return t!==-1?e.slice(t+1):e}async authenticatedFetch(e,t=1e4){let n={Accept:"application/json",...this.getAuthHeader()},i=new AbortController,o=setTimeout(()=>i.abort(),t);try{let r=await this.fetchFn(e,{method:"GET",headers:n,signal:i.signal});if(r.status===401&&this.token){let s={Accept:"application/json",Authorization:`Bearer ${this.token}`},a=await this.fetchFn(e,{method:"GET",headers:s,signal:i.signal});if(a.ok)return a}return r}catch(r){throw r.name==="AbortError"||i.signal.aborted?new Error(`Connection timed out after ${t/1e3}s`,{cause:r}):r}finally{clearTimeout(o)}}async verifyConnection(){try{let e=`${this.serverUrl}/api/authentication/validate`,t=await this.authenticatedFetch(e);if(t.status===401||t.status===403)return{ok:!1,message:`Authentication failed (HTTP ${t.status}). Please verify your token.`};if(!t.ok)return{ok:!1,message:`Server returned HTTP ${t.status}: ${t.statusText}`};let n=await t.json();return n&&n.valid===!0?{ok:!0}:{ok:!1,message:"Invalid credentials: SonarQube reported token as invalid."}}catch(e){return{ok:!1,message:`Cannot reach SonarQube server at ${this.serverUrl}: ${e.message||String(e)}`}}}async fetchProjects(){let e=[`${this.serverUrl}/api/components/search?qualifiers=TRK&ps=100`,`${this.serverUrl}/api/projects/search?ps=100`,`${this.serverUrl}/api/components/search_projects?ps=100`,`${this.serverUrl}/api/projects/search?ps=100&qualifiers=TRK`,`${this.serverUrl}/api/components/search?qualifiers=TRK`];for(let t of e)try{let n=await this.authenticatedFetch(t,4e3);if(!n.ok)continue;let i=await n.json(),o=i.components||i.projects||i.results||(Array.isArray(i)?i:[]);if(Array.isArray(o)&&o.length>0)return o.map(r=>({key:r.key||r.id||r.projectKey,name:r.name||r.key}))}catch{}return[]}async getOverview(e){let t=["bugs","reliability_rating","vulnerabilities","security_rating","code_smells","sqale_rating","accepted_issues","wont_fix_issues","coverage","lines_to_cover","duplicated_lines_density","duplicated_lines","security_hotspots"].join(","),n=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${t}`,i=await this.authenticatedFetch(n);if(!i.ok&&i.status===400)try{let l=((await i.clone().json())?.errors?.[0]?.msg||"").match(/The following metric keys are not found:\s*([^.]+)/i);if(l&&l[1]){let p=l[1].split(",").map(C=>C.trim()),g=t.split(",").filter(C=>!p.includes(C)).join(","),v=`${this.serverUrl}/api/measures/component?component=${encodeURIComponent(e)}&metricKeys=${g}`,k=await this.authenticatedFetch(v);k.ok&&(i=k)}}catch{}if(!i.ok)throw new Error(`Failed to fetch measures: HTTP ${i.status} ${i.statusText}`);let o=await i.json(),r={};for(let s of o.component?.measures||[])s.value!==void 0&&(r[s.metric]=s.value);return{security:{count:parseInt(r.vulnerabilities||"0",10),rating:this.parseRating(r.security_rating)},reliability:{count:parseInt(r.bugs||"0",10),rating:this.parseRating(r.reliability_rating)},maintainability:{count:parseInt(r.code_smells||"0",10),rating:this.parseRating(r.sqale_rating)},acceptedIssues:{count:parseInt(r.accepted_issues||r.wont_fix_issues||"0",10)},coverage:{percentage:parseFloat(r.coverage||"0"),linesToCover:parseInt(r.lines_to_cover||"0",10)},duplications:{percentage:parseFloat(r.duplicated_lines_density||"0"),duplicatedLines:parseInt(r.duplicated_lines||"0",10)},securityHotspots:{count:parseInt(r.security_hotspots||"0",10),rating:"A"}}}async getIssues(e,t){let n;if(t==="accepted")n=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=BUG,VULNERABILITY,CODE_SMELL&issueStatuses=ACCEPTED&ps=100`;else{let r="BUG,VULNERABILITY,CODE_SMELL";t==="reliability"?r="BUG":t==="security"?r="VULNERABILITY":t==="maintainability"&&(r="CODE_SMELL"),n=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=${r}&statuses=OPEN,CONFIRMED,REOPENED&ps=100`}let i=await this.authenticatedFetch(n);if(!i.ok&&t==="accepted"){let r=`${this.serverUrl}/api/issues/search?componentKeys=${encodeURIComponent(e)}&types=BUG,VULNERABILITY,CODE_SMELL&resolutions=WONTFIX&ps=100`,s=await this.authenticatedFetch(r);s.ok&&(i=s)}if(!i.ok)throw new Error(`Failed to fetch issues: HTTP ${i.status} ${i.statusText}`);return((await i.json()).issues||[]).map(r=>({id:r.key,ruleKey:r.rule||"",message:r.message||"",component:r.component||"",filePath:this.extractFilePath(r.component||""),line:r.line,type:r.type||"CODE_SMELL",severity:r.severity||"MAJOR",status:r.status||"OPEN",effort:r.effort,tags:r.tags||[],creationDate:r.creationDate||"",author:r.author||void 0}))}async getHotspots(e){let t=`${this.serverUrl}/api/hotspots/search?projectKey=${encodeURIComponent(e)}&status=TO_REVIEW&ps=100`,n=await this.authenticatedFetch(t);if(!n.ok)throw new Error(`Failed to fetch hotspots: HTTP ${n.status} ${n.statusText}`);return((await n.json()).hotspots||[]).map(o=>({id:o.key,ruleKey:o.ruleKey||"",message:o.message||"",component:o.component||"",filePath:this.extractFilePath(o.component||""),line:o.line,type:"HOTSPOT",severity:"MAJOR",status:o.status||"TO_REVIEW",tags:["security-hotspot"],creationDate:o.creationDate||"",author:o.author||void 0}))}async getEnrichedRule(e){try{let t=`${this.serverUrl}/api/rules/show?key=${encodeURIComponent(e)}`,n=await this.authenticatedFetch(t);if(!n.ok)return{key:e,name:e,cleanDesc:"Verify code adherence to Sonar rule guidelines."};let i=await n.json(),r=(i.rule?.mdDesc||i.rule?.htmlDesc||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();return{key:i.rule?.key||e,name:i.rule?.name||e,cleanDesc:r||"Verify code adherence to Sonar rule guidelines."}}catch{return{key:e,name:e,cleanDesc:"Verify code adherence to Sonar rule guidelines."}}}async getCoverageFiles(e){let t=`${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(e)}&metricKeys=uncovered_lines,coverage&qualifiers=FIL&strategy=leaves&s=metric&metricSort=uncovered_lines&asc=false&ps=100`,n=await this.authenticatedFetch(t);if(!n.ok)throw new Error(`Failed to fetch coverage files: HTTP ${n.status} ${n.statusText}`);let i=await n.json(),o=[];for(let r of i.components||[]){let s={};for(let p of r.measures||[])s[p.metric]=p.value;let a=parseInt(s.uncovered_lines||"0",10),l=parseFloat(s.coverage||"0");(a>0||l<80)&&o.push({id:r.key,ruleKey:"coverage:uncovered_lines",message:`${a} uncovered lines (${l.toFixed(0)}% coverage)`,component:r.key,filePath:r.path||this.extractFilePath(r.key),type:"COVERAGE",severity:l<50?"CRITICAL":"MAJOR",status:"UNCOVERED",effort:`${a} lines`,tags:["test-coverage","unit-test"],creationDate:new Date().toISOString()})}return o}async getDuplicationFiles(e){let t=`${this.serverUrl}/api/measures/component_tree?component=${encodeURIComponent(e)}&metricKeys=duplicated_lines_density,duplicated_blocks&qualifiers=FIL&strategy=leaves&s=metric&metricSort=duplicated_lines_density&asc=false&ps=100`,n=await this.authenticatedFetch(t);if(!n.ok)throw new Error(`Failed to fetch duplication files: HTTP ${n.status} ${n.statusText}`);let i=await n.json(),o=[];for(let r of i.components||[]){let s={};for(let p of r.measures||[])s[p.metric]=p.value;let a=parseFloat(s.duplicated_lines_density||"0"),l=parseInt(s.duplicated_blocks||"0",10);(a>0||l>0)&&o.push({id:r.key,ruleKey:"duplications:duplicated_code",message:`${a.toFixed(1)}% duplicated lines (${l} duplicated blocks)`,component:r.key,filePath:r.path||this.extractFilePath(r.key),type:"DUPLICATION",severity:a>20?"CRITICAL":"MAJOR",status:"DUPLICATED",effort:`${l} blocks`,tags:["code-duplication","refactoring"],creationDate:new Date().toISOString()})}return o}};var A=P(require("node:path")),O=P(require("node:fs/promises")),h=P(require("vscode")),S=class{workspaceRoot;fileExistsFn;findFilesFn;constructor(e){this.workspaceRoot=e?.workspaceRoot??h.workspace.workspaceFolders?.[0]?.uri.fsPath,this.fileExistsFn=e?.fileExistsFn??(async t=>{try{return await O.stat(t),!0}catch{return!1}}),this.findFilesFn=e?.findFilesFn??(async t=>(await h.workspace.findFiles(t,"**/node_modules/**",5)).map(i=>i.fsPath))}async resolveFilePath(e){if(!this.workspaceRoot)return null;let t=A.isAbsolute(e)?e:A.join(this.workspaceRoot,e);if(await this.fileExistsFn(t))return t;let n=A.basename(e);if(n){let i=await this.findFilesFn(`**/${n}`);if(i&&i.length>0)return i[0]}return null}async openFileAtLine(e,t){let n=await this.resolveFilePath(e);if(!n)return h.window.showWarningMessage(`Could not find file locally: ${e}`),!1;try{let i=h.Uri.file(n),o=await h.workspace.openTextDocument(i),r=await h.window.showTextDocument(o,{preview:!1});if(t!==void 0&&t>0){let s=t-1,a=new h.Position(s,0);r.selection=new h.Selection(a,a),r.revealRange(new h.Range(a,a),h.TextEditorRevealType.InCenter)}return!0}catch(i){return h.window.showErrorMessage(`Failed to open file: ${i.message||String(i)}`),!1}}};var K=P(require("node:path")),z=P(require("node:fs/promises")),f=P(require("vscode"));var I=class{ruleCache=new Map;fileNavigator;fetchRuleFn;readCodeSnippetFn;isExtensionInstalledFn;isAntigravityEnvFn;executeCommandFn;sendToAgentPanelFn;constructor(e){this.fileNavigator=e?.fileNavigator??new S,this.fetchRuleFn=e?.fetchRuleFn,this.readCodeSnippetFn=e?.readCodeSnippetFn,this.executeCommandFn=e?.executeCommandFn??((t,...n)=>f.commands.executeCommand(t,...n)),this.sendToAgentPanelFn=e?.sendToAgentPanelFn??(t=>{let n=f.antigravityExtensibility;return n&&typeof n.sendToAgentPanel=="function"?n.sendToAgentPanel(t):Promise.reject(new Error("antigravityExtensibility.sendToAgentPanel not available"))}),this.isExtensionInstalledFn=e?.isExtensionInstalledFn??(t=>{try{return!!f.extensions.getExtension(t)}catch{return!1}}),this.isAntigravityEnvFn=e?.isAntigravityEnvFn??(()=>{try{return!!((f.env.appName||"").toLowerCase().includes("antigravity")||process.env.GEMINI_CLI||process.env.ANTIGRAVITY_IDE||process.env.ANTIGRAVITY_AGENT)}catch{return!1}})}getAvailableAgents(){let e=[];return(this.isExtensionInstalledFn("github.copilot")||this.isExtensionInstalledFn("github.copilot-chat"))&&e.push({id:"copilot",name:"GitHub Copilot",description:"VS Code Copilot Chat",focusCommand:"workbench.action.chat.open"}),(this.isAntigravityEnvFn()||this.isExtensionInstalledFn("google.antigravity")||this.isExtensionInstalledFn("google.gemini"))&&e.push({id:"antigravity",name:"Antigravity Agent",description:"DeepMind Antigravity Agent",focusCommand:"antigravity.openChatView"}),this.isExtensionInstalledFn("anthropic.claude-code")&&e.push({id:"claude-code",name:"Claude Code",description:"Anthropic Claude Code for VS Code",focusCommand:"workbench.view.extension.claude-sidebar"}),this.isExtensionInstalledFn("saoudrizwan.claude-dev")&&e.push({id:"cline",name:"Cline",description:"Autonomous AI coding agent",focusCommand:"claude-dev.focus"}),this.isExtensionInstalledFn("rooveterinaryinc.roo-cline")&&e.push({id:"roo-code",name:"Roo Code",description:"Roo Code coding agent",focusCommand:"roo-cline.focus"}),this.isExtensionInstalledFn("continue.continue")&&e.push({id:"continue",name:"Continue",description:"Continue open-source AI assistant",focusCommand:"continue.focusContinueInputView"}),e.push({id:"clipboard",name:"Clipboard Only",description:"Copy prompt to clipboard"}),e}async getRule(e){if(this.ruleCache.has(e))return this.ruleCache.get(e);let t;return this.fetchRuleFn?t=await this.fetchRuleFn(e):t={key:e,name:e,cleanDesc:"Adhere to SonarQube quality standard for this rule."},this.ruleCache.set(e,t),t}detectLanguage(e){switch(K.extname(e).toLowerCase()){case".ts":case".tsx":return"typescript";case".js":case".jsx":return"javascript";case".vue":return"vue";case".html":return"html";case".css":return"css";case".py":return"python";case".java":return"java";case".go":return"go";case".rs":return"rust";default:return""}}async readCodeSnippet(e,t){if(this.readCodeSnippetFn)return this.readCodeSnippetFn(e,t);let n=await this.fileNavigator.resolveFilePath(e);if(!n)return null;try{let o=(await z.readFile(n,"utf-8")).split(/\r?\n/),r=o.length,s=t!==void 0&&t>0?t:1,a=Math.max(1,s-10),l=Math.min(r,s+10),p=[];for(let g=a;g<=l;g++){let v=o[g-1],k=g===s?" ---> [ISSUE HERE] ":"      ";p.push(`${g.toString().padStart(4," ")} |${k}${v}`)}return{snippet:p.join(`
`),startLine:a,endLine:l,language:this.detectLanguage(e)}}catch{return null}}async assemblePrompt(e){let t=await this.readCodeSnippet(e.filePath,e.line);if(e.type==="COVERAGE"){let o=`@workspace Please generate unit tests to improve test coverage for the following file:

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

`;for(let r=0;r<o.length;r++){let s=o[r],a=await this.getRule(s.ruleKey),l=await this.readCodeSnippet(s.filePath,s.line);t+=`### Issue #${r+1}: Line ${s.line||"File level"} [${s.severity}] ${a.name}
`,t+=`- Message: "${s.message}"
`,t+=`- Rule: \`${a.key}\`
`,t+=`- Guidance: ${a.cleanDesc}
`,l&&(t+=`\`\`\`${l.language}
${l.snippet}
\`\`\`
`),t+=`
`}}return t+=`### \u{1F3AF} Instructions for Agent
`,t+=`1. Fix all listed issues sequentially per file.
`,t+=`2. Preserve existing behavior and do not break other functionality.
`,t+=`3. Explain the applied fixes concisely.
`,t}async dispatch(e,t,n,i){try{await f.env.clipboard.writeText(e)}catch{}if(n&&n.line&&await this.fileNavigator.openFileAtLine(n.filePath,n.line),t==="copilot")try{return await this.executeCommandFn("workbench.action.chat.open",{query:e}),f.window.showInformationMessage("Dispatched Fix Prompt to GitHub Copilot Chat!"),{ok:!0,message:"Dispatched to GitHub Copilot Chat."}}catch{return f.window.showInformationMessage("Prompt copied to clipboard! Paste it into GitHub Copilot Chat."),{ok:!0,message:"Copied to clipboard (Copilot chat command not found)."}}if(t==="antigravity"){try{let s=[],a=i&&i.length>0?i:n?[n]:[],l=new Set;for(let p of a)if(p.filePath){let g=await this.fileNavigator.resolveFilePath(p.filePath);if(g&&!l.has(g)){l.add(g);let v=p.line&&p.line>0?p.line-1:0;s.push({uri:f.Uri.file(g),startLine:v,endLine:v})}}return await this.sendToAgentPanelFn({message:e,files:s.length>0?s:void 0,autoSend:!1}),f.window.showInformationMessage("Dispatched Fix Prompt to Antigravity Chat!"),{ok:!0,message:"Dispatched to Antigravity Chat."}}catch{}for(let s of["workbench.action.chat.open","antigravity.prioritized.chat.open","workbench.action.openChat"])try{return await this.executeCommandFn(s,{query:e}),f.window.showInformationMessage("Dispatched Fix Prompt to Antigravity Chat!"),{ok:!0,message:"Dispatched to Antigravity Chat."}}catch{}try{return await this.executeCommandFn("antigravity.openChatView"),f.window.showInformationMessage("Antigravity Chat opened & prompt copied to clipboard! Press Cmd+V / Ctrl+V to paste."),{ok:!0,message:"Chat opened and prompt ready in clipboard."}}catch{return f.window.showInformationMessage("Fix Prompt copied to clipboard for Antigravity Agent! Paste it into your agent chat."),{ok:!0,message:"Prompt ready in clipboard for Antigravity Agent."}}}let o=this.getAvailableAgents().find(s=>s.id===t),r=o?.name||(t==="claude-code"?"Claude Code":t==="cline"?"Cline":t==="roo-code"?"Roo Code":t==="continue"?"Continue":"Clipboard");if(t==="claude-code"){let s=["workbench.view.extension.claude-sidebar","claude-code.focus","claude.focus"];for(let a of s)try{await this.executeCommandFn(a);break}catch{}}else if(o?.focusCommand)try{await this.executeCommandFn(o.focusCommand)}catch{}return t==="clipboard"?(f.window.showInformationMessage("Fix Prompt copied to clipboard!"),{ok:!0,message:"Prompt ready in clipboard."}):(f.window.showInformationMessage(`Fix Prompt copied to clipboard for ${r}! Paste it into your agent chat.`),{ok:!0,message:`Prompt ready in clipboard for ${r}.`})}};var V=P(require("vscode")),u=class{static channel;static initialize(e){return e?this.channel=e:this.channel||(this.channel=V.window.createOutputChannel("Sonar Agent",{log:!0})),this.channel}static sanitize(e){if(!e)return"";let t=e.replace(/https?:\/\/[^\s"'`<>]+/gi,"[SERVER]");return t=t.replace(/(token|bearer|authorization|password)\s*[:=]\s*[^\s,;&]+/gi,"$1: [REDACTED]"),t}static info(e){this.channel||this.initialize(),this.channel?.info(this.sanitize(e))}static warn(e){this.channel||this.initialize(),this.channel?.warn(this.sanitize(e))}static error(e,t){this.channel||this.initialize();let n="";t&&(t instanceof Error?n=` - ${t.message}`:n=` - ${String(t)}`),this.channel?.error(this.sanitize(`${e}${n}`))}static debug(e){this.channel||this.initialize(),this.channel?.debug(this.sanitize(e))}static show(){this.channel?.show(!0)}static dispose(){this.channel?.dispose(),this.channel=void 0}};var E=class{constructor(e,t,n,i,o){this.extensionUri=e;this.projectDetector=t;this.fileNavigator=n??new S,this.agentDispatcher=i??new I({fileNavigator:this.fileNavigator}),this.diagnosticCollection=o??c.languages.createDiagnosticCollection("SonarQube")}static viewType="sonarAgent.overviewView";_view;_webviewReady=!1;_lastStateMessage;fileNavigator;agentDispatcher;diagnosticCollection;resolveWebviewView(e,t,n){this._view=e,this._webviewReady=!1;let i=this.projectDetector.isConfiguredSync?.()??!1;u.info(`[Host] resolveWebviewView called. visible=${e.visible}, isConfigured=${i}`),e.webview.options={enableScripts:!0,localResourceRoots:[this.extensionUri]},e.webview.html=this._getHtmlForWebview(e.webview,i),e.webview.onDidReceiveMessage(async o=>{try{switch(u.info(`[Host] onDidReceiveMessage: command=${o.command}${o.text?` text="${o.text}"`:""}`),o.command){case"log":{u.info(`[Webview] ${o.text}`);break}case"ready":case"init":{this._webviewReady=!0,this._lastStateMessage&&this._view&&await this._view.webview.postMessage(this._lastStateMessage),await this._syncState();break}case"connect":{await this._handleConnect(o.serverUrl,o.token);break}case"disconnect":{await this._handleDisconnect();break}case"selectProject":{o.projectKey&&(await this.projectDetector.setProjectKey(o.projectKey),await this._syncState());break}case"switchProfile":{await this._handleSwitchProfile(o.profileId);break}case"createProfile":{await this.promptCreateProfile();break}case"openProjectPicker":{await this.promptProjectSelection();break}case"fetchDetails":{await this._handleFetchDetails(o.category);break}case"openFile":{await this.fileNavigator.openFileAtLine(o.filePath,o.line);break}case"sendToAgent":{await this._handleSendToAgent(o.item,o.targetAgentId);break}case"sendBatchToAgent":{await this._handleSendBatchToAgent(o.items,o.targetAgentId);break}case"setTargetAgent":{await c.workspace.getConfiguration("sonarAgent").update("defaultAgent",o.agentId,!0);break}case"refresh":{await this._syncState();break}}}catch(r){console.error("[SonarAgent] Webview message handling error:",r),this._view?.webview.postMessage({type:"error",message:r?.message||"Error processing request."})}}),this._syncState(),e.onDidChangeVisibility(()=>{e.visible&&this._syncState()})}async refresh(){this._view&&await this._syncState()}async promptProjectSelection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!e.serverUrl||!t){c.window.showWarningMessage("Please connect to SonarQube first.");return}let i=await new w({serverUrl:e.serverUrl,token:t}).fetchProjects(),o={label:"$(edit) Enter Project Key manually...",description:"Type the exact project key from SonarQube",detail:"Use this if your project is not listed or search is restricted"},r=[o,...i.map(a=>({label:a.name,description:a.key,detail:a.key===e.projectKey?"(Currently selected)":void 0}))],s=await c.window.showQuickPick(r,{placeHolder:"Select a SonarQube project or enter key manually",matchOnDescription:!0});if(s===o){let a=await c.window.showInputBox({prompt:"Enter the SonarQube Project Key",placeHolder:"e.g. org.company:my-project",value:e.projectKey||"",validateInput:l=>l.trim()?null:"Project Key cannot be empty"});if(a&&a.trim()){let l=a.trim();await this.projectDetector.setProjectKey(l),await this._syncState(),c.window.showInformationMessage(`Active SonarQube project set to: ${l}`)}return}s&&s.description&&(await this.projectDetector.setProjectKey(s.description),await this._syncState(),c.window.showInformationMessage(`Active SonarQube project set to: ${s.label}`))}async promptConfigureConnection(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken(),n=!!(e.serverUrl&&t),i=[{label:"$(link) Update Server URL & Token",description:n?"Connected":"Not connected",detail:e.serverUrl?`Server: ${e.serverUrl}`:"Configure SonarQube host URL and authentication token",action:"updateCredentials"},{label:"$(folder-active) Select Sonar Project",description:e.projectKey?"Active":"Not selected",detail:e.projectKey?`Current project: ${e.projectKey}`:"Choose an active project on the server",action:"selectProject"},{label:"$(settings-gear) Open Extension Settings",detail:"Configure default AI agent and advanced preferences",action:"openSettings"},{label:"$(output) Show Extension Logs",detail:"Open the Sonar Agent output log channel",action:"showLogs"}];n&&i.push({label:"$(debug-disconnect) Disconnect & Reset Credentials",detail:"Remove stored token from OS Keychain and disconnect",action:"disconnect"}),this.profilesCapable()&&(i.splice(2,0,{label:"$(arrow-swap) Switch Connection Profile",detail:"Activate a different server + project + token binding",action:"switchProfile"}),i.splice(3,0,{label:"$(add) New Connection Profile...",detail:"Create a named server + project binding with live verification",action:"newProfile"}),i.splice(4,0,{label:"$(edit) Rename Connection Profile...",detail:"Rename a stored connection profile",action:"renameProfile"}),i.splice(5,0,{label:"$(trash) Delete Connection Profile...",detail:"Remove a profile and delete its token from the OS Keychain",action:"deleteProfile"}),i.splice(6,0,{label:"$(check) Verify Active Connection",detail:"Live-check the active profile against the SonarQube server",action:"verifyConnection"}));let o=await c.window.showQuickPick(i,{placeHolder:"Sonar Agent: Configure Connection & Settings",matchOnDescription:!0,matchOnDetail:!0});if(o)switch(o.action){case"updateCredentials":await this.promptUpdateCredentials(e.serverUrl);break;case"selectProject":await this.promptProjectSelection();break;case"switchProfile":case"newProfile":case"renameProfile":case"deleteProfile":case"verifyConnection":await this.runProfileAction(o.action);break;case"openSettings":await c.commands.executeCommand("workbench.action.openSettings","@ext:chulit.sonar-agent");break;case"showLogs":u.show();break;case"disconnect":await c.commands.executeCommand("sonarAgent.resetConnection");break}}async promptUpdateCredentials(e,t){let n=e||(await this.projectDetector.getConfig()).serverUrl||"http://localhost:9000",i=t||"";for(;;){let o=await c.window.showInputBox({title:"SonarQube Connection (1/2)",prompt:"Enter the SonarQube Server URL",placeHolder:"http://localhost:9000 or https://sonar.example.com",value:n,ignoreFocusOut:!0,validateInput:l=>this.validateServerUrlInput(l)});if(o===void 0)return;n=o.trim();let r=await c.window.showInputBox({title:"SonarQube Connection (2/2)",prompt:"Enter your SonarQube User Token",placeHolder:"sqp_...",value:i,password:!0,ignoreFocusOut:!0,validateInput:l=>l.trim()?null:"User Token is required"});if(r===void 0)return;i=r.trim();let s={ok:!1};if(await c.window.withProgress({location:c.ProgressLocation.Notification,title:"Verifying SonarQube connection...",cancellable:!1},async()=>{s=await new w({serverUrl:n,token:i}).verifyConnection()}),!s.ok){if(await c.window.showErrorMessage(`SonarQube connection verification failed: ${s.message||"Unknown error"}`,"Retry","Cancel")==="Retry")continue;return}await this.projectDetector.setServerUrl(n),await this.projectDetector.setToken(i),c.window.showInformationMessage("SonarQube connection successfully verified and saved!"),(await this.projectDetector.getConfig()).projectKey||await this.promptProjectSelection(),await this.refresh();return}}validateServerUrlInput(e){let t=e.trim();if(!t)return"Server URL is required";if(!t.startsWith("http://")&&!t.startsWith("https://"))return"Server URL must start with http:// or https://";try{if(!new URL(t).hostname)return"Please enter a valid URL with hostname"}catch{return"Please enter a valid URL"}return null}async promptManageProfiles(){let e=[{label:"$(arrow-swap) Switch Profile",action:"switchProfile"},{label:"$(add) New Profile...",action:"newProfile"},{label:"$(edit) Rename Profile...",action:"renameProfile"},{label:"$(trash) Delete Profile...",action:"deleteProfile"},{label:"$(check) Verify Active Connection",action:"verifyConnection"}],t=await c.window.showQuickPick(e,{placeHolder:"Sonar Agent: Manage Connection Profiles"});t&&await this.runProfileAction(t.action)}async runProfileAction(e){switch(e){case"switchProfile":{let t=await this.pickProfile("Select the connection profile to activate");if(!t)return;try{await this.projectDetector.activateProfile(t.id)}catch(n){c.window.showErrorMessage(n?.message||`Unknown connection profile: ${t.id}`);return}c.window.showInformationMessage(`Active connection profile: ${t.name}`),await this.refresh();break}case"newProfile":await this.promptCreateProfile();break;case"renameProfile":{let t=await this.pickProfile("Select the connection profile to rename");if(!t)return;let n=await c.window.showInputBox({prompt:`New name for profile "${t.name}"`,value:t.name,ignoreFocusOut:!0,validateInput:i=>i.trim()?null:"Profile name is required"});if(n===void 0||!n.trim())return;await this.projectDetector.renameProfile(t.id,n.trim()),await this.refresh();break}case"deleteProfile":{let t=await this.pickProfile("Select the connection profile to delete");if(!t||await c.window.showWarningMessage(`Delete connection profile "${t.name}" and its stored token?`,{modal:!0},"Delete")!=="Delete")return;await this.projectDetector.deleteProfile(t.id),c.window.showInformationMessage(`Connection profile "${t.name}" deleted. Create a profile to reconnect.`),await this.refresh();break}case"verifyConnection":{let t=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken();if(!t.serverUrl||!n){c.window.showWarningMessage("No active connection profile to verify.");return}let i={ok:!1};await c.window.withProgress({location:c.ProgressLocation.Notification,title:"Verifying SonarQube connection...",cancellable:!1},async()=>{i=await new w({serverUrl:t.serverUrl,token:n}).verifyConnection()}),i.ok?c.window.showInformationMessage("SonarQube connection verified."):c.window.showErrorMessage(`SonarQube connection verification failed: ${i.message||"Unknown error"}`);break}}}async pickProfile(e){let t=await this.projectDetector.listProfiles();if(t.length===0){c.window.showInformationMessage("No connection profiles yet. Create one first.");return}let n=await c.window.showQuickPick(t.map(i=>({label:i.name,description:i.id,detail:`${i.serverUrl} \xB7 ${i.projectKey}`})),{placeHolder:e,matchOnDescription:!0,matchOnDetail:!0});return n?t.find(i=>i.id===n.description):void 0}async promptCreateProfile(){let e=await this.projectDetector.detectWorkspaceProperties(),t="",n=e?.serverUrl??"http://localhost:9000",i="",o=e?.projectKey??"";for(;;){let r=await c.window.showInputBox({title:"New Connection Profile (1/4)",prompt:"Name this profile (e.g. kantor-prod)",value:t,ignoreFocusOut:!0,validateInput:v=>v.trim()?null:"Profile name is required"});if(r===void 0)return;t=r.trim();let s=await c.window.showInputBox({title:"New Connection Profile (2/4)",prompt:"Enter the SonarQube Server URL",placeHolder:"http://localhost:9000 or https://sonar.example.com",value:n,ignoreFocusOut:!0,validateInput:v=>this.validateServerUrlInput(v)});if(s===void 0)return;n=s.trim();let a=await c.window.showInputBox({title:"New Connection Profile (3/4)",prompt:"Enter your SonarQube User Token",placeHolder:"sqp_...",value:i,password:!0,ignoreFocusOut:!0,validateInput:v=>v.trim()?null:"User Token is required"});if(a===void 0)return;i=a.trim();let l=await c.window.showInputBox({title:"New Connection Profile (4/4)",prompt:"Enter the SonarQube Project Key (optional, pick later)",value:o,ignoreFocusOut:!0});if(l===void 0)return;o=l.trim();let p={ok:!1};if(await c.window.withProgress({location:c.ProgressLocation.Notification,title:"Verifying SonarQube connection...",cancellable:!1},async()=>{p=await new w({serverUrl:n,token:i}).verifyConnection()}),!p.ok){if(await c.window.showErrorMessage(`SonarQube connection verification failed: ${p.message||"Unknown error"}`,"Retry","Cancel")==="Retry")continue;return}let g=await this.projectDetector.createProfile({name:t,serverUrl:n,projectKey:o,token:i});e?.hasPlaintextCredentials&&c.window.showWarningMessage("sonar-project.properties contains plaintext credentials. They were not imported; remove them to avoid leaking secrets."),c.window.showInformationMessage(`Connection profile "${g.name}" created and activated.`),g.projectKey||await this.promptProjectSelection(),await this.refresh();return}}async _handleSendToAgent(e,t){let n=await this.projectDetector.getConfig(),i=await this.projectDetector.getToken(),o=t||c.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),r;n.serverUrl&&i&&(r=new w({serverUrl:n.serverUrl,token:i}));let s=new I({fileNavigator:this.fileNavigator,fetchRuleFn:r?l=>r.getEnrichedRule(l):void 0}),a=await s.assemblePrompt(e);await s.dispatch(a,o,e)}async _handleSendBatchToAgent(e,t){if(!e||e.length===0)return;let n=await this.projectDetector.getConfig(),i=await this.projectDetector.getToken(),o=t||c.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),r;n.serverUrl&&i&&(r=new w({serverUrl:n.serverUrl,token:i}));let s=new I({fileNavigator:this.fileNavigator,fetchRuleFn:r?l=>r.getEnrichedRule(l):void 0}),a=await s.assembleBatchPrompt(e);await s.dispatch(a,o,e[0],e)}async _handleFetchDetails(e){if(!this._view)return;let t=await this.projectDetector.getConfig(),n=await this.projectDetector.getToken();if(!(!t.serverUrl||!t.projectKey||!n)){this._view.webview.postMessage({type:"loadingDetails",loading:!0});try{let i=new w({serverUrl:t.serverUrl,token:n}),o=[];e==="hotspots"?o=await i.getHotspots(t.projectKey):e==="coverage"?o=await i.getCoverageFiles(t.projectKey):e==="duplications"?o=await i.getDuplicationFiles(t.projectKey):e==="reliability"||e==="security"||e==="maintainability"||e==="accepted"?o=await i.getIssues(t.projectKey,e):o=await i.getIssues(t.projectKey),this._view.webview.postMessage({type:"details",category:e,items:o}),await this.syncDiagnostics(o)}catch(i){this._view.webview.postMessage({type:"detailsError",message:i.message||"Failed to load issues."})}finally{this._view.webview.postMessage({type:"loadingDetails",loading:!1})}}}async syncDiagnostics(e){this.diagnosticCollection.clear();let t=new Map;for(let n of e){if(!n.filePath)continue;let i=await this.fileNavigator.resolveFilePath(n.filePath);if(!i)continue;let o=c.Uri.file(i),r=n.line&&n.line>0?n.line-1:0,s=new c.Range(r,0,r,100),a=c.DiagnosticSeverity.Information;n.severity==="BLOCKER"||n.severity==="CRITICAL"?a=c.DiagnosticSeverity.Error:n.severity==="MAJOR"&&(a=c.DiagnosticSeverity.Warning);let l=new c.Diagnostic(s,n.message,a);l.code=n.ruleKey,l.source="SonarQube";let p=t.get(o.toString())||{uri:o,diagnostics:[]};p.diagnostics.push(l),t.set(o.toString(),p)}for(let{uri:n,diagnostics:i}of t.values())this.diagnosticCollection.set(n,i)}async _handleSwitchProfile(e){try{await this.projectDetector.activateProfile(e)}catch(t){this._view?.webview.postMessage({type:"error",message:t?.message||`Unknown connection profile: ${e}`});return}await this._syncState()}profilesCapable(){return typeof this.projectDetector.listProfiles=="function"}async _syncState(){if(this._view)try{let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken(),n=c.workspace.getConfiguration("sonarAgent").get("defaultAgent","copilot"),i=this.agentDispatcher.getAvailableAgents(),o=n;i.some(a=>a.id===o)||(o=i[0]?.id||"clipboard");let r=this.profilesCapable()?await this.projectDetector.listProfiles():[],s=this.profilesCapable()?await this.projectDetector.getActiveProfile():null;if(u.info(`[Host] _syncState: serverUrl=${e.serverUrl}, hasToken=${e.hasToken}, tokenPresent=${!!t}`),this.profilesCapable()&&r.length===0&&!e.serverUrl&&!t){let a={type:"state",state:"no-profiles",serverUrl:"http://localhost:9000",profiles:r,activeProfileId:s?.id,defaultAgent:o,availableAgents:i};this._lastStateMessage=a,await this._view.webview.postMessage(a);return}if(e.serverUrl&&e.hasToken&&t){let a={type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:e.projectKey,detectedFromProperties:e.detectedFromProperties??!1,hasPlaintextWarning:e.hasPlaintextCredentialsWarning??!1,projects:[],profiles:r,activeProfileId:s?.id,defaultAgent:o,availableAgents:i};this._lastStateMessage=a;let l=await this._view.webview.postMessage(a);u.info(`[Host] Immediate postMessage(connected) delivered=${l}`),await this._view.webview.postMessage({type:"loading",loading:!0});let p=new w({serverUrl:e.serverUrl,token:t}),g=e.projectKey,[v,k]=await Promise.allSettled([p.fetchProjects(),g?p.getOverview(g):Promise.resolve(null)]),C=v.status==="fulfilled"?v.value:[];v.status==="rejected"&&console.error("[SonarAgent] fetchProjects error:",v.reason);let x=g;!x&&C.length>0&&(x=C[0].key,await this.projectDetector.setProjectKey(x));let y=null,j;if(x&&x===g)k.status==="fulfilled"?(y=k.value,y&&u.info(`Measures updated for [${x}]: ${y.security.count} vulnerabilities, ${y.reliability.count} bugs, ${y.maintainability.count} smells, ${y.coverage.percentage.toFixed(1)}% coverage.`)):(j=k.reason?.message||"Failed to fetch project measures.",u.error(`Failed to fetch project measures for [${x}]`,j));else if(x)try{y=await p.getOverview(x),y&&u.info(`Measures updated for [${x}]: ${y.security.count} vulnerabilities, ${y.reliability.count} bugs, ${y.maintainability.count} smells, ${y.coverage.percentage.toFixed(1)}% coverage.`)}catch(W){j=W.message||"Failed to fetch project measures.",u.error(`Failed to fetch project measures for [${x}]`,j)}let U={type:"state",state:"connected",serverUrl:e.serverUrl,projectKey:x,detectedFromProperties:e.detectedFromProperties??!1,hasPlaintextWarning:e.hasPlaintextCredentialsWarning??!1,projects:C,overview:y,overviewError:j,profiles:r,activeProfileId:s?.id,defaultAgent:o,availableAgents:i};this._lastStateMessage=U;let H=await this._view.webview.postMessage(U);u.info(`[Host] Full postMessage(connected) delivered=${H}`),await this._view.webview.postMessage({type:"loading",loading:!1}),!this._webviewReady&&this._view&&setTimeout(async()=>{!this._webviewReady&&this._view&&this._lastStateMessage&&await this._view.webview.postMessage(this._lastStateMessage)},350)}else{let a={type:"state",state:"onboarding",serverUrl:e.serverUrl||"http://localhost:9000",profiles:r,activeProfileId:s?.id,defaultAgent:o,availableAgents:i};this._lastStateMessage=a;let l=await this._view.webview.postMessage(a);u.info(`[Host] postMessage(onboarding) delivered=${l}`)}}catch(e){console.error("[SonarAgent] _syncState error:",e),u.error("Failed to synchronize Sonar Agent state",e),this._view?.webview.postMessage({type:"error",message:e.message||"Failed to synchronize Sonar Agent state."}),this._view?.webview.postMessage({type:"loading",loading:!1})}}async _handleConnect(e,t){let n=(t||"").trim(),i=(e||"").trim();if(!i||!n){this._view?.webview.postMessage({type:"error",message:"Server URL and User Token are required."});return}!i.startsWith("http://")&&!i.startsWith("https://")&&(i="http://"+i),i=i.replace(/\/+$/,""),this._view?.webview.postMessage({type:"connecting"}),u.info("Verifying SonarQube credentials...");try{let r=await new w({serverUrl:i,token:n}).verifyConnection();if(!r.ok){u.warn(`Connection verification failed: ${r.message||"Unknown error"}`),this._view?.webview.postMessage({type:"error",message:r.message||"Connection verification failed."});return}await this.projectDetector.setServerUrl(i),await this.projectDetector.setToken(n),u.info("SonarQube connection verified and saved."),c.window.showInformationMessage("SonarQube connection successfully verified!"),await this._syncState()}catch(o){console.error("[SonarAgent] _handleConnect error:",o),u.error("Unexpected connection error occurred",o),this._view?.webview.postMessage({type:"error",message:o?.message||"Unexpected connection error occurred."})}}async _handleDisconnect(){let e=await this.projectDetector.getConfig(),t=await this.projectDetector.getToken();if(!!!(e.serverUrl&&t)){this._view?.webview.postMessage({type:"disconnected",message:"Connection credentials cleared."}),c.window.showInformationMessage("Sonar Agent connection inputs cleared.");return}await c.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await this.projectDetector.deleteToken(),u.info("SonarQube credentials removed and disconnected."),this._view?.webview.postMessage({type:"disconnected",message:"Disconnected from SonarQube. Credentials removed."}),c.window.showInformationMessage("SonarQube credentials have been removed."),await this._syncState())}_getHtmlForWebview(e,t=!1){let n=te();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${e.cspSource} 'unsafe-inline'; font-src ${e.cspSource}; img-src ${e.cspSource} https: data:; script-src 'nonce-${n}' ${e.cspSource}; connect-src ${e.cspSource} https:;">
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
        <select id="profile-switcher" class="hidden" title="Connection profile" style="max-width: 140px; font-size: 11px; padding: 2px 4px;"></select>
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
            headerDisconnectBtn.classList.remove("hidden");
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
          } else if (message.state === "no-profiles") {
            headerDisconnectBtn.classList.add("hidden");
            connectedView.classList.add("hidden");
            onboardingView.classList.add("hidden");
            noProfilesView.classList.remove("hidden");
            renderProfileSwitcher(message.profiles, message.activeProfileId);
          } else {
            headerDisconnectBtn.classList.add("hidden");
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
</html>`}};function te(){let d="",e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let t=0;t<32;t++)d+=e.charAt(Math.floor(Math.random()*e.length));return d}var b=P(require("vscode"));var D=class{static providedCodeActionKinds=[b.CodeActionKind.QuickFix];projectDetector;fileNavigator;customDispatcher;constructor(e){this.projectDetector=e.projectDetector,this.fileNavigator=e.fileNavigator??new S,this.customDispatcher=e.dispatcher}provideCodeActions(e,t,n,i){let o=[];for(let r of n.diagnostics)if(r.source&&r.source.toLowerCase().includes("sonar")){let s=r.code?`\u26A1 Send to AI Agent (${r.code})`:"\u26A1 Send to AI Agent (SonarQube)",a=new b.CodeAction(s,b.CodeActionKind.QuickFix);a.command={command:"sonarAgent.fixWithAgent",title:"Send to Agent",arguments:[r,e]},a.diagnostics=[r],a.isPreferred=!0,o.push(a)}return o}async executeFixWithAgent(e,t){let n=await this.projectDetector.getConfig(),i=await this.projectDetector.getToken(),o;n.serverUrl&&i&&(o=new w({serverUrl:n.serverUrl,token:i}));let r=this.customDispatcher??new I({fileNavigator:this.fileNavigator,fetchRuleFn:o?C=>o.getEnrichedRule(C):void 0}),s=await r.getAvailableAgents(),l=b.workspace.getConfiguration("sonarAgent").get("defaultAgent");(!l||!s.some(C=>C.id===l))&&(l=s[0]?.id||"antigravity");let p="MAJOR";e.severity===b.DiagnosticSeverity.Error?p="CRITICAL":e.severity===b.DiagnosticSeverity.Information?p="MINOR":e.severity===b.DiagnosticSeverity.Hint&&(p="INFO");let g=b.workspace.asRelativePath?b.workspace.asRelativePath(t.uri):t.fileName,v={id:String(e.code||"sonar-issue"),ruleKey:String(e.code||""),message:e.message,component:g,filePath:g,line:e.range.start.line+1,severity:p,type:"CODE_SMELL",status:"OPEN",tags:[],creationDate:new Date().toISOString()},k=await r.assemblePrompt(v);return r.dispatch(k,l,v)}};function ie(d){let e=u.initialize();d.subscriptions.push(e),u.info("Sonar Agent extension activated.");let t=m.workspace.workspaceFolders?.[0]?.uri.fsPath,n=new B({secretStorage:d.secrets,workspaceConfig:{get:(r,s)=>m.workspace.getConfiguration("sonarAgent").get(r,s),update:(r,s,a)=>m.workspace.getConfiguration("sonarAgent").update(r,s,a)},workspaceRoot:t}),i=new E(d.extensionUri,n);d.subscriptions.push(m.window.registerWebviewViewProvider(E.viewType,i)),d.subscriptions.push(m.commands.registerCommand("sonarAgent.refresh",async()=>{await i.refresh()})),d.subscriptions.push(m.commands.registerCommand("sonarAgent.configure",async()=>{await i.promptConfigureConnection()})),d.subscriptions.push(m.commands.registerCommand("sonarAgent.selectProject",async()=>{await i.promptProjectSelection()})),d.subscriptions.push(m.commands.registerCommand("sonarAgent.profile.manage",async()=>{await i.promptManageProfiles()})),d.subscriptions.push(m.commands.registerCommand("sonarAgent.resetConnection",async()=>{await m.window.showWarningMessage("Are you sure you want to disconnect and remove stored SonarQube credentials?",{modal:!0},"Disconnect")==="Disconnect"&&(await n.deleteToken(),await i.refresh(),m.window.showInformationMessage("SonarQube credentials have been removed."))})),d.subscriptions.push(m.commands.registerCommand("sonarAgent.showLogs",()=>{u.show()}));let o=new D({projectDetector:n});d.subscriptions.push(m.languages.registerCodeActionsProvider({scheme:"file"},o,{providedCodeActionKinds:D.providedCodeActionKinds})),d.subscriptions.push(m.commands.registerCommand("sonarAgent.fixWithAgent",async(r,s)=>{!r||!s||await o.executeFixWithAgent(r,s)}))}function ne(){u.dispose()}0&&(module.exports={activate,deactivate});
