import * as vscode from 'vscode';
import { SonarDetailItem } from './SonarClient.js';

export interface FileIssueAggregatorOptions {
  getCachedIssuesFn?: () => SonarDetailItem[];
  getDiagnosticsFn?: (uri: vscode.Uri) => vscode.Diagnostic[];
  asRelativePathFn?: (uri: vscode.Uri | string) => string;
}

function extractRuleKey(code: vscode.Diagnostic['code']): string {
  if (code === undefined || code === null) {
    return 'sonarlint:unknown';
  }
  if (typeof code === 'object') {
    return String((code as { value: string | number }).value);
  }
  return String(code);
}

function mapDiagnosticSeverity(severity?: vscode.DiagnosticSeverity): SonarDetailItem['severity'] {
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

export function normalizeFilePath(p?: string): string {
  if (!p) return '';
  let normalized = p.replaceAll('\\', '/').replace(/^\.\//, '').trim();

  // Strip project key prefix in SonarQube component keys, e.g. "my-project:src/index.ts"
  // Avoid stripping Windows drive letter (e.g. "C:/path")
  const colonIdx = normalized.indexOf(':');
  if (colonIdx > 1 && !/^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized.slice(colonIdx + 1);
  }

  return normalized.replace(/^\/+/, '');
}

export class FileIssueAggregator {
  private readonly getCachedIssuesFn: () => SonarDetailItem[];
  private readonly getDiagnosticsFn: (uri: vscode.Uri) => vscode.Diagnostic[];
  private readonly asRelativePathFn: (uri: vscode.Uri | string) => string;

  constructor(options?: FileIssueAggregatorOptions) {
    this.getCachedIssuesFn = options?.getCachedIssuesFn ?? (() => []);
    this.getDiagnosticsFn =
      options?.getDiagnosticsFn ??
      ((uri: vscode.Uri) => {
        try {
          return vscode.languages.getDiagnostics(uri);
        } catch {
          return [];
        }
      });
    this.asRelativePathFn =
      options?.asRelativePathFn ??
      ((uri: vscode.Uri | string) => {
        try {
          if (typeof uri === 'string') {
            return vscode.workspace.asRelativePath(uri);
          }
          return vscode.workspace.asRelativePath(uri);
        } catch {
          if (typeof uri === 'string') return uri;
          return uri.fsPath || uri.path || '';
        }
      });
  }

  private resolveUri(documentOrUri: vscode.TextDocument | vscode.Uri | string): vscode.Uri {
    if (typeof documentOrUri === 'string') {
      return vscode.Uri.file(documentOrUri);
    }
    if ('uri' in documentOrUri) {
      return documentOrUri.uri;
    }
    return documentOrUri;
  }

  /**
   * Aggregates all Sonar issues for the given text document or URI.
   * Performs a hybrid lookup:
   * 1. Matches against cached Sonar issues by relative file path.
   * 2. If no cached issues are found, falls back to active editor diagnostics
   *    filtered by source containing 'sonar'.
   */
  aggregateIssuesForDocument(
    documentOrUri: vscode.TextDocument | vscode.Uri | string,
  ): SonarDetailItem[] {
    const uri = this.resolveUri(documentOrUri);

    const relativePath = this.asRelativePathFn(uri);
    const normalizedTarget = normalizeFilePath(relativePath);

    // 1. Check cached issues
    const cached = this.getCachedIssuesFn();
    const matchedCached = this.findMatchingCachedIssues(normalizedTarget, cached);
    if (matchedCached.length > 0) {
      return matchedCached;
    }

    // 2. Fall back to active editor Sonar diagnostics
    return this.extractSonarDiagnostics(uri, relativePath);
  }

  findMatchingCachedIssues(
    normalizedTarget: string,
    cachedIssues: SonarDetailItem[],
  ): SonarDetailItem[] {
    if (!normalizedTarget || !cachedIssues || cachedIssues.length === 0) {
      return [];
    }

    return cachedIssues.filter((item) => {
      const itemFile = normalizeFilePath(item.filePath || item.component);
      if (!itemFile) return false;
      return (
        itemFile === normalizedTarget ||
        itemFile.endsWith(`/${normalizedTarget}`) ||
        normalizedTarget.endsWith(`/${itemFile}`)
      );
    });
  }

  extractSonarDiagnostics(uri: vscode.Uri, relativePath: string): SonarDetailItem[] {
    let diagnostics: vscode.Diagnostic[];
    try {
      diagnostics = this.getDiagnosticsFn(uri) ?? [];
    } catch {
      return [];
    }

    const items: SonarDetailItem[] = [];
    for (const diagnostic of diagnostics) {
      const source = diagnostic.source?.toLowerCase() || '';
      if (!source.includes('sonar')) {
        continue;
      }

      const ruleKey = extractRuleKey(diagnostic.code);
      const line = diagnostic.range.start.line + 1;
      const severity = mapDiagnosticSeverity(diagnostic.severity);

      items.push({
        id: `${relativePath}:${line}:${ruleKey}:${diagnostic.message.slice(0, 32)}`,
        ruleKey,
        message: diagnostic.message,
        component: relativePath,
        filePath: relativePath,
        line,
        type: 'CODE_SMELL',
        severity,
        status: 'OPEN',
        tags: ['sonar'],
        creationDate: new Date().toISOString(),
      });
    }

    return items;
  }
}
