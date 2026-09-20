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

const TOKEN_SECRET_KEY = 'sonarAgent.token';

export class ProjectDetector {
  private readonly secrets: SecretStorageLike;
  private readonly config: WorkspaceConfigLike;
  private readonly workspaceRoot?: string;
  private readonly readFileFn: (filePath: string) => Promise<string>;

  private activeProjectKey?: string;
  private activeServerUrl?: string;
  private activeToken?: string | null;

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

  async getToken(): Promise<string | undefined> {
    if (this.activeToken !== undefined) {
      return this.activeToken ?? undefined;
    }
    const stored = await this.secrets.get(TOKEN_SECRET_KEY);
    this.activeToken = stored ? stored.trim() : null;
    return this.activeToken ?? undefined;
  }

  async setToken(token: string): Promise<void> {
    this.activeToken = token.trim();
    await this.secrets.store(TOKEN_SECRET_KEY, this.activeToken);
  }

  async deleteToken(): Promise<void> {
    this.activeToken = null;
    await this.secrets.delete(TOKEN_SECRET_KEY);
  }

  async setServerUrl(url: string): Promise<void> {
    this.activeServerUrl = url.trim();
    await this.config.update('serverUrl', this.activeServerUrl, true);
  }

  async setProjectKey(projectKey: string): Promise<void> {
    this.activeProjectKey = projectKey.trim();
    await this.config.update('projectKey', this.activeProjectKey, true);
  }

  isConfiguredSync(): boolean {
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

  async getConfig(): Promise<ResolvedProjectConfig> {
    let serverUrl = this.activeServerUrl ?? this.config.get<string>('serverUrl', '');
    let projectKey = this.activeProjectKey ?? this.config.get<string>('projectKey', '');
    let detectedFromProperties = false;
    let hasPlaintextCredentialsWarning = false;

    const detected = await this.detectWorkspaceProperties();
    if (detected) {
      if (detected.projectKey) {
        projectKey = detected.projectKey;
        detectedFromProperties = true;
      }
      if (!serverUrl && detected.serverUrl) {
        serverUrl = detected.serverUrl;
      }
      if (detected.hasPlaintextCredentials) {
        hasPlaintextCredentialsWarning = true;
      }
    }

    const token = await this.getToken();

    return {
      serverUrl,
      projectKey,
      hasToken: Boolean(token && token.trim().length > 0),
      detectedFromProperties,
      hasPlaintextCredentialsWarning,
    };
  }
}
