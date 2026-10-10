import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { FileNavigator } from '../src/modules/FileNavigator.js';

describe('FileNavigator - Path Resolution', () => {
  it('should resolve exact relative path when file exists in workspace', async () => {
    const fileExistsFn = vi.fn().mockImplementation(async (p: string) => {
      return p === '/my-workspace/src/app.ts';
    });

    const navigator = new FileNavigator({
      workspaceRoot: '/my-workspace',
      fileExistsFn,
    });

    const resolved = await navigator.resolveFilePath('src/app.ts');
    expect(resolved).toBe('/my-workspace/src/app.ts');
    expect(fileExistsFn).toHaveBeenCalledWith('/my-workspace/src/app.ts');
  });

  it('should fallback to search by basename when relative path has module prefix', async () => {
    const fileExistsFn = vi.fn().mockResolvedValue(false);
    const findFilesFn = vi.fn().mockResolvedValue(['/my-workspace/packages/core/src/app.ts']);

    const navigator = new FileNavigator({
      workspaceRoot: '/my-workspace',
      fileExistsFn,
      findFilesFn,
    });

    const resolved = await navigator.resolveFilePath('sonar-module/src/app.ts');
    expect(resolved).toBe('/my-workspace/packages/core/src/app.ts');
    expect(findFilesFn).toHaveBeenCalledWith('**/app.ts');
  });

  it('should return null if file cannot be found anywhere', async () => {
    const fileExistsFn = vi.fn().mockResolvedValue(false);
    const findFilesFn = vi.fn().mockResolvedValue([]);

    const navigator = new FileNavigator({
      workspaceRoot: '/my-workspace',
      fileExistsFn,
      findFilesFn,
    });

    const resolved = await navigator.resolveFilePath('non-existent.ts');
    expect(resolved).toBeNull();
  });

  it('handles absolute paths and missing workspaceRoot', async () => {
    const fileExistsFn = vi.fn().mockResolvedValue(true);
    const navigator = new FileNavigator({
      workspaceRoot: '/my-workspace',
      fileExistsFn,
    });
    const resolved = await navigator.resolveFilePath('/var/log/app.ts');
    expect(resolved).toBe('/var/log/app.ts');

    const prevFolders = vscode.workspace.workspaceFolders;
    (vscode.workspace as any).workspaceFolders = undefined;
    try {
      const noRootNavigator = new FileNavigator({ workspaceRoot: undefined });
      expect(await noRootNavigator.resolveFilePath('src/app.ts')).toBeNull();
    } finally {
      (vscode.workspace as any).workspaceFolders = prevFolders;
    }
  });

  it('openFileAtLine navigates to file with or without line, and handles errors', async () => {
    const navigator = new FileNavigator({
      workspaceRoot: '/my-workspace',
      fileExistsFn: vi.fn().mockResolvedValue(true),
    });

    // Success with line
    const successWithLine = await navigator.openFileAtLine('src/app.ts', 15);
    expect(successWithLine).toBe(true);

    // Success without line
    const successNoLine = await navigator.openFileAtLine('src/app.ts');
    expect(successNoLine).toBe(true);

    // File not resolved
    const notFoundNav = new FileNavigator({
      workspaceRoot: '/my-workspace',
      fileExistsFn: vi.fn().mockResolvedValue(false),
      findFilesFn: vi.fn().mockResolvedValue([]),
    });
    const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage');
    const notFoundRes = await notFoundNav.openFileAtLine('missing.ts', 10);
    expect(notFoundRes).toBe(false);
    expect(warnSpy).toHaveBeenCalled();

    // openTextDocument throws error
    vi.spyOn(vscode.workspace, 'openTextDocument').mockRejectedValueOnce(
      new Error('Permission denied'),
    );
    const errSpy = vi.spyOn(vscode.window, 'showErrorMessage');
    const errRes = await navigator.openFileAtLine('src/app.ts', 5);
    expect(errRes).toBe(false);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
  });

  it('default fileExistsFn checks actual filesystem', async () => {
    const defaultNav = new FileNavigator({ workspaceRoot: process.cwd() });
    const exists = await (defaultNav as any).fileExistsFn('package.json');
    expect(exists).toBe(true);

    const notExists = await (defaultNav as any).fileExistsFn('non-existent-file-xyz.txt');
    expect(notExists).toBe(false);
  });

  it('default findFilesFn delegates to vscode.workspace.findFiles', async () => {
    const nav = new FileNavigator({ workspaceRoot: '/my-workspace' });
    vi.spyOn(vscode.workspace, 'findFiles').mockResolvedValueOnce([
      { fsPath: '/my-workspace/src/app.ts' },
    ] as any);
    const files = await (nav as any).findFilesFn('**/*.ts');
    expect(files).toEqual(['/my-workspace/src/app.ts']);
  });
});
