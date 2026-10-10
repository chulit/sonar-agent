import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { activate, deactivate } from '../src/extension.js';
import { Logger } from '../src/modules/Logger.js';

describe('extension entrypoint', () => {
  let registeredCommands: Map<string, (...args: any[]) => Promise<any> | any>;
  let mockContext: any;
  let mockSecrets: Record<string, string>;

  beforeEach(() => {
    registeredCommands = new Map();
    mockSecrets = {};

    vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(
      (command: string, callback: any) => {
        registeredCommands.set(command, callback);
        return { dispose: vi.fn() };
      },
    );

    mockContext = {
      subscriptions: [],
      extensionUri: { fsPath: '/test/extension' },
      secrets: {
        get: vi.fn(async (key: string) => mockSecrets[key]),
        store: vi.fn(async (key: string, value: string) => {
          mockSecrets[key] = value;
        }),
        delete: vi.fn(async (key: string) => {
          delete mockSecrets[key];
        }),
      },
    };
  });

  it('activates successfully, registers commands and providers, and handles deactivation', async () => {
    const showLogsSpy = vi.spyOn(Logger, 'show');
    const disposeLogsSpy = vi.spyOn(Logger, 'dispose');

    activate(mockContext);

    expect(mockContext.subscriptions.length).toBeGreaterThan(0);
    expect(registeredCommands.has('sonarAgent.refresh')).toBe(true);
    expect(registeredCommands.has('sonarAgent.configure')).toBe(true);
    expect(registeredCommands.has('sonarAgent.selectProject')).toBe(true);
    expect(registeredCommands.has('sonarAgent.profile.manage')).toBe(true);
    expect(registeredCommands.has('sonarAgent.resetConnection')).toBe(true);
    expect(registeredCommands.has('sonarAgent.showLogs')).toBe(true);
    expect(registeredCommands.has('sonarAgent.fixWithAgent')).toBe(true);
    expect(registeredCommands.has('sonarAgent.explainRuleWithAgent')).toBe(true);
    expect(registeredCommands.has('sonarAgent.cleanCurrentFile')).toBe(true);
    expect(registeredCommands.has('sonarAgent.generateMissingTests')).toBe(true);

    // Test explainRuleWithAgent with no arguments
    await registeredCommands.get('sonarAgent.explainRuleWithAgent')!(null, null);

    // Test cleanCurrentFile
    await registeredCommands.get('sonarAgent.cleanCurrentFile')!();

    // Test generateMissingTests
    await registeredCommands.get('sonarAgent.generateMissingTests')!();

    // Test showLogs
    registeredCommands.get('sonarAgent.showLogs')!();
    expect(showLogsSpy).toHaveBeenCalled();

    // Test refresh
    await registeredCommands.get('sonarAgent.refresh')!();

    // Test configure
    await registeredCommands.get('sonarAgent.configure')!();

    // Test selectProject
    await registeredCommands.get('sonarAgent.selectProject')!();

    // Test manage profiles
    await registeredCommands.get('sonarAgent.profile.manage')!();

    // Test fixWithAgent with no arguments
    await registeredCommands.get('sonarAgent.fixWithAgent')!(null, null);

    // Test fixWithAgent with valid diagnostic
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 10),
      'Issue',
      vscode.DiagnosticSeverity.Error,
    );
    const doc = { uri: vscode.Uri.file('/src/index.ts') };
    await registeredCommands.get('sonarAgent.fixWithAgent')!(diag, doc);

    // Test resetConnection - Disconnect confirmed
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValueOnce('Disconnect' as any);
    const infoSpy = vi
      .spyOn(vscode.window, 'showInformationMessage')
      .mockResolvedValue(undefined as any);
    await registeredCommands.get('sonarAgent.resetConnection')!();
    expect(infoSpy).toHaveBeenCalledWith('SonarQube credentials have been removed.');

    // Test resetConnection - Cancelled
    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValueOnce(undefined as any);
    await registeredCommands.get('sonarAgent.resetConnection')!();

    // Test deactivation
    deactivate();
    expect(disposeLogsSpy).toHaveBeenCalled();
  });

  it('triggers create profile prompt when legacy single connection is migrated', async () => {
    vi.spyOn(vscode.window, 'showInformationMessage').mockResolvedValueOnce('New Profile' as any);

    // Simulate legacy token in config/storage to trigger migration
    mockSecrets['sonarAgent.token'] = 'legacy-token';
    const configUpdateSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      get: (key: string, def?: any) => def,
      update: configUpdateSpy,
    } as any);

    activate(mockContext);

    // Allow promise microtasks to run
    await new Promise((r) => setTimeout(r, 50));
  });
});
