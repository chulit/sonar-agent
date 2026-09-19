import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ProjectDetector,
  SecretStorageLike,
  WorkspaceConfigLike,
} from '../src/modules/ProjectDetector.js';

describe('ProjectDetector - Configuration and Secrets', () => {
  let mockSecrets: Record<string, string>;
  let secretStorage: SecretStorageLike;
  let mockConfig: Record<string, any>;
  let workspaceConfig: WorkspaceConfigLike;

  beforeEach(() => {
    mockSecrets = {};
    secretStorage = {
      get: vi.fn(async (key: string) => mockSecrets[key]),
      store: vi.fn(async (key: string, value: string) => {
        mockSecrets[key] = value;
      }),
      delete: vi.fn(async (key: string) => {
        delete mockSecrets[key];
      }),
    };

    mockConfig = {};
    workspaceConfig = {
      get: vi.fn((key: string, defaultValue?: any) => mockConfig[key] ?? defaultValue),
      update: vi.fn(async (key: string, value: any) => {
        mockConfig[key] = value;
      }),
    };
  });

  it('should detect when no serverUrl or token are configured', async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    const config = await detector.getConfig();

    expect(config.serverUrl).toBe('');
    expect(config.hasToken).toBe(false);
  });

  it('should save and retrieve token securely using secret storage and never leak to settings', async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    await detector.setToken('sqp_my_secret_token');

    expect(secretStorage.store).toHaveBeenCalledWith('sonarAgent.token', 'sqp_my_secret_token');
    expect(workspaceConfig.update).not.toHaveBeenCalledWith(
      expect.stringContaining('token'),
      expect.anything(),
      expect.anything(),
    );

    const token = await detector.getToken();
    expect(token).toBe('sqp_my_secret_token');

    const config = await detector.getConfig();
    expect(config.hasToken).toBe(true);
  });

  it('should parse sonar-project.properties correctly', () => {
    const propertiesContent = `
      # SonarQube project configuration
      sonar.projectKey=my-org_my-backend-app
      sonar.projectName=My Backend App
      sonar.host.url=http://sonar.internal:9000
      sonar.sources=src
    `;

    const parsed = ProjectDetector.parseProperties(propertiesContent);
    expect(parsed.projectKey).toBe('my-org_my-backend-app');
    expect(parsed.serverUrl).toBe('http://sonar.internal:9000');
    expect(parsed.hasPlaintextCredentials).toBe(false);
  });

  it('should flag security warning if sonar-project.properties contains plaintext credentials and never export them', () => {
    const dangerousContent = `
      sonar.projectKey=secure-app
      sonar.login=admin
      sonar.password=super_secret_password
      sonar.token=squ_1234567890abcdef
    `;

    const parsed = ProjectDetector.parseProperties(dangerousContent);
    expect(parsed.projectKey).toBe('secure-app');
    expect(parsed.hasPlaintextCredentials).toBe(true);
    // Guarantee no credentials object or properties leaked
    expect((parsed as any).login).toBeUndefined();
    expect((parsed as any).password).toBeUndefined();
    expect((parsed as any).token).toBeUndefined();
  });

  it('should save serverUrl to workspace configuration', async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    await detector.setServerUrl('http://localhost:9000');

    expect(workspaceConfig.update).toHaveBeenCalledWith('serverUrl', 'http://localhost:9000', true);
  });

  it('should clear token on reset', async () => {
    mockSecrets['sonarAgent.token'] = 'existing-token';
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });

    await detector.deleteToken();
    expect(secretStorage.delete).toHaveBeenCalledWith('sonarAgent.token');
    expect(await detector.getToken()).toBeUndefined();
  });
});
