import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
  store(key: string, value: string): Thenable<void> | Promise<void>;
  delete(key: string): Thenable<void> | Promise<void>;
}

export interface WorkspaceConfigLike {
  get<T>(section: string, defaultValue?: T): T;
  update(
    section: string,
    value: any,
    configurationTarget?: boolean | number,
  ): Thenable<void> | Promise<void>;
}

export interface ProjectDetectorOptions {
  secretStorage: SecretStorageLike;
  workspaceConfig: WorkspaceConfigLike;
  workspaceRoot?: string;
  readFileFn?: (filePath: string) => Promise<string>;
}

export interface ParsedSonarProperties {
  projectKey?: string;
  serverUrl?: string;
  hasPlaintextCredentials: boolean;
}

export interface ResolvedProjectConfig {
  serverUrl: string;
  projectKey: string;
  hasToken: boolean;
  detectedFromProperties?: boolean;
  hasPlaintextCredentialsWarning?: boolean;
}

export interface ConnectionProfileMeta {
  id: string;
  name: string;
  serverUrl: string;
  projectKey: string;
  updatedAt: number;
}

export interface CreateProfileInput {
  name: string;
  serverUrl: string;
  projectKey: string;
  token?: string;
}

export interface UpdateProfileTargetInput {
  serverUrl?: string;
  projectKey?: string;
}

export interface CreationSuggestion {
  serverUrl?: string;
  projectKey?: string;
  hasPlaintextCredentials: boolean;
}

const TOKEN_SECRET_KEY = 'sonarAgent.token';
const PROFILES_CONFIG_KEY = 'profiles';
const ACTIVE_PROFILE_CONFIG_KEY = 'activeProfileId';

const tokenKeyFor = (id: string): string => `${TOKEN_SECRET_KEY}.${id}`;

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'profile';
}

export class ProjectDetector {
  private readonly secrets: SecretStorageLike;
  private readonly config: WorkspaceConfigLike;
  private readonly workspaceRoot?: string;
  private readonly readFileFn: (filePath: string) => Promise<string>;

  private activeProjectKey?: string;
  private activeServerUrl?: string;
  private activeToken?: string | null;
  private readonly profileTokenCache = new Map<string, string | null>();

  constructor(options: ProjectDetectorOptions) {
    this.secrets = options.secretStorage;
    this.config = options.workspaceConfig;
    this.workspaceRoot = options.workspaceRoot;
    this.readFileFn = options.readFileFn ?? ((p: string) => fs.readFile(p, 'utf-8'));
  }

  /**
   * Safely parses sonar-project.properties content without leaking credentials.
   */
  public static parseProperties(content: string): ParsedSonarProperties {
    const lines = content.split(/\r?\n/);
    let projectKey: string | undefined;
    let serverUrl: string | undefined;
    let hasPlaintextCredentials = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || line.startsWith(';')) {
        continue;
      }

      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();

