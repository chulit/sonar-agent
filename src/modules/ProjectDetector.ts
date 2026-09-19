export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
  store(key: string, value: string): Thenable<void> | Promise<void>;
  delete(key: string): Thenable<void> | Promise<void>;
}

export interface WorkspaceConfigLike {
  get<T>(section: string, defaultValue?: T): T;
  update(section: string, value: any, configurationTarget?: boolean | number): Thenable<void> | Promise<void>;
}

export interface ProjectDetectorOptions {
  secretStorage: SecretStorageLike;
  workspaceConfig: WorkspaceConfigLike;
  workspaceRoot?: string;
}

export interface ResolvedProjectConfig {
  serverUrl: string;
  projectKey: string;
  hasToken: boolean;
}

const TOKEN_SECRET_KEY = "sonarAgent.token";

export class ProjectDetector {
  private readonly secrets: SecretStorageLike;
  private readonly config: WorkspaceConfigLike;
  private readonly workspaceRoot?: string;

  constructor(options: ProjectDetectorOptions) {
    this.secrets = options.secretStorage;
    this.config = options.workspaceConfig;
    this.workspaceRoot = options.workspaceRoot;
  }

  async getToken(): Promise<string | undefined> {
    return this.secrets.get(TOKEN_SECRET_KEY);
  }

  async setToken(token: string): Promise<void> {
    await this.secrets.store(TOKEN_SECRET_KEY, token);
  }

  async deleteToken(): Promise<void> {
    await this.secrets.delete(TOKEN_SECRET_KEY);
  }

  async setServerUrl(url: string): Promise<void> {
    await this.config.update("serverUrl", url, true);
  }

  async setProjectKey(projectKey: string): Promise<void> {
    await this.config.update("projectKey", projectKey, true);
  }

  async getConfig(): Promise<ResolvedProjectConfig> {
    const serverUrl = this.config.get<string>("serverUrl", "");
    const projectKey = this.config.get<string>("projectKey", "");
    const token = await this.getToken();

    return {
      serverUrl,
      projectKey,
      hasToken: Boolean(token && token.trim().length > 0),
    };
  }
}
