import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { GitStageGuard } from '../src/modules/GitStageGuard.js';
import { SonarDetailItem } from '../src/modules/SonarClient.js';

describe('GitStageGuard', () => {
  const sampleIssues: SonarDetailItem[] = [
    {
      id: 'issue-1',
      ruleKey: 'typescript:S1234',
      message: 'Unused local variable',
      component: 'src/utils/math.ts',
      filePath: 'src/utils/math.ts',
      line: 12,
      type: 'CODE_SMELL',
      severity: 'MINOR',
      status: 'OPEN',
      tags: ['unused'],
      creationDate: '2026-10-09T00:00:00Z',
    },
    {
      id: 'issue-2',
      ruleKey: 'typescript:S5678',
      message: 'Potential null pointer dereference',
      component: 'src/services/api.ts',
      filePath: 'src/services/api.ts',
      line: 45,
      type: 'BUG',
      severity: 'BLOCKER',
      status: 'OPEN',
      tags: ['bug'],
      creationDate: '2026-10-09T00:00:00Z',
    },
  ];

  let mockGitApi: any;
  let mockStateListeners: Array<() => void>;
  let mockWarningMessageFn: any;
  let mockInformationMessageFn: any;
  let mockDispatchBatchFn: any;

  beforeEach(() => {
    mockStateListeners = [];
    mockGitApi = {
      repositories: [
        {
          state: {
            indexChanges: [{ uri: { fsPath: '/workspace/src/utils/math.ts' } }],
            onDidChange: vi.fn((listener) => {
              mockStateListeners.push(listener);
              return { dispose: vi.fn() };
            }),
          },
        },
      ],
    };

    mockWarningMessageFn = vi.fn().mockResolvedValue('Clean Staged Files with AI');
    mockInformationMessageFn = vi.fn().mockResolvedValue(undefined);
    mockDispatchBatchFn = vi.fn().mockResolvedValue({ ok: true, message: 'Batch dispatched' });
  });

  it('respects isEnabledFn and configuration', () => {
    const guardEnabled = new GitStageGuard({
      getCachedIssuesFn: () => sampleIssues,
      dispatchBatchFn: mockDispatchBatchFn,
      isEnabledFn: () => true,
    });
    expect(guardEnabled.isEnabled()).toBe(true);

    const guardDisabled = new GitStageGuard({
      getCachedIssuesFn: () => sampleIssues,
      dispatchBatchFn: mockDispatchBatchFn,
      isEnabledFn: () => false,
    });
    expect(guardDisabled.isEnabled()).toBe(false);
  });

  it('skips background check when disabled', async () => {
    const guard = new GitStageGuard({
      workspaceRoot: '/workspace',
      getCachedIssuesFn: () => sampleIssues,
      dispatchBatchFn: mockDispatchBatchFn,
      gitApiAccessor: async () => mockGitApi,
      isEnabledFn: () => false,
      showWarningMessageFn: mockWarningMessageFn,
    });

    const result = await guard.checkStagedFiles(false);
    expect(result.stagedFileCount).toBe(0);
    expect(mockWarningMessageFn).not.toHaveBeenCalled();
  });

  it('shows information message when manually checked with no staged files', async () => {
    mockGitApi.repositories[0].state.indexChanges = [];

    const guard = new GitStageGuard({
      workspaceRoot: '/workspace',
      getCachedIssuesFn: () => sampleIssues,
      dispatchBatchFn: mockDispatchBatchFn,
      gitApiAccessor: async () => mockGitApi,
      isEnabledFn: () => true,
      showInformationMessageFn: mockInformationMessageFn,
    });

    const result = await guard.checkStagedFiles(true);
    expect(result.stagedFileCount).toBe(0);
    expect(mockInformationMessageFn).toHaveBeenCalledWith(
      expect.stringContaining('No staged git files detected'),
    );
  });

  it('shows information message when manually checked and all staged files are clean', async () => {
    mockGitApi.repositories[0].state.indexChanges = [
      { uri: { fsPath: '/workspace/src/clean/file.ts' } },
    ];

    const guard = new GitStageGuard({
      workspaceRoot: '/workspace',
      getCachedIssuesFn: () => sampleIssues,
      dispatchBatchFn: mockDispatchBatchFn,
      gitApiAccessor: async () => mockGitApi,
      isEnabledFn: () => true,
      showInformationMessageFn: mockInformationMessageFn,
    });

    const result = await guard.checkStagedFiles(true);
    expect(result.stagedFileCount).toBe(1);
    expect(result.issueCount).toBe(0);
    expect(mockInformationMessageFn).toHaveBeenCalledWith(
      expect.stringContaining('clean of Sonar issues'),
    );
  });

  it('detects unresolved issues in staged files and prompts user with action buttons', async () => {
    const guard = new GitStageGuard({
      workspaceRoot: '/workspace',
      getCachedIssuesFn: () => sampleIssues,
      dispatchBatchFn: mockDispatchBatchFn,
      gitApiAccessor: async () => mockGitApi,
      isEnabledFn: () => true,
      showWarningMessageFn: mockWarningMessageFn,
    });

    const result = await guard.checkStagedFiles(true);
    expect(result.issueCount).toBe(1);
    expect(result.issues[0].id).toBe('issue-1');
    expect(mockWarningMessageFn).toHaveBeenCalledWith(
      expect.stringContaining('Staged files contain 1 unresolved Sonar issue'),
      'Clean Staged Files with AI',
      'Ignore',
    );
    expect(mockDispatchBatchFn).toHaveBeenCalledWith([sampleIssues[0]]);
  });

  it('does not dispatch batch if user chooses Ignore', async () => {
    mockWarningMessageFn.mockResolvedValue('Ignore');

    const guard = new GitStageGuard({
      workspaceRoot: '/workspace',
      getCachedIssuesFn: () => sampleIssues,
      dispatchBatchFn: mockDispatchBatchFn,
      gitApiAccessor: async () => mockGitApi,
      isEnabledFn: () => true,
      showWarningMessageFn: mockWarningMessageFn,
    });

    await guard.checkStagedFiles(true);
    expect(mockWarningMessageFn).toHaveBeenCalled();
    expect(mockDispatchBatchFn).not.toHaveBeenCalled();
  });

  it('deduplicates consecutive background checks for the exact same staged files', async () => {
    const guard = new GitStageGuard({
      workspaceRoot: '/workspace',
      getCachedIssuesFn: () => sampleIssues,
      dispatchBatchFn: mockDispatchBatchFn,
      gitApiAccessor: async () => mockGitApi,
      isEnabledFn: () => true,
      showWarningMessageFn: mockWarningMessageFn,
    });

    await guard.checkStagedFiles(false);
    expect(mockWarningMessageFn).toHaveBeenCalledTimes(1);

    // Second check with unchanged staged files should not re-trigger warning
    await guard.checkStagedFiles(false);
    expect(mockWarningMessageFn).toHaveBeenCalledTimes(1);
  });

  it('initializes repository change listeners and handles state events', async () => {
    vi.useFakeTimers();
    try {
      const guard = new GitStageGuard({
        workspaceRoot: '/workspace',
        getCachedIssuesFn: () => sampleIssues,
        dispatchBatchFn: mockDispatchBatchFn,
        gitApiAccessor: async () => mockGitApi,
        isEnabledFn: () => true,
        showWarningMessageFn: mockWarningMessageFn,
      });

      await guard.initialize();
      expect(mockGitApi.repositories[0].state.onDidChange).toHaveBeenCalled();

      // Trigger listener
      mockStateListeners[0]();
      await vi.advanceTimersByTimeAsync(350);

      expect(mockWarningMessageFn).toHaveBeenCalled();
      guard.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