      if (key === 'sonar.projectKey') {
        projectKey = value;
      } else if (key === 'sonar.host.url') {
        serverUrl = value;
      } else if (key === 'sonar.login' || key === 'sonar.password' || key === 'sonar.token') {
        hasPlaintextCredentials = true;
      }
    }

    return {
      projectKey,
      serverUrl,
      hasPlaintextCredentials,
    };
  }

  private readProfiles(): ConnectionProfileMeta[] {
    return this.config.get<ConnectionProfileMeta[]>(PROFILES_CONFIG_KEY, []);
  }

  private readActiveId(): string | undefined {
    return this.config.get<string | undefined>(ACTIVE_PROFILE_CONFIG_KEY, undefined) || undefined;
  }

  private async persistProfiles(
    profiles: ConnectionProfileMeta[],
    activeProfileId?: string,
  ): Promise<void> {
    await this.config.update(PROFILES_CONFIG_KEY, profiles, true);
    await this.config.update(ACTIVE_PROFILE_CONFIG_KEY, activeProfileId ?? '', true);
  }

  async listProfiles(): Promise<ConnectionProfileMeta[]> {
    return this.readProfiles().map((p) => ({ ...p }));
  }

  async getActiveProfile(): Promise<ConnectionProfileMeta | null> {
    const id = this.readActiveId();
    if (!id) {
      return null;
    }
    return this.readProfiles().find((p) => p.id === id) ?? null;
  }

  async createProfile(input: CreateProfileInput): Promise<ConnectionProfileMeta> {
    const profiles = this.readProfiles();
    const taken = new Set(profiles.map((p) => p.id));
    const base = slugify(input.name);
    let id = base;
    let n = 2;
    while (taken.has(id)) {
      id = `${base}-${n++}`;
    }
    const meta: ConnectionProfileMeta = {
      id,
      name: input.name.trim(),
      serverUrl: input.serverUrl.trim(),
      projectKey: input.projectKey.trim(),
      updatedAt: Date.now(),
    };
    await this.persistProfiles([...profiles, meta], id);
    if (input.token !== undefined) {
      await this.updateProfileToken(id, input.token);
    }
    return { ...meta };
  }

  async activateProfile(id: string): Promise<void> {
    const found = this.readProfiles().find((p) => p.id === id);
    if (!found) {
      throw new Error(`Unknown connection profile: ${id}`);
    }
    await this.config.update(ACTIVE_PROFILE_CONFIG_KEY, id, true);
  }

  async updateProfileToken(id: string, token: string): Promise<void> {
    if (!this.readProfiles().some((p) => p.id === id)) {
      throw new Error(`Unknown connection profile: ${id}`);
    }
    const trimmed = token.trim();
    this.profileTokenCache.set(id, trimmed);
    await this.secrets.store(tokenKeyFor(id), trimmed);
  }

  async renameProfile(id: string, name: string): Promise<ConnectionProfileMeta> {
    const profiles = this.readProfiles();
    const next = profiles.map((p) =>
      p.id === id ? { ...p, name: name.trim(), updatedAt: Date.now() } : p,
    );
    await this.persistProfiles(next, this.readActiveId());
    const renamed = next.find((p) => p.id === id);
    if (!renamed) {
      throw new Error(`Unknown connection profile: ${id}`);
    }
    return { ...renamed };
  }

  async deleteProfile(id: string): Promise<void> {
    const profiles = this.readProfiles().filter((p) => p.id !== id);
    const activeId = this.readActiveId();
    await this.persistProfiles(profiles, activeId === id ? '' : activeId);
    this.profileTokenCache.delete(id);
    await this.secrets.delete(tokenKeyFor(id));
  }

  async updateProfileTarget(
    id: string,
    target: UpdateProfileTargetInput,
  ): Promise<ConnectionProfileMeta> {
    const profiles = this.readProfiles();
    const next = profiles.map((p) =>
      p.id === id
        ? {
            ...p,
            serverUrl: target.serverUrl !== undefined ? target.serverUrl.trim() : p.serverUrl,
            projectKey: target.projectKey !== undefined ? target.projectKey.trim() : p.projectKey,
            updatedAt: Date.now(),
          }
        : p,
    );
    await this.persistProfiles(next, this.readActiveId());
    const updated = next.find((p) => p.id === id);
    if (!updated) {
      throw new Error(`Unknown connection profile: ${id}`);
    }
    return { ...updated };
  }

  private hasProfiles(): boolean {
    return this.readProfiles().length > 0;
  }

  async getToken(): Promise<string | undefined> {
    if (this.hasProfiles()) {
      const active = await this.getActiveProfile();
      if (!active) {
        return undefined;
      }
      const cached = this.profileTokenCache.get(active.id);
      if (cached !== undefined) {
        return cached || undefined;
      }
      const stored = await this.secrets.get(tokenKeyFor(active.id));
      const normalized = stored ? stored.trim() : null;
      this.profileTokenCache.set(active.id, normalized);
      return normalized ?? undefined;
    }
    if (this.activeToken !== undefined) {
      return this.activeToken ?? undefined;
    }
    const stored = await this.secrets.get(TOKEN_SECRET_KEY);
    this.activeToken = stored ? stored.trim() : null;
    return this.activeToken ?? undefined;
  }

  async setToken(token: string): Promise<void> {
    if (this.hasProfiles()) {
      const active = await this.getActiveProfile();
      if (active) {
        await this.updateProfileToken(active.id, token);
        return;
      }
    }
    this.activeToken = token.trim();
    await this.secrets.store(TOKEN_SECRET_KEY, this.activeToken);
  }

  async deleteToken(): Promise<void> {
    if (this.hasProfiles()) {
      const active = await this.getActiveProfile();
      if (active) {
        this.profileTokenCache.delete(active.id);
        await this.secrets.delete(tokenKeyFor(active.id));
        return;
      }
    }
    this.activeToken = null;
    await this.secrets.delete(TOKEN_SECRET_KEY);
  }

  async setServerUrl(url: string): Promise<void> {
    if (this.hasProfiles()) {
      const active = await this.getActiveProfile();
      if (active) {
        await this.updateProfileTarget(active.id, { serverUrl: url });
        return;
      }
    }
    this.activeServerUrl = url.trim();
    await this.config.update('serverUrl', this.activeServerUrl, true);
  }

  async setProjectKey(projectKey: string): Promise<void> {
    if (this.hasProfiles()) {
      const active = await this.getActiveProfile();
      if (active) {
        await this.updateProfileTarget(active.id, { projectKey });
        return;
      }
    }
    this.activeProjectKey = projectKey.trim();
    await this.config.update('projectKey', this.activeProjectKey, true);
  }

  isConfiguredSync(): boolean {
    if (this.hasProfiles()) {
      const active = this.readProfiles().find((p) => p.id === this.readActiveId());
      if (!active?.serverUrl) {
        return false;
      }
      const cached = this.profileTokenCache.get(active.id);
      return cached !== undefined ? Boolean(active.serverUrl && cached) : true;
    }
    const serverUrl = this.activeServerUrl ?? this.config.get<string>('serverUrl', '');
    if (this.activeToken !== undefined) {
      return Boolean(serverUrl && this.activeToken);
    }
    return Boolean(serverUrl);
  }

  async detectWorkspaceProperties(): Promise<ParsedSonarProperties | null> {
    if (!this.workspaceRoot) {
      return null;
    }

    const propertiesPath = path.join(this.workspaceRoot, 'sonar-project.properties');
    try {
      const content = await this.readFileFn(propertiesPath);
      return ProjectDetector.parseProperties(content);
    } catch {
      return null;
    }
  }

  async getCreationSuggestion(): Promise<CreationSuggestion> {
    const detected = await this.detectWorkspaceProperties();
    return {
      serverUrl: detected?.serverUrl,
      projectKey: detected?.projectKey,
      hasPlaintextCredentials: detected?.hasPlaintextCredentials ?? false,
    };
  }

  async migrateResetIfLegacy(): Promise<boolean> {
    const legacyToken = await this.secrets.get(TOKEN_SECRET_KEY);
    const serverUrl = this.activeServerUrl ?? this.config.get<string>('serverUrl', '');
    const projectKey = this.activeProjectKey ?? this.config.get<string>('projectKey', '');
    if (!((legacyToken && legacyToken.trim()) || serverUrl || projectKey)) {
      return false;
    }
    this.activeToken = null;
    this.activeServerUrl = undefined;
    this.activeProjectKey = undefined;
    await this.secrets.delete(TOKEN_SECRET_KEY);
    await this.config.update('serverUrl', undefined, true);
    await this.config.update('projectKey', undefined, true);
    return true;
  }

  async getConfig(): Promise<ResolvedProjectConfig> {
    if (this.hasProfiles()) {
      const active = await this.getActiveProfile();
      if (!active) {
        return {
          serverUrl: '',
          projectKey: '',
          hasToken: false,
          detectedFromProperties: false,
        };
      }
      const token = await this.getToken();
      return {
        serverUrl: active.serverUrl,
        projectKey: active.projectKey,
        hasToken: Boolean(token && token.trim().length > 0),
        detectedFromProperties: false,
      };
    }
    const serverUrl = this.activeServerUrl ?? this.config.get<string>('serverUrl', '');
    const projectKey = this.activeProjectKey ?? this.config.get<string>('projectKey', '');

    const token = await this.getToken();

    return {
      serverUrl,
      projectKey,
      hasToken: Boolean(token && token.trim().length > 0),
      detectedFromProperties: false,
      hasPlaintextCredentialsWarning: false,
    };
  }
}
