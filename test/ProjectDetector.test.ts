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

  it('should synchronously check configuration state via isConfiguredSync', async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    expect(detector.isConfiguredSync()).toBe(false);

    mockConfig['serverUrl'] = 'http://sonar.example.com';
    expect(detector.isConfiguredSync()).toBe(true);

    await detector.setToken('my-token');
    expect(detector.isConfiguredSync()).toBe(true);

    await detector.deleteToken();
    expect(detector.isConfiguredSync()).toBe(false);
  });
});

describe('ProjectDetector - Connection Profiles', () => {
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

  it('should create profiles with slugified ids and round-trip list/activate/rename/delete', async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    const created = await detector.createProfile({
      name: 'Kantor Prod',
      serverUrl: 'http://sonar:9000',
      projectKey: 'org:api',
      token: 'tok-1',
    });
    expect(created.id).toBe('kantor-prod');
    expect(await detector.listProfiles()).toHaveLength(1);
    expect((await detector.getActiveProfile())?.id).toBe('kantor-prod');

    await detector.createProfile({ name: 'Second', serverUrl: 'http://x', projectKey: 'k2' });
    expect(await detector.listProfiles()).toHaveLength(2);

    await detector.activateProfile(created.id);
    await detector.renameProfile(created.id, 'Kantor Production');
    expect((await detector.getActiveProfile())?.name).toBe('Kantor Production');

    await detector.deleteProfile(created.id);
    expect(await detector.listProfiles()).toHaveLength(1);
  });

  it('should resolve getConfig/getToken from the active profile only with per-profile secret isolation', async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    const alpha = await detector.createProfile({
      name: 'Alpha',
      serverUrl: 'http://a:9000',
      projectKey: 'a:key',
      token: 'tok-alpha',
    });
    await detector.createProfile({
      name: 'Beta',
      serverUrl: 'http://b:9000',
      projectKey: 'b:key',
      token: 'tok-beta',
    });

    await detector.activateProfile(alpha.id);
    expect((await detector.getConfig()).serverUrl).toBe('http://a:9000');
    expect(await detector.getToken()).toBe('tok-alpha');

    await detector.activateProfile('beta');
    expect((await detector.getConfig()).projectKey).toBe('b:key');
    expect(await detector.getToken()).toBe('tok-beta');

    expect(mockSecrets['sonarAgent.token.beta']).toBe('tok-beta');
    expect(mockSecrets['sonarAgent.token']).toBeUndefined();
  });

  it('should update token and target on a profile without exposing tokens in listings', async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    const created = await detector.createProfile({
      name: 'Gamma',
      serverUrl: 'http://g:9000',
      projectKey: 'g:key',
    });
    await detector.updateProfileToken(created.id, 'tok-g');
    await detector.updateProfileTarget(created.id, {
      serverUrl: 'http://g2:9000',
      projectKey: 'g:key2',
    });

    await detector.activateProfile(created.id);
    expect(await detector.getToken()).toBe('tok-g');
    expect((await detector.getConfig()).serverUrl).toBe('http://g2:9000');
    const listed = await detector.listProfiles();
    expect((listed[0] as any).token).toBeUndefined();
  });
});

describe('ProjectDetector - Reset Migration and Properties-as-Suggestion', () => {
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

  it('should delete the legacy token and clear legacy settings once, then report false', async () => {
    mockSecrets['sonarAgent.token'] = 'legacy-token';
    mockConfig['serverUrl'] = 'http://old:9000';
    mockConfig['projectKey'] = 'old:key';
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });

    expect(await detector.migrateResetIfLegacy()).toBe(true);
    expect(mockSecrets['sonarAgent.token']).toBeUndefined();
    expect(secretStorage.delete).toHaveBeenCalledWith('sonarAgent.token');
    expect(await detector.getToken()).toBeUndefined();
    expect((await detector.getConfig()).serverUrl).toBe('');
    expect((await detector.getConfig()).projectKey).toBe('');

    expect(await detector.migrateResetIfLegacy()).toBe(false);
  });

  it('should return false when no legacy connection exists', async () => {
    const detector = new ProjectDetector({ secretStorage, workspaceConfig });
    expect(await detector.migrateResetIfLegacy()).toBe(false);
  });

  it('should keep the active profile stable despite a properties file being present', async () => {
    const detector = new ProjectDetector({
      secretStorage,
      workspaceConfig,
      workspaceRoot: '/ws',
      readFileFn: async () => 'sonar.projectKey=props:key\nsonar.host.url=http://props:9000\n',
    });
    await detector.createProfile({
      name: 'A',
      serverUrl: 'http://a:9000',
      projectKey: 'a:key',
      token: 't',
    });

    const config = await detector.getConfig();
    expect(config.serverUrl).toBe('http://a:9000');
    expect(config.projectKey).toBe('a:key');
    expect(config.detectedFromProperties).toBe(false);
  });

  it('should return suggestion values from the properties file without applying them', async () => {
    const detector = new ProjectDetector({
      secretStorage,
      workspaceConfig,
      workspaceRoot: '/ws',
      readFileFn: async () =>
        'sonar.projectKey=sug:key\nsonar.host.url=http://sug:9000\nsonar.token=squ_secret\n',
    });

    const suggestion = await detector.getCreationSuggestion();
    expect(suggestion.serverUrl).toBe('http://sug:9000');
    expect(suggestion.projectKey).toBe('sug:key');
    expect(suggestion.hasPlaintextCredentials).toBe(true);
    expect((await detector.getConfig()).projectKey).toBe('');
  });
});
