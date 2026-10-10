import * as path from 'node:path';
import * as vscode from 'vscode';
import { SonarDetailItem } from './SonarClient.js';
import { Logger } from './Logger.js';

export interface GitStageGuardOptions {
  workspaceRoot?: string;
  getCachedIssuesFn: () => SonarDetailItem[];
  dispatchBatchFn: (issues: SonarDetailItem[]) => Promise<{ ok: boolean; message: string }>;
  gitApiAccessor?: () => Promise<any>;
  isEnabledFn?: () => boolean;
  showWarningMessageFn?: (
    message: string,
    ...items: string[]
  ) => Promise<string | undefined> | Thenable<string | undefined>;
  showInformationMessageFn?: (
    message: string,
    ...items: string[]
  ) => Promise<string | undefined> | Thenable<string | undefined>;
}

export class GitStageGuard implements vscode.Disposable {
  private readonly workspaceRoot?: string;
  private readonly getCachedIssuesFn: () => SonarDetailItem[];
  private readonly dispatchBatchFn: (
    issues: SonarDetailItem[],
  ) => Promise<{ ok: boolean; message: string }>;
  private readonly gitApiAccessor: () => Promise<any>;
  private readonly isEnabledFn: () => boolean;
  private readonly showWarningMessageFn: (
    message: string,
    ...items: string[]
  ) => Promise<string | undefined> | Thenable<string | undefined>;
  private readonly showInformationMessageFn: (
    message: string,
    ...items: string[]
  ) => Promise<string | undefined> | Thenable<string | undefined>;

  private disposables: vscode.Disposable[] = [];
  private lastCheckedStagedFilesKey = '';
  private isChecking = false;
  private debounceTimer?: NodeJS.Timeout;

  constructor(options: GitStageGuardOptions) {
    this.workspaceRoot =
      options.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.getCachedIssuesFn = options.getCachedIssuesFn;
    this.dispatchBatchFn = options.dispatchBatchFn;
    this.isEnabledFn =
      options.isEnabledFn ??
      (() =>
        vscode.workspace.getConfiguration('sonarAgent').get<boolean>('gitGuard.enabled', true));
    this.showWarningMessageFn =
      options.showWarningMessageFn ??
      ((msg: string, ...items: string[]) =>
        Promise.resolve(vscode.window.showWarningMessage(msg, ...items)));
    this.showInformationMessageFn =
      options.showInformationMessageFn ??
      ((msg: string, ...items: string[]) =>
        Promise.resolve(vscode.window.showInformationMessage(msg, ...items)));

    this.gitApiAccessor =
      options.gitApiAccessor ??
      (async () => {
        try {
          const gitExtension = vscode.extensions.getExtension('vscode.git');
          if (!gitExtension) {
            return undefined;
          }
          if (!gitExtension.isActive) {
            await gitExtension.activate();
          }
          return gitExtension.exports.getAPI(1);
        } catch (err) {
          Logger.warn(`[GitStageGuard] Failed to acquire Git extension API: ${err}`);
          return undefined;
        }
      });
  }

  public isEnabled(): boolean {
    return this.isEnabledFn();
  }

  public async initialize(): Promise<void> {
    const git = await this.gitApiAccessor();
    if (!git || !git.repositories) {
      return;
    }

    const bindRepository = (repo: any) => {
      if (!repo || !repo.state) {
        return;
      }
      const sub = repo.state.onDidChange(() => {
        if (!this.isEnabled()) {
          return;
        }
        if (this.debounceTimer) {
          clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
          void this.checkStagedFiles(false);
        }, 300);
      });
      this.disposables.push(sub);
    };

    for (const repo of git.repositories) {
      bindRepository(repo);
    }

    if (git.onDidOpenRepository) {
      this.disposables.push(
        git.onDidOpenRepository((repo: any) => {
          bindRepository(repo);
        }),
      );
    }
  }

  /**
   * Retrieves staged file paths from all discovered git repositories.
   */
  public async getStagedFilePaths(): Promise<string[]> {
    const git = await this.gitApiAccessor();
    if (!git || !git.repositories) {
      return [];
    }

    const stagedPaths: string[] = [];
    for (const repo of git.repositories) {
      const changes = repo.state?.indexChanges || [];
      for (const change of changes) {
        if (change.uri?.fsPath) {
          stagedPaths.push(change.uri.fsPath);
        }
      }
    }
    return stagedPaths;
  }

  /**
   * Checks if staged files contain Sonar issues from local cache.
   * If interactive=true, always shows feedback (clean/none/issues).
   */
  public async checkStagedFiles(
    interactive = false,
  ): Promise<{ stagedFileCount: number; issueCount: number; issues: SonarDetailItem[] }> {
    if (!interactive && !this.isEnabled()) {
      return { stagedFileCount: 0, issueCount: 0, issues: [] };
    }

    if (this.isChecking) {
      return { stagedFileCount: 0, issueCount: 0, issues: [] };
    }

    this.isChecking = true;
    try {
      const stagedFiles = await this.getStagedFilePaths();
      if (stagedFiles.length === 0) {
        if (interactive) {
          await this.showInformationMessageFn('No staged git files detected.');
        }
        this.lastCheckedStagedFilesKey = '';
        return { stagedFileCount: 0, issueCount: 0, issues: [] };
      }

      const filesKey = stagedFiles.slice().sort().join(';');
      if (!interactive && filesKey === this.lastCheckedStagedFilesKey) {
        return { stagedFileCount: stagedFiles.length, issueCount: 0, issues: [] };
      }
      this.lastCheckedStagedFilesKey = filesKey;

      const cachedIssues = this.getCachedIssuesFn();
      const matchedIssues: SonarDetailItem[] = [];

      for (const issue of cachedIssues) {
        if (!issue.filePath) {
          continue;
        }
        const normalizedIssuePath = path.normalize(issue.filePath);
        const matches = stagedFiles.some((staged) => {
          const normalizedStaged = path.normalize(staged);
          return (
            normalizedStaged === normalizedIssuePath ||
            normalizedStaged.endsWith(normalizedIssuePath) ||
            (this.workspaceRoot &&
              normalizedStaged === path.normalize(path.join(this.workspaceRoot, issue.filePath)))
          );
        });

        if (matches) {
          matchedIssues.push(issue);
        }
      }

      if (matchedIssues.length === 0) {
        if (interactive) {
          await this.showInformationMessageFn('All staged files are clean of Sonar issues!');
        }
        return { stagedFileCount: stagedFiles.length, issueCount: 0, issues: [] };
      }

      const count = matchedIssues.length;
      const warningMsg = `⚠️ Staged files contain ${count} unresolved Sonar issue${
        count > 1 ? 's' : ''
      }. Clean before pushing?`;

      const choice = await this.showWarningMessageFn(
        warningMsg,
        'Clean Staged Files with AI',
        'Ignore',
      );

      if (choice === 'Clean Staged Files with AI') {
        await this.dispatchBatchFn(matchedIssues);
      }

      return {
        stagedFileCount: stagedFiles.length,
        issueCount: matchedIssues.length,
        issues: matchedIssues,
      };
    } finally {
      this.isChecking = false;
    }
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
