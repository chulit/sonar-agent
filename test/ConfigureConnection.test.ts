import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { SonarOverviewViewProvider } from '../src/modules/SonarOverviewViewProvider.js';
import { ProjectDetector } from '../src/modules/ProjectDetector.js';
import { SonarClient } from '../src/modules/SonarClient.js';

describe('SonarOverviewViewProvider - promptConfigureConnection', () => {
  let mockProjectDetector: any;
  let mockConfig: any;
  let mockToken: string | undefined;
  let provider: SonarOverviewViewProvider;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      serverUrl: 'http://localhost:9000',
      projectKey: 'org.sample:project',
      hasToken: true,
    };
    mockToken = 'sqp_valid_token_123';

    mockProjectDetector = {
      getConfig: vi.fn(async () => ({ ...mockConfig })),
      getToken: vi.fn(async () => mockToken),
      setServerUrl: vi.fn(async (url: string) => {
        mockConfig.serverUrl = url;
      }),
      setToken: vi.fn(async (token: string) => {
        mockToken = token;
        mockConfig.hasToken = true;
      }),
      deleteToken: vi.fn(async () => {
        mockToken = undefined;
        mockConfig.hasToken = false;
      }),
      setProjectKey: vi.fn(async (key: string) => {
        mockConfig.projectKey = key;
      }),
    };

    provider = new SonarOverviewViewProvider(
      { fsPath: '/extension' } as any,
      mockProjectDetector as unknown as ProjectDetector,
    );
  });

  it('should show QuickPick with connected status and disconnect option when connected', async () => {
    let capturedItems: any[] = [];
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
      capturedItems = items;
      return undefined; // simulate dismiss
    });

    await provider.promptConfigureConnection();

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    expect(capturedItems).toHaveLength(4);
    expect(capturedItems[0].label).toContain('Update Server URL & Token');
    expect(capturedItems[0].description).toBe('Connected');
    expect(capturedItems[0].detail).toContain('http://localhost:9000');

    expect(capturedItems[1].label).toContain('Select Sonar Project');
    expect(capturedItems[1].description).toBe('Active');
    expect(capturedItems[1].detail).toContain('org.sample:project');

    expect(capturedItems[2].label).toContain('Open Extension Settings');
    expect(capturedItems[3].label).toContain('Disconnect & Reset Credentials');
  });

  it('should show QuickPick with disconnected status and omit disconnect option when not connected', async () => {
    mockConfig.serverUrl = '';
    mockToken = undefined;

    let capturedItems: any[] = [];
    vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
      capturedItems = items;
      return undefined;
    });

    await provider.promptConfigureConnection();

    expect(capturedItems).toHaveLength(3);
    expect(capturedItems[0].description).toBe('Not connected');
    expect(capturedItems.some((i) => i.action === 'disconnect')).toBe(false);
  });

  it('should delegate to promptProjectSelection when Select Sonar Project is chosen', async () => {
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'Select Sonar Project',
      action: 'selectProject',
    } as any);

    const projectSelectionSpy = vi.spyOn(provider, 'promptProjectSelection').mockResolvedValue();

    await provider.promptConfigureConnection();

    expect(projectSelectionSpy).toHaveBeenCalled();
  });

  it('should execute openSettings command when Open Extension Settings is chosen', async () => {
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'Open Extension Settings',
      action: 'openSettings',
    } as any);

    const execCommandSpy = vi.spyOn(vscode.commands, 'executeCommand');

    await provider.promptConfigureConnection();

    expect(execCommandSpy).toHaveBeenCalledWith(
      'workbench.action.openSettings',
      '@ext:sonar-agent',
    );
  });

  it('should execute resetConnection command when Disconnect is chosen', async () => {
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'Disconnect',
      action: 'disconnect',
    } as any);

    const execCommandSpy = vi.spyOn(vscode.commands, 'executeCommand');

    await provider.promptConfigureConnection();

    expect(execCommandSpy).toHaveBeenCalledWith('sonarAgent.resetConnection');
  });

  it('should successfully update Server URL and Token after live verification', async () => {
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'Update Server URL & Token',
      action: 'updateCredentials',
    } as any);

    vi.spyOn(vscode.window, 'showInputBox')
      .mockResolvedValueOnce('https://sonar.mycompany.com') // 1/2 Server URL
      .mockResolvedValueOnce('sqp_new_token_999'); // 2/2 Token

    vi.spyOn(SonarClient.prototype, 'verifyConnection').mockResolvedValue({
      ok: true,
      serverVersion: '10.3',
    });

    const refreshSpy = vi.spyOn(provider, 'refresh').mockResolvedValue();
    const infoSpy = vi.spyOn(vscode.window, 'showInformationMessage');

    await provider.promptConfigureConnection();

    expect(mockProjectDetector.setServerUrl).toHaveBeenCalledWith('https://sonar.mycompany.com');
    expect(mockProjectDetector.setToken).toHaveBeenCalledWith('sqp_new_token_999');
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('successfully verified and saved'),
    );
    expect(refreshSpy).toHaveBeenCalled();
  });

  it('should prompt for project selection if projectKey is not set after successful verification', async () => {
    mockConfig.projectKey = '';

    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'Update Server URL & Token',
      action: 'updateCredentials',
    } as any);

    vi.spyOn(vscode.window, 'showInputBox')
      .mockResolvedValueOnce('https://sonar.mycompany.com')
      .mockResolvedValueOnce('sqp_new_token_999');

    vi.spyOn(SonarClient.prototype, 'verifyConnection').mockResolvedValue({
      ok: true,
    });

    const projectPickerSpy = vi.spyOn(provider, 'promptProjectSelection').mockResolvedValue();

    await provider.promptConfigureConnection();

    expect(projectPickerSpy).toHaveBeenCalled();
  });

  it('should handle verification failure with Cancel without modifying credentials', async () => {
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'Update Server URL & Token',
      action: 'updateCredentials',
    } as any);

    vi.spyOn(vscode.window, 'showInputBox')
      .mockResolvedValueOnce('https://sonar.invalid.host')
      .mockResolvedValueOnce('bad_token');

    vi.spyOn(SonarClient.prototype, 'verifyConnection').mockResolvedValue({
      ok: false,
      message: 'HTTP 401 Unauthorized',
    });

    vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue('Cancel' as any);

    await provider.promptConfigureConnection();

    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 401 Unauthorized'),
      'Retry',
      'Cancel',
    );
    expect(mockProjectDetector.setServerUrl).not.toHaveBeenCalled();
    expect(mockProjectDetector.setToken).not.toHaveBeenCalled();
  });

  it('should handle verification failure with Retry allowing re-entry', async () => {
    vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'Update Server URL & Token',
      action: 'updateCredentials',
    } as any);

    vi.spyOn(vscode.window, 'showInputBox')
      .mockResolvedValueOnce('https://sonar.bad.com') // 1st try URL
      .mockResolvedValueOnce('bad_token') // 1st try Token
      .mockResolvedValueOnce('https://sonar.good.com') // 2nd try URL
      .mockResolvedValueOnce('good_token'); // 2nd try Token

    vi.spyOn(SonarClient.prototype, 'verifyConnection')
      .mockResolvedValueOnce({
        ok: false,
        message: 'Invalid credentials',
      })
      .mockResolvedValueOnce({
        ok: true,
      });

    vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue('Retry' as any);

    await provider.promptConfigureConnection();

    expect(mockProjectDetector.setServerUrl).toHaveBeenCalledWith('https://sonar.good.com');
    expect(mockProjectDetector.setToken).toHaveBeenCalledWith('good_token');
  });

  it('should validate URL input format in showInputBox', async () => {
    let capturedValidateFn: any;
    vi.spyOn(vscode.window, 'showInputBox').mockImplementation(async (opts: any) => {
      capturedValidateFn = opts?.validateInput;
      return undefined; // abort
    });

    await provider.promptUpdateCredentials();

    expect(capturedValidateFn).toBeDefined();
    expect(capturedValidateFn('')).toBe('Server URL is required');
    expect(capturedValidateFn('ftp://localhost')).toBe(
      'Server URL must start with http:// or https://',
    );
    expect(capturedValidateFn('http://localhost:9000')).toBeNull();
    expect(capturedValidateFn('https://sonarcloud.io')).toBeNull();
  });
});
