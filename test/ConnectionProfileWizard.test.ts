import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { ConnectionProfileWizard } from '../src/modules/ConnectionProfileWizard.js';
import { ProjectDetector } from '../src/modules/ProjectDetector.js';

describe('ConnectionProfileWizard', () => {
  let mockProjectDetector: any;
  let mockConfig: any;
  let mockToken: string | undefined;
  let onConfigChangedMock: any;
  let wizard: ConnectionProfileWizard;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      serverUrl: 'http://localhost:9000',
      projectKey: 'org.sample:project',
      hasToken: true,
    };
    mockToken = 'sqp_valid_token_123';
    onConfigChangedMock = vi.fn();

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
      listProfiles: vi.fn(async () => [
        { id: 'p1', name: 'Profile 1', serverUrl: 'http://sonar1:9000', projectKey: 'proj-1' },
        { id: 'p2', name: 'Profile 2', serverUrl: 'http://sonar2:9000', projectKey: 'proj-2' },
      ]),
      activateProfile: vi.fn(async (_id: string) => {}),
      renameProfile: vi.fn(async (_id: string, _name: string) => {}),
      deleteProfile: vi.fn(async (_id: string) => {}),
      createProfile: vi.fn(async (profile: any) => ({ ...profile, id: 'new-profile-id' })),
      getCreationSuggestion: vi.fn(async () => ({
        serverUrl: 'http://localhost:9000',
        projectKey: 'suggested-project',
        hasPlaintextCredentials: true,
      })),
    };

    wizard = new ConnectionProfileWizard({
      projectDetector: mockProjectDetector as unknown as ProjectDetector,
      onConfigChanged: onConfigChangedMock,
    });
  });

  describe('validateServerUrlInput', () => {
    it('should validate URLs properly', () => {
      expect(wizard.validateServerUrlInput('')).toBe('Server URL is required');
      expect(wizard.validateServerUrlInput('ftp://sonar.com')).toBe(
        'Server URL must start with http:// or https://',
      );
      expect(wizard.validateServerUrlInput('http://')).toBe('Please enter a valid URL');
      expect(wizard.validateServerUrlInput('http://localhost:9000')).toBeNull();
      expect(wizard.validateServerUrlInput('https://sonarcloud.io')).toBeNull();
    });
  });

  describe('promptConfigureConnection', () => {
    it('should show quickpick with configuration options', async () => {
      let capturedItems: any[] = [];
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
        capturedItems = items;
        return undefined;
      });

      await wizard.promptConfigureConnection();

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(capturedItems.length).toBeGreaterThanOrEqual(5);
      expect(capturedItems[0].label).toContain('Update Server URL & Token');
      expect(capturedItems[0].description).toBe('Connected');
    });

    it('should execute disconnect command on disconnect action', async () => {
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
        return items.find((i: any) => i.action === 'disconnect');
      });
      const executeCommandSpy = vi
        .spyOn(vscode.commands, 'executeCommand')
        .mockResolvedValue(undefined);

      await wizard.promptConfigureConnection();

      expect(executeCommandSpy).toHaveBeenCalledWith('sonarAgent.resetConnection');
    });

    it('should execute openSettings on openSettings action', async () => {
      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
        return items.find((i: any) => i.action === 'openSettings');
      });
      const executeCommandSpy = vi
        .spyOn(vscode.commands, 'executeCommand')
        .mockResolvedValue(undefined);

      await wizard.promptConfigureConnection();

      expect(executeCommandSpy).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        '@ext:chulit.sonar-agent',
      );
    });
  });

  describe('promptProjectSelection', () => {
    it('should warn if serverUrl or token is not configured', async () => {
      mockConfig.serverUrl = undefined;
      const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

      await wizard.promptProjectSelection();

      expect(warnSpy).toHaveBeenCalledWith('Please connect to SonarQube first.');
    });

    it('should show projects list and update selected projectKey', async () => {
      const mockFetchProjects = vi.fn().mockResolvedValue([
        { key: 'proj-alpha', name: 'Alpha Project' },
        { key: 'proj-beta', name: 'Beta Project' },
      ]);
      const clientFactory = vi.fn().mockReturnValue({
        fetchProjects: mockFetchProjects,
      });

      const customWizard = new ConnectionProfileWizard({
        projectDetector: mockProjectDetector,
        sonarClientFactory: clientFactory,
        onConfigChanged: onConfigChangedMock,
      });

      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
        return items.find((i: any) => i.description === 'proj-beta');
      });

      await customWizard.promptProjectSelection();

      expect(mockProjectDetector.setProjectKey).toHaveBeenCalledWith('proj-beta');
      expect(onConfigChangedMock).toHaveBeenCalled();
    });

    it('should allow manual project key input', async () => {
      const clientFactory = vi.fn().mockReturnValue({
        fetchProjects: vi.fn().mockResolvedValue([]),
      });

      const customWizard = new ConnectionProfileWizard({
        projectDetector: mockProjectDetector,
        sonarClientFactory: clientFactory,
        onConfigChanged: onConfigChangedMock,
      });

      vi.spyOn(vscode.window, 'showQuickPick').mockImplementation(async (items: any) => {
        return items[0]; // manual option
      });
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('manual:custom-key');

      await customWizard.promptProjectSelection();

      expect(mockProjectDetector.setProjectKey).toHaveBeenCalledWith('manual:custom-key');
      expect(onConfigChangedMock).toHaveBeenCalled();
    });
  });

  describe('promptUpdateCredentials', () => {
    it('should update server url and token after successful verification', async () => {
      const clientFactory = vi.fn().mockReturnValue({
        verifyConnection: vi.fn().mockResolvedValue({ ok: true }),
      });

      const customWizard = new ConnectionProfileWizard({
        projectDetector: mockProjectDetector,
        sonarClientFactory: clientFactory,
        onConfigChanged: onConfigChangedMock,
      });

      vi.spyOn(vscode.window, 'showInputBox')
        .mockResolvedValueOnce('https://sonar.company.com') // Server URL
        .mockResolvedValueOnce('sqp_new_secret_token'); // User Token

      await customWizard.promptUpdateCredentials();

      expect(mockProjectDetector.setServerUrl).toHaveBeenCalledWith('https://sonar.company.com');
      expect(mockProjectDetector.setToken).toHaveBeenCalledWith('sqp_new_secret_token');
      expect(onConfigChangedMock).toHaveBeenCalled();
    });

    it('should handle cancel during server url input', async () => {
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValueOnce(undefined);

      await wizard.promptUpdateCredentials();

      expect(mockProjectDetector.setServerUrl).not.toHaveBeenCalled();
      expect(onConfigChangedMock).not.toHaveBeenCalled();
    });
  });

  describe('promptManageProfiles & profile actions', () => {
    it('should switch active profile when selected', async () => {
      vi.spyOn(vscode.window, 'showQuickPick')
        .mockResolvedValueOnce({ action: 'switchProfile' } as any)
        .mockResolvedValueOnce({ description: 'p2', label: 'Profile 2' } as any);

      await wizard.promptManageProfiles();

      expect(mockProjectDetector.activateProfile).toHaveBeenCalledWith('p2');
      expect(onConfigChangedMock).toHaveBeenCalled();
    });

    it('should rename profile', async () => {
      vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
        description: 'p1',
        label: 'Profile 1',
      } as any);
      vi.spyOn(vscode.window, 'showInputBox').mockResolvedValueOnce('Renamed Profile');

      await wizard.runProfileAction('renameProfile');

      expect(mockProjectDetector.renameProfile).toHaveBeenCalledWith('p1', 'Renamed Profile');
      expect(onConfigChangedMock).toHaveBeenCalled();
    });

    it('should delete profile after confirmation', async () => {
      vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce({
        description: 'p1',
        label: 'Profile 1',
      } as any);
      vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValueOnce('Delete' as any);

      await wizard.runProfileAction('deleteProfile');

      expect(mockProjectDetector.deleteProfile).toHaveBeenCalledWith('p1');
      expect(onConfigChangedMock).toHaveBeenCalled();
    });

    it('should verify connection profile', async () => {
      const clientFactory = vi.fn().mockReturnValue({
        verifyConnection: vi.fn().mockResolvedValue({ ok: true }),
      });
      const customWizard = new ConnectionProfileWizard({
        projectDetector: mockProjectDetector,
        sonarClientFactory: clientFactory,
      });

      const infoSpy = vi.spyOn(vscode.window, 'showInformationMessage');
      await customWizard.runProfileAction('verifyConnection');

      expect(infoSpy).toHaveBeenCalledWith('SonarQube connection verified.');
    });
  });

  describe('promptCreateProfile', () => {
    it('should create new profile and notify config changed', async () => {
      const clientFactory = vi.fn().mockReturnValue({
        verifyConnection: vi.fn().mockResolvedValue({ ok: true }),
      });

      const customWizard = new ConnectionProfileWizard({
        projectDetector: mockProjectDetector,
        sonarClientFactory: clientFactory,
        onConfigChanged: onConfigChangedMock,
      });

      vi.spyOn(vscode.window, 'showInputBox')
        .mockResolvedValueOnce('my-profile')
        .mockResolvedValueOnce('https://sonar.internal:9000')
        .mockResolvedValueOnce('sqp_profile_token')
        .mockResolvedValueOnce('proj-key-123');

      await customWizard.promptCreateProfile();

      expect(mockProjectDetector.createProfile).toHaveBeenCalledWith({
        name: 'my-profile',
        serverUrl: 'https://sonar.internal:9000',
        projectKey: 'proj-key-123',
        token: 'sqp_profile_token',
      });
      expect(onConfigChangedMock).toHaveBeenCalled();
    });
  });
});
