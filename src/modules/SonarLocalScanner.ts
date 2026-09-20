import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { SonarDetailItem } from './SonarClient.js';
import { Logger } from './Logger.js';

export interface ScanResult {
  ok: boolean;
  errorMessage?: string;
}

export interface SpawnedProcess {
  on(event: string, listener: (...args: any[]) => void): unknown;
  stdout?: { on(event: string, listener: (chunk: any) => void): unknown };
  stderr?: { on(event: string, listener: (chunk: any) => void): unknown };
}

export interface ScanBinding {
  serverUrl?: string;
  projectKey?: string;
  token?: string;
}

export interface SpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SonarLocalScannerOptions {
  workspaceRoot?: string;
  getExtensionFn?: (extensionId: string) => { isActive?: boolean } | undefined;
  getDiagnosticsFn?: () => Array<readonly [unknown, vscode.Diagnostic[]]>;
  onDidChangeDiagnosticsFn?: (
    listener: (e: vscode.DiagnosticChangeEvent) => void,
  ) => vscode.Disposable;
  asRelativePathFn?: (uri: unknown) => string;
  spawnFn?: (command: string, args: string[], options: SpawnOptions) => SpawnedProcess;
}

export const SONARLINT_EXTENSION_ID = 'sonarsource.sonarlint-vscode';
export const SCANNER_NOT_FOUND_MESSAGE =
  'sonar-scanner not found. Install SonarQube Scanner CLI or ensure npx is available.';

function extractRuleKey(code: vscode.Diagnostic['code']): string {
  if (code === undefined || code === null) {
    return 'sonarlint:unknown';
  }
  if (typeof code === 'object') {
    return String((code as { value: string | number }).value);
  }
  return String(code);
}

function mapSeverity(severity?: vscode.DiagnosticSeverity): SonarDetailItem['severity'] {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'CRITICAL';
    case vscode.DiagnosticSeverity.Warning:
      return 'MAJOR';
    case vscode.DiagnosticSeverity.Information:
      return 'MINOR';
    case vscode.DiagnosticSeverity.Hint:
      return 'INFO';
    default:
      return 'MAJOR';
  }
}

export class SonarLocalScanner {
  private readonly workspaceRoot?: string;
  private readonly getExtensionFn: (id: string) => { isActive?: boolean } | undefined;
  private readonly getDiagnosticsFn: () => Array<readonly [unknown, vscode.Diagnostic[]]>;
  private readonly onDidChangeDiagnosticsFn: (
    listener: (e: vscode.DiagnosticChangeEvent) => void,
  ) => vscode.Disposable;
  private readonly asRelativePathFn: (uri: unknown) => string;
  private readonly spawnFn: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => SpawnedProcess;

  constructor(options?: SonarLocalScannerOptions) {
    this.workspaceRoot =
      options?.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.getExtensionFn =
      options?.getExtensionFn ??
      ((id: string) => {
        try {
          return vscode.extensions.getExtension(id) as { isActive?: boolean } | undefined;
        } catch {
          return undefined;
        }
      });
    this.getDiagnosticsFn =
      options?.getDiagnosticsFn ??
      (() =>
        vscode.languages.getDiagnostics() as unknown as Array<
          readonly [unknown, vscode.Diagnostic[]]
        >);
    this.onDidChangeDiagnosticsFn =
      options?.onDidChangeDiagnosticsFn ??
      ((listener) => vscode.languages.onDidChangeDiagnostics(listener));
    this.asRelativePathFn =
      options?.asRelativePathFn ??
      ((uri: unknown) => {
        try {
          return vscode.workspace.asRelativePath(uri as any);
        } catch {
          const maybe = uri as { fsPath?: string };
          return maybe?.fsPath ?? String(uri);
        }
      });
    this.spawnFn =
      options?.spawnFn ??
      ((command: string, args: string[], opts: SpawnOptions) =>
        spawn(command, args, {
          cwd: opts.cwd,
          env: opts.env,
          shell: false,
        }) as unknown as SpawnedProcess);
  }

  isSonarLintInstalled(): boolean {
    const ext = this.getExtensionFn(SONARLINT_EXTENSION_ID);
    if (!ext) {
      return false;
    }
    if (typeof ext.isActive === 'boolean') {
      return ext.isActive;
    }
    return true;
  }

  getLocalDiagnostics(): SonarDetailItem[] {
    let entries: Array<readonly [unknown, vscode.Diagnostic[]]>;
    try {
      entries = this.getDiagnosticsFn() ?? [];
    } catch {
      return [];
    }
    const items: SonarDetailItem[] = [];
    for (const [uri, diagnostics] of entries) {
      for (const diagnostic of diagnostics ?? []) {
        if (!diagnostic.source || !diagnostic.source.toLowerCase().includes('sonar')) {
          continue;
        }
        items.push(this.mapDiagnostic(uri, diagnostic));
      }
    }
    return items;
  }

  mapDiagnostic(uri: unknown, diagnostic: vscode.Diagnostic): SonarDetailItem {
    const filePath = this.asRelativePathFn(uri);
    const ruleKey = extractRuleKey(diagnostic.code);
    const line = diagnostic.range.start.line + 1;
    return {
      id: `${filePath}:${line}:${ruleKey}:${diagnostic.message.slice(0, 32)}`,
      ruleKey,
      message: diagnostic.message,
      component: filePath,
      filePath,
      line,
      type: 'CODE_SMELL',
      severity: mapSeverity(diagnostic.severity),
      status: 'OPEN',
      tags: ['sonarlint'],
      creationDate: new Date().toISOString(),
      source: 'sonarlint',
    };
  }

  onDiagnosticsChanged(callback: (items: SonarDetailItem[]) => void): vscode.Disposable {
    return this.onDidChangeDiagnosticsFn(() => {
      callback(this.getLocalDiagnostics());
    });
  }

  async runCliScan(workspaceRoot?: string, binding?: ScanBinding): Promise<ScanResult> {
    const cwd = workspaceRoot ?? this.workspaceRoot;
    if (!cwd) {
      return { ok: false, errorMessage: 'No workspace folder open.' };
    }
    const args = this.buildScanArgs(binding);
    const env = this.buildScanEnv(binding);
    const direct = await this.runCommand('sonar-scanner', args, cwd, env);
    if (direct.spawned) {
      return direct.succeeded
        ? { ok: true }
        : { ok: false, errorMessage: direct.errorMessage ?? 'Sonar scanner failed.' };
    }
    if (!direct.notFound) {
      return { ok: false, errorMessage: direct.errorMessage ?? 'Sonar scanner failed.' };
    }
    const fallback = await this.runCommand('npx', ['sonar-scanner', ...args], cwd, env);
    if (!fallback.spawned) {
      return { ok: false, errorMessage: SCANNER_NOT_FOUND_MESSAGE };
    }
    return fallback.succeeded
      ? { ok: true }
      : { ok: false, errorMessage: fallback.errorMessage ?? 'Sonar scanner failed.' };
  }

  private buildScanArgs(binding?: ScanBinding): string[] {
    const args: string[] = [];
    if (binding?.projectKey) {
      args.push(`-Dsonar.projectKey=${binding.projectKey}`);
    }
    if (binding?.serverUrl) {
      args.push(`-Dsonar.host.url=${binding.serverUrl}`);
    }
    return args;
  }

  private buildScanEnv(binding?: ScanBinding): NodeJS.ProcessEnv | undefined {
    if (!binding?.token) {
      return undefined;
    }
    return { ...process.env, SONAR_TOKEN: binding.token };
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    env?: NodeJS.ProcessEnv,
  ): Promise<{ spawned: boolean; succeeded: boolean; notFound: boolean; errorMessage?: string }> {
    return new Promise((resolve) => {
      let proc: SpawnedProcess;
      try {
        proc = this.spawnFn(command, args, { cwd, env });
      } catch (err: any) {
        const notFound = isNotFoundError(err);
        resolve({
          spawned: false,
          succeeded: false,
          notFound,
          errorMessage: notFound ? SCANNER_NOT_FOUND_MESSAGE : (err?.message ?? String(err)),
        });
        return;
      }
      if (!proc || typeof proc.on !== 'function') {
        resolve({
          spawned: false,
          succeeded: false,
          notFound: true,
          errorMessage: SCANNER_NOT_FOUND_MESSAGE,
        });
        return;
      }
      let stdout = '';
      let stderr = '';
      let settled = false;
      const settle = (result: {
        spawned: boolean;
        succeeded: boolean;
        notFound: boolean;
        errorMessage?: string;
      }) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      try {
        proc.stdout?.on('data', (chunk: any) => {
          const text = String(chunk);
          stdout += text;
          Logger.info(`[sonar-scanner] ${text.trim()}`);
        });
        proc.stderr?.on('data', (chunk: any) => {
          const text = String(chunk);
          stderr += text;
          Logger.error(`[sonar-scanner] ${text.trim()}`);
        });
      } catch {
        // ignore listener errors
      }
      proc.on('error', (err: any) => {
        const notFound = isNotFoundError(err);
        Logger.error(`Failed to start ${command}`, err);
        settle({
          spawned: false,
          succeeded: false,
          notFound,
          errorMessage: notFound ? SCANNER_NOT_FOUND_MESSAGE : (err?.message ?? String(err)),
        });
      });
      proc.on('close', (code: number) => {
        void stdout;
        if (code === 0) {
          Logger.info(`[sonar-scanner] ${command} completed successfully.`);
          settle({ spawned: true, succeeded: true, notFound: false });
        } else {
          const lastLine = stderr
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .pop();
          settle({
            spawned: true,
            succeeded: false,
            notFound: false,
            errorMessage: lastLine ?? `${command} failed with exit code ${code}.`,
          });
        }
      });
    });
  }
}

function isNotFoundError(err: any): boolean {
  const code = err?.code;
  if (code === 'ENOENT') {
    return true;
  }
  const message = String(err?.message ?? err ?? '');
  return /not found|ENOENT|spawn .* ENOENT/i.test(message);
}
